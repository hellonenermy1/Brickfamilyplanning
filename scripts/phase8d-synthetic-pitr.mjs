// Staged operator drill. No import-time IO. This is NOT a Brick backup/restore adapter.
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

const API = 'https://api.cloudflare.com/client/v4';
const ACCOUNT_SHA = 'f3596e86fd73a8d069151b0e9fd0e08f6bf5a1518fb3066d1db6daf4f4962a83';
const PROTECTED = new Set([
  'd5b40e81f63a6527ce40351c156e9c65c32e04f9ce49940a01eb90b16f61ab08',
  '69b89c4f1d0e1f5aeae9bc48b592f5a4e2d1f364284755c869957edb70838b90',
]);
const sha = s => createHash('sha256').update(s).digest('hex');
const uuid = s => typeof s === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s);
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const bookmark = s => typeof s === 'string' && /^[a-f0-9]{8}-[a-f0-9]{8}-[a-f0-9]{8}-[a-f0-9]{32}$/.test(s);
const fail = code => { throw Error(code); };
const SQL = {
  create: 'CREATE TABLE brick_g1_canary (id TEXT PRIMARY KEY, value TEXT NOT NULL)',
  insert: 'INSERT INTO brick_g1_canary (id,value) VALUES (?,?),(?,?)',
  select: 'SELECT id,value FROM brick_g1_canary ORDER BY id',
  update: 'UPDATE brick_g1_canary SET value=? WHERE id=?',
  delete: 'DELETE FROM brick_g1_canary WHERE id=?',
};

export function syntheticPitrPlan(input) {
  if (!object(input) || Object.keys(input).sort().join(',') !== 'accountId,rtoGoalSeconds,runId,sourceSha'
      || !/^[a-f0-9]{32}$/.test(input.accountId) || sha(input.accountId) !== ACCOUNT_SHA
      || !/^[a-f0-9]{40}$/.test(input.sourceSha)
      || !/^20261111-[a-f0-9]{16}$/.test(input.runId)
      || !Number.isInteger(input.rtoGoalSeconds) || input.rtoGoalSeconds < 60 || input.rtoGoalSeconds > 900)
    fail('PLAN_REFUSED');
  return Object.freeze({ ...input, names: Object.freeze(['primary', 'diagnostics'].map(role => 'brick-g1-' + input.runId + '-' + role)),
    scope: 'NEW_UNBOUND_SYNTHETIC_D1_ONLY', maximumRequests: 44, maximumCreates: 2, maximumRestores: 6,
    retainedAfterRun: true, deletesExistingResources: false, fullBrickRecoveryQualified: false });
}

// Both API and clock are injected only for offline fault testing. The CLI supplies neither.
export async function runSyntheticPitr({plan: input, approved = false, token, request = fetch,
  now = () => performance.now(), timeoutMs = 20000, record = () => {}}) {
  const plan = syntheticPitrPlan(input);
  const result = {format: 'brick-synthetic-d1-pitr-v1', sourceSha: plan.sourceSha, runId: plan.runId,
    scope: plan.scope, status: 'NOT_EXECUTED', fullBrickRecoveryQualified: false,
    requestsMade: 0, plannedNames: [...plan.names], targets: [], events: [], rtoGoalSeconds: plan.rtoGoalSeconds,
    checkpointRowsLost: null, syntheticPairRecoveryMs: null, resourceDeletionAttempted: false};
  if (approved !== true) return result;
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,256}$/.test(token)) return {...result, status: 'BLOCKED', code: 'OPERATOR_DRILL_TOKEN_REQUIRED'};
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 20000) fail('TIMEOUT_REFUSED');
  const started = now();
  let pending = null, lastCall = null, stage = 'START', faultStarted;
  const targets = [];
  async function api(method, suffix, payload, mutates) {
    if (result.requestsMade >= plan.maximumRequests || now() - started > 900000) fail('BUDGET_EXCEEDED');
    const url = API + '/accounts/' + plan.accountId + '/d1/database' + suffix;
    // Only private target handles created by this invocation can produce a suffix.
    const controller = new AbortController();
    let timer, reader;
    pending = {stage, mutation: mutates, requestNumber: ++result.requestsMade, mayHaveBeenSent: false};
    lastCall = pending;
    const startEvent = {...pending, state: 'STARTED'};
    result.events.push(startEvent);
    // CLI fsyncs this sanitized intent before any request. A persistence failure stops dispatch.
    await record(startEvent);
    pending.mayHaveBeenSent = true;
    const work = (async () => {
      const response = await request(url, {method, redirect: 'error', signal: controller.signal,
        headers: {authorization: 'Bearer ' + token, 'content-type': 'application/json'},
        ...(payload === undefined ? {} : {body: JSON.stringify(payload)})});
      if (controller.signal.aborted) fail('REQUEST_TIMEOUT');
      if (response.redirected || response.url && response.url !== url ||
          !(response.status === 200 || method === 'POST' && suffix === '' && response.status === 201)) fail('RESPONSE_REFUSED');
      if (!response.body?.getReader) fail('RESPONSE_REFUSED');
      reader = response.body.getReader();
      let bytes = 0; const chunks = [];
      while (true) {
        const part = await reader.read();
        if (controller.signal.aborted) fail('REQUEST_TIMEOUT');
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 65536) fail('RESPONSE_TOO_LARGE');
        chunks.push(Buffer.from(part.value));
      }
      let envelope;
      try { envelope = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('RESPONSE_REFUSED'); }
      if (!object(envelope) || envelope.success !== true || !Array.isArray(envelope.errors) || envelope.errors.length || !Object.hasOwn(envelope, 'result')) fail('RESPONSE_REFUSED');
      return envelope.result;
    })();
    try {
      const value = await Promise.race([work, new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(Error('REQUEST_TIMEOUT')); }, timeoutMs);
      })]);
      const event = {...pending, state: 'ENVELOPE_ACKNOWLEDGED'};
      result.events.push(event); await record(event); pending = null;
      return value;
    } finally {
      clearTimeout(timer); controller.abort();
      // Cancellation is best effort; no late value can advance this invocation.
      try { const p = reader?.cancel(); p?.catch(() => {}); } catch {}
    }
  }
  async function identity(t) {
    stage = t.role + ':IDENTITY';
    const value = await api('GET', '/' + t.id, undefined, false);
    if (!object(value) || value.uuid !== t.id || value.name !== t.name || value.version !== 'production'
        || value.read_replication?.mode !== 'disabled') fail('TARGET_IDENTITY_REFUSED');
  }
  async function query(t, sql, params = [], mutates = true) {
    if (!Object.values(SQL).includes(sql)) fail('SQL_REFUSED');
    const value = await api('POST', '/' + t.id + '/query', {sql, params}, mutates);
    if (!Array.isArray(value) || value.length !== 1 || !object(value[0]) || value[0].success !== true || !Array.isArray(value[0].results)) fail('QUERY_RESPONSE_REFUSED');
    return value[0].results;
  }
  const baseline = t => [{id: 'a', value: plan.runId + ':' + t.role + ':baseline-a'}, {id: 'b', value: plan.runId + ':' + t.role + ':baseline-b'}];
  async function parity(t, damaged) {
    stage = t.role + (damaged ? ':VERIFY_DAMAGE' : ':VERIFY_CHECKPOINT');
    const rows = await query(t, SQL.select, [], false);
    const expected = damaged ? [{id: 'a', value: 'synthetic-damage'}] : baseline(t);
    // Exact row count, key set, types and values. No provider metadata or arbitrary result logging.
    if (rows.length !== expected.length || rows.some((row, i) => !object(row) || Object.keys(row).sort().join(',') !== 'id,value'
        || row.id !== expected[i].id || row.value !== expected[i].value)) fail('PARITY_REFUSED');
  }
  async function restore(t, point, label) {
    await identity(t); stage = t.role + ':' + label;
    const value = await api('POST', '/' + t.id + '/time_travel/restore?bookmark=' + encodeURIComponent(point), undefined, true);
    if (!object(value) || !bookmark(value.bookmark) || !bookmark(value.previous_bookmark)) fail('RESTORE_RESPONSE_REFUSED');
    await identity(t);
    return value.previous_bookmark;
  }
  try {
    for (const [i, name] of plan.names.entries()) {
      stage = (i ? 'diagnostics' : 'primary') + ':CREATE';
      const value = await api('POST', '', {name, read_replication: {mode: 'disabled'}}, true);
      if (!object(value) || !uuid(value.uuid) || value.name !== name || PROTECTED.has(sha(value.uuid)) || targets.some(t => t.id === value.uuid)) fail('CREATED_TARGET_REFUSED');
      const t = {id: value.uuid, name, role: i ? 'diagnostics' : 'primary'};
      targets.push(t); result.targets.push({role: t.role, name, idSha256: sha(t.id), retained: true});
      await identity(t);
      stage = t.role + ':CREATE_CANARY'; await query(t, SQL.create);
      stage = t.role + ':SEED'; const rows = baseline(t);
      await query(t, SQL.insert, rows.flatMap(row => [row.id, row.value]));
      await parity(t, false);
      stage = t.role + ':CHECKPOINT';
      const point = await api('GET', '/' + t.id + '/time_travel/bookmark', undefined, false);
      if (!object(point) || !bookmark(point.bookmark)) fail('BOOKMARK_REFUSED');
      t.checkpoint = point.bookmark;
    }
    faultStarted = now();
    for (const t of targets) {
      await identity(t);
      stage = t.role + ':SYNTHETIC_UPDATE'; await query(t, SQL.update, ['synthetic-damage', 'a']);
      stage = t.role + ':SYNTHETIC_DELETE'; await query(t, SQL.delete, ['b']);
      await parity(t, true);
    }
    for (const t of targets) {
      t.beforeRestore = await restore(t, t.checkpoint, 'RESTORE_CHECKPOINT');
      await parity(t, false);
    }
    result.syntheticPairRecoveryMs = Math.ceil(now() - faultStarted);
    result.checkpointRowsLost = 0;
    for (const t of targets) {
      await restore(t, t.beforeRestore, 'UNDO_TO_DAMAGED_STATE'); await parity(t, true);
      await restore(t, t.checkpoint, 'RESTORE_CHECKPOINT_AGAIN'); await parity(t, false);
    }
    result.status = result.syntheticPairRecoveryMs <= plan.rtoGoalSeconds * 1000 ? 'SYNTHETIC_SUBGATE_PASSED' : 'SYNTHETIC_RTO_GOAL_MISSED';
    return result;
  } catch (error) {
    // Every failed/uncertain candidate stays isolated. No blind retry, deletion or auto-rollback.
    const known = ['BUDGET_EXCEEDED','REQUEST_TIMEOUT','RESPONSE_REFUSED','RESPONSE_TOO_LARGE','TARGET_IDENTITY_REFUSED',
      'SQL_REFUSED','QUERY_RESPONSE_REFUSED','PARITY_REFUSED','RESTORE_RESPONSE_REFUSED','CREATED_TARGET_REFUSED','BOOKMARK_REFUSED'];
    const invalidMutationReply = ['CREATED_TARGET_REFUSED','QUERY_RESPONSE_REFUSED','RESTORE_RESPONSE_REFUSED'].includes(error?.message) && lastCall?.mutation;
    result.status = pending?.mutation && pending.mayHaveBeenSent || invalidMutationReply ? 'MUTATION_OUTCOME_UNKNOWN' : 'STOPPED_UNQUALIFIED';
    result.code = known.includes(error?.message) ? error.message : 'REQUEST_FAILED';
    result.stoppedAt = stage;
    if (pending) result.events.push({...pending, state: result.status === 'MUTATION_OUTCOME_UNKNOWN' ? 'UNKNOWN_DO_NOT_RETRY' : 'FAILED'});
    return result;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [file, mode, ...extra] = process.argv.slice(2);
    if (!file || extra.length || mode !== undefined && mode !== '--execute-new-synthetic-d1') fail('CLI_REFUSED');
    const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    let input;
    try {
      const stat = fs.fstatSync(descriptor);
      if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) || stat.size > 4096) fail('PRIVATE_PLAN_REQUIRED');
      input = JSON.parse(fs.readFileSync(descriptor, 'utf8'));
    } finally { fs.closeSync(descriptor); }
    const plan = syntheticPitrPlan(input);
    if (mode === undefined) console.log(JSON.stringify(plan));
    else {
      if (process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || process.env.GITHUB_REF_NAME !== 'audit/phase8d-d1-qualification'
          || process.env.GITHUB_SHA !== plan.sourceSha || process.env.BRICK_SYNTHETIC_D1_APPROVED !== plan.runId) fail('EXACT_MANUAL_AUTHORITY_REQUIRED');
      const journal = fs.openSync(file + '.progress.jsonl', fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o600);
      const record = event => { const line = JSON.stringify(event) + '\n'; fs.writeSync(journal,line); fs.fsyncSync(journal); console.error(line.trimEnd()); };
      try {
        record({state:'PLAN', sourceSha:plan.sourceSha, runId:plan.runId, names:plan.names});
        const result = await runSyntheticPitr({plan: input, approved: true, token: process.env.CLOUDFLARE_D1_DRILL_TOKEN, record});
        record({state:'RESULT', status:result.status});
        console.log(JSON.stringify(result)); process.exitCode = result.status === 'SYNTHETIC_SUBGATE_PASSED' ? 0 : 2;
      } finally { fs.closeSync(journal); }
    }
  } catch { console.error('Synthetic D1 drill refused; inspect the private plan and reviewed execution scope.'); process.exitCode = 1; }
}
