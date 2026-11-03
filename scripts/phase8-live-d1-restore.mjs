import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const API = 'https://api.cloudflare.com/client/v4';
const token = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const runId = String(process.env.GITHUB_RUN_ID || Date.now());
const attempt = String(process.env.GITHUB_RUN_ATTEMPT || '1');
const sourceSha = String(process.env.GITHUB_SHA || 'unknown');
const statePath = process.env.BRICK_RESTORE_STATE_PATH || 'phase8-live-restore-state.json';
const evidencePath = process.env.BRICK_RESTORE_EVIDENCE_PATH || 'phase8-live-restore-evidence.json';

if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required');
if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID is required');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function cf(path, init = {}) {
  const response = await fetch(API + path, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers || {})
    },
    signal: AbortSignal.timeout(30_000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    throw new Error(`Cloudflare API ${response.status} ${path}: ${JSON.stringify(body.errors || body)}`);
  }
  return body.result;
}

async function query(databaseId, sql, params = []) {
  const result = await cf(`/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: 'POST',
    body: JSON.stringify({ sql, params })
  });
  assert(Array.isArray(result) && result.every(r => r?.success !== false), 'D1 query batch did not succeed');
  return result;
}

function rows(result) {
  return result.flatMap(r => Array.isArray(r?.results) ? r.results : []);
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])]));
  }
  return value;
}

function canonical(value) {
  return JSON.stringify(normalize(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(canonical(value)).digest('hex');
}

async function snapshot(databaseId) {
  const data = {};
  data.devices = rows(await query(databaseId, 'SELECT device_id, public_key_spki_b64, revoked_at_ms, created_at_ms FROM devices ORDER BY device_id'));
  data.replay = rows(await query(databaseId, 'SELECT device_id, last_location_sequence, last_health_sequence, last_command_sequence FROM device_replay_state ORDER BY device_id'));
  data.locationControl = rows(await query(databaseId, 'SELECT device_id, desired_enabled, command_id, nonce, issued_at_ms, expires_at_ms, last_acked_command_id FROM device_location_control ORDER BY device_id'));
  data.audit = rows(await query(databaseId, 'SELECT id, event_type, subject_id, detail_json, created_at_ms FROM audit_log ORDER BY id'));
  data.indexes = rows(await query(databaseId, "SELECT name, sql FROM sqlite_master WHERE type='index' AND name='idx_devices_public_key_spki_unique'"));
  return data;
}

async function currentBookmark(databaseId) {
  for (let i = 0; i < 20; i++) {
    const result = await cf(`/accounts/${accountId}/d1/database/${databaseId}/time_travel/bookmark`);
    if (typeof result?.bookmark === 'string' && result.bookmark.length > 10) return result.bookmark;
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
  throw new Error('D1 Time Travel bookmark did not become available');
}

const suffix = crypto.createHash('sha256').update(`${runId}:${attempt}:${sourceSha}`).digest('hex').slice(0, 12);
const databaseName = `brick-p8-restore-${runId}-${attempt}-${suffix}`.slice(0, 63);

const created = await cf(`/accounts/${accountId}/d1/database`, {
  method: 'POST',
  body: JSON.stringify({
    name: databaseName,
    primary_location_hint: 'apac',
    read_replication: { mode: 'disabled' }
  })
});
const databaseId = created?.uuid;
assert(typeof databaseId === 'string' && databaseId.length > 20, 'Cloudflare did not return a D1 UUID');
await fs.writeFile(statePath, JSON.stringify({ databaseId, databaseName, accountId, sourceSha }, null, 2));

// This is intentionally a disposable live D1 platform rehearsal. The fixture mirrors Brick's
// critical identity, replay-high-water and one-shot control state without touching production.
const schema = `
CREATE TABLE devices(
  device_id TEXT PRIMARY KEY,
  public_key_spki_b64 TEXT NOT NULL,
  revoked_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_devices_public_key_spki_unique ON devices(public_key_spki_b64);
CREATE TABLE device_replay_state(
  device_id TEXT PRIMARY KEY,
  last_location_sequence INTEGER NOT NULL,
  last_health_sequence INTEGER NOT NULL,
  last_command_sequence INTEGER NOT NULL
);
CREATE TABLE device_location_control(
  device_id TEXT PRIMARY KEY,
  desired_enabled INTEGER NOT NULL,
  command_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  issued_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  last_acked_command_id TEXT
);
CREATE TABLE audit_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);
`;
await query(databaseId, schema);

const seedSql = `
INSERT INTO devices(device_id,public_key_spki_b64,revoked_at_ms,created_at_ms)
VALUES('audit-device-1','brick-audit-spki-1',NULL,1700000000000);
INSERT INTO device_replay_state(device_id,last_location_sequence,last_health_sequence,last_command_sequence)
VALUES('audit-device-1',91234,4567,88);
INSERT INTO device_location_control(device_id,desired_enabled,command_id,nonce,issued_at_ms,expires_at_ms,last_acked_command_id)
VALUES('audit-device-1',1,'cmd-audit-0001','11111111-1111-4111-8111-111111111111',1700000001000,1700000301000,'cmd-audit-0000');
INSERT INTO audit_log(event_type,subject_id,detail_json,created_at_ms)
VALUES('phase8_restore_seed','audit-device-1','{"safe":"fixture"}',1700000002000);
`;
const seedResult = await query(databaseId, seedSql);
const before = await snapshot(databaseId);
const beforeHash = sha256(before);
assert(before.devices.length === 1, 'seed device missing');
assert(before.replay.length === 1, 'seed replay state missing');
assert(before.locationControl.length === 1, 'seed control state missing');
assert(before.audit.length === 1, 'seed audit state missing');
assert(before.indexes.length === 1 && /CREATE\s+UNIQUE\s+INDEX/i.test(String(before.indexes[0]?.sql || '')), 'identity unique index missing before backup');

const bookmark = await currentBookmark(databaseId);

const destructiveSql = `
UPDATE devices SET public_key_spki_b64='corrupted-key', revoked_at_ms=1800000000000 WHERE device_id='audit-device-1';
DELETE FROM device_replay_state WHERE device_id='audit-device-1';
DELETE FROM device_location_control WHERE device_id='audit-device-1';
DELETE FROM audit_log;
INSERT INTO devices(device_id,public_key_spki_b64,revoked_at_ms,created_at_ms)
VALUES('rogue-device','rogue-key',NULL,1800000001000);
`;
const mutationResult = await query(databaseId, destructiveSql);
const mutated = await snapshot(databaseId);
assert(sha256(mutated) !== beforeHash, 'destructive mutation did not change the fixture values');
assert(mutated.devices.length === 2, 'destructive mutation fixture was not applied');
assert(mutated.replay.length === 0 && mutated.locationControl.length === 0 && mutated.audit.length === 0, 'destructive deletes did not apply');

const restore = await cf(`/accounts/${accountId}/d1/database/${databaseId}/time_travel/restore?bookmark=${encodeURIComponent(bookmark)}`, {
  method: 'POST'
});
assert(typeof restore?.previous_bookmark === 'string' && restore.previous_bookmark.length > 10, 'restore did not return an undo bookmark');

let restored = null;
let restoredHash = null;
for (let i = 0; i < 30; i++) {
  try {
    const candidate = await snapshot(databaseId);
    const candidateHash = sha256(candidate);
    if (candidateHash === beforeHash && canonical(candidate) === canonical(before)) {
      restored = candidate;
      restoredHash = candidateHash;
      break;
    }
  } catch {
    // Queries can briefly fail while the destructive restore cancels/restarts in-flight work.
  }
  await new Promise(resolve => setTimeout(resolve, 2_000));
}
assert(restored !== null, 'restored D1 state did not converge exactly to the saved bookmark');
assert(restoredHash === beforeHash, 'restored D1 snapshot hash does not equal the pre-mutation snapshot hash');

const info = await cf(`/accounts/${accountId}/d1/database/${databaseId}`);
const queryMeta = [...seedResult, ...mutationResult].map(r => r?.meta || {});
const totals = queryMeta.reduce((acc, meta) => {
  acc.rowsRead += Number(meta.rows_read || 0);
  acc.rowsWritten += Number(meta.rows_written || 0);
  acc.sqlDurationMs += Number(meta?.timings?.sql_duration_ms || 0);
  acc.maxSizeAfter = Math.max(acc.maxSizeAfter, Number(meta.size_after || 0));
  return acc;
}, { rowsRead: 0, rowsWritten: 0, sqlDurationMs: 0, maxSizeAfter: 0 });

const evidence = {
  version: 2,
  sourceGitSha: sourceSha,
  runId,
  runAttempt: attempt,
  databaseName,
  databaseId,
  databaseVersion: info?.version || created?.version || null,
  bookmark,
  restoreBookmark: restore?.bookmark || null,
  undoBookmark: restore?.previous_bookmark || null,
  beforeSnapshotSha256: beforeHash,
  restoredSnapshotSha256: restoredHash,
  exactStateComparison: restoredHash === beforeHash && canonical(restored) === canonical(before),
  restoredCriticalClasses: ['device_identity', 'replay_high_water', 'location_control', 'audit_log', 'unique_identity_index'],
  operationMetrics: totals,
  databaseFileSizeBytes: Number(info?.file_size || 0),
  fixtureOnly: true,
  productionDatabaseTouched: false,
  cleanupRequired: true
};
await fs.writeFile(evidencePath, JSON.stringify(evidence, null, 2));
console.log('Phase 8 disposable live D1 Time Travel restore rehearsal passed with exact deep state equality.');
