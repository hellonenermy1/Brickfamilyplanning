// Durable during normal D1 operation; provider_cache is intentionally NOT in
// disaster archives. Pending durable inputs reconstruct this operational state.
// No provider payloads, exception messages, location or credentials are stored.
export const BACKGROUND_PROVIDER = 'brick_background_v1';
import {RefinementInputsUnavailable,refinementFrameStatus} from './refinement-work-state';
export const BACKGROUND_TASKS = ['semantic-indexes', 'refinement-scan', 'refinement', 'refined-retention', 'commute-scan', 'commute'] as const;
type Task = typeof BACKGROUND_TASKS[number];
type Receipt = { v: 1; status: 'RUNNING' | 'FAILED' | 'DEGRADED' | 'PENDING' | 'COMPLETED' | 'WAITING'; attempts: number; failures: number;
  lastAttemptAt: number; lastSuccessAt: number | null; nextAttemptAt: number; lease: string | null; errorCode: string | null };
const LEASE_MS = 300_000;
function key(task: Task, subject: string) {
  if (!BACKGROUND_TASKS.includes(task) || !/^[A-Za-z0-9_-]{1,128}$/.test(subject)) throw Error('invalid background identity');
  return task + '/' + subject;
}
function decode(value: string): Receipt {
  let r: Receipt; try { r = JSON.parse(value); } catch { throw Error('invalid background receipt'); }
  if (!r || Object.keys(r).sort().join(',') !== 'attempts,errorCode,failures,lastAttemptAt,lastSuccessAt,lease,nextAttemptAt,status,v' || r.v !== 1 ||
      !['RUNNING','FAILED','DEGRADED','PENDING','COMPLETED','WAITING'].includes(r.status) || !Number.isSafeInteger(r.attempts) || r.attempts < 1 ||
      !Number.isSafeInteger(r.failures) || r.failures < 0 || !Number.isSafeInteger(r.lastAttemptAt) || r.lastAttemptAt <= 0 ||
      !Number.isSafeInteger(r.nextAttemptAt) || r.nextAttemptAt <= 0 ||
      (r.lastSuccessAt !== null && (!Number.isSafeInteger(r.lastSuccessAt) || r.lastSuccessAt <= 0)) ||
      (r.status === 'RUNNING' ? typeof r.lease !== 'string' || !/^[a-f0-9-]{36}$/.test(r.lease) : r.lease !== null) ||
      (r.status === 'FAILED' ? r.errorCode !== 'derived_work_failed' : r.status==='DEGRADED'?r.errorCode!=='derived_inputs_unavailable':r.errorCode !== null)) throw Error('invalid background receipt');
  return r;
}
export async function runBackgroundWork(db: D1Database, task: Task, subject: string, work: () => Promise<unknown>, successIntervalMs = 60_000) {
  const cacheKey = key(task, subject), now = Date.now();
  if (!Number.isSafeInteger(successIntervalMs) || successIntervalMs < 60_000 || successIntervalMs > 86_400_000) throw Error('invalid background interval');
  const previous = await db.prepare('SELECT value_json FROM provider_cache WHERE provider=?1 AND cache_key=?2').bind(BACKGROUND_PROVIDER, cacheKey).first<{value_json: string}>();
  const prior = previous ? decode(previous.value_json) : null;
  if (prior && prior.nextAttemptAt > now) {
    if (prior.status === 'COMPLETED' || prior.status === 'WAITING') return 'SKIPPED' as const;
    // A deferred retry/running peer is not a newly successful maintenance tick.
    throw Error('background work pending');
  }
  const receipt: Receipt = { v: 1, status: 'RUNNING', attempts: Math.min(1_000_000, (prior?.attempts ?? 0) + 1), failures: prior?.failures ?? 0,
    lastAttemptAt: now, lastSuccessAt: prior?.lastSuccessAt ?? null, nextAttemptAt: now + LEASE_MS, lease: crypto.randomUUID(), errorCode: null };
  const claimed = JSON.stringify(receipt), expiry = now + 30 * 86_400_000;
  const claim = await db.prepare(
    'INSERT INTO provider_cache(provider,cache_key,value_json,expires_at,updated_at) ' +
    "SELECT ?1,?2,?3,?4,?5 WHERE ?7='global' OR EXISTS(SELECT 1 FROM devices WHERE id=?7 AND revoked_at IS NULL) " +
    'ON CONFLICT(provider,cache_key) DO UPDATE SET value_json=excluded.value_json,expires_at=excluded.expires_at,updated_at=excluded.updated_at WHERE provider_cache.value_json=?6'
  ).bind(BACKGROUND_PROVIDER, cacheKey, claimed, expiry, now, previous?.value_json ?? null, subject).run();
  if (Number(claim.meta.changes) !== 1) throw Error('background claim unavailable');
  async function finish(value: Receipt) {
    const changed = await db.prepare('UPDATE provider_cache SET value_json=?1,expires_at=?2,updated_at=?3 WHERE provider=?4 AND cache_key=?5 AND value_json=?6')
      .bind(JSON.stringify(value), Date.now() + 30 * 86_400_000, Date.now(), BACKGROUND_PROVIDER, cacheKey, claimed).run();
    if (Number(changed.meta.changes) !== 1) throw Error('background lease lost');
  }
  try {
    const result = await work(), waiting = task === 'refinement' && result === 0;
    const pending=(task==='commute'||task==='refined-retention')&&result!==null&&typeof result==='object'&&'complete' in result&&(result as {complete:unknown}).complete===false;
    await finish({...receipt, status: pending?'PENDING':waiting ? 'WAITING' : 'COMPLETED', failures: 0, lastSuccessAt: waiting||pending ? receipt.lastSuccessAt : Date.now(), nextAttemptAt: Date.now() + successIntervalMs, lease: null});
    return pending?'PENDING' as const:'COMPLETED' as const;
  } catch(error) {
    const failures = Math.min(1_000_000, receipt.failures + 1), retryMs = Math.min(900_000, 60_000 * 2 ** Math.min(4, failures - 1));
    // Frame-level retries/quarantine own poison-input delay. Continue rotating
    // this device's other pending pages each minute instead of backing all off.
    const degraded=error instanceof RefinementInputsUnavailable;
    await finish({...receipt, status: degraded?'DEGRADED':'FAILED', failures, nextAttemptAt: Date.now() + (degraded?60_000:retryMs), lease: null, errorCode: degraded?'derived_inputs_unavailable':'derived_work_failed'});
    throw Error('background work failed');
  }
}

export async function backgroundWorkStatus(db: D1Database, subject: string) {
  key('refinement', subject);
  const identities = [['semantic-indexes','global'],['refinement-scan','global'],['refined-retention','global'],['commute-scan','global'],['refinement',subject],['commute',subject]] as const;
  const rows = await db.prepare('SELECT cache_key,value_json FROM provider_cache WHERE provider=?1 AND cache_key IN (?2,?3,?4,?5,?6,?7)')
    .bind(BACKGROUND_PROVIDER, ...identities.map(([task,id]) => key(task,id))).all<{cache_key:string;value_json:string}>();
  const frames=await refinementFrameStatus(db,subject);
  return identities.map(([task,id]) => {
    const row=rows.results.find(r=>r.cache_key===key(task,id));
    if (!row) return {task,status:'NOT_RUN' as const,...(task==='refinement'?{frames}:{})};
    const {lease, ...receipt}=decode(row.value_json);
    return {task,...receipt,...(task==='refinement'?{frames}:{})};
  });
}
