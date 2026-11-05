// Same D1 table, separate v2 task names: never mix negative in-flight leases with
// the historical claimDevMaintenance() positive-marker protocol during rollout.
export const MAINTENANCE_LEASE_MS = 5 * 60_000;
export async function runMaintenanceTask(db: D1Database, task: string, intervalMs: number, work: () => Promise<void>) {
  const at = Date.now();
  if (!/^[a-z0-9-]{1,60}-v2$/.test(task) || !Number.isSafeInteger(intervalMs) || intervalMs < 60_000 || !Number.isSafeInteger(at) || at <= 0) throw Error('invalid maintenance task');
  const claimed = await db.prepare(
    'INSERT INTO dev_maintenance_state(task,last_run_at) VALUES(?1,?2) ON CONFLICT(task) DO UPDATE SET last_run_at=excluded.last_run_at ' +
    'WHERE (last_run_at>=0 AND last_run_at<=?3) OR (last_run_at<0 AND last_run_at>=?4)'
  ).bind(task, -at, at - intervalMs, -(at - MAINTENANCE_LEASE_MS)).run();
  if (Number(claimed.meta.changes) !== 1) {
    const row = await db.prepare('SELECT last_run_at FROM dev_maintenance_state WHERE task=?1').bind(task).first<{last_run_at:number}>();
    return row && row.last_run_at >= 0 ? 'SKIPPED' as const : 'BUSY' as const;
  }
  try {
    await work();
    const done = await db.prepare('UPDATE dev_maintenance_state SET last_run_at=?1 WHERE task=?2 AND last_run_at=?3').bind(Date.now(), task, -at).run();
    if (Number(done.meta.changes) !== 1) throw Error('maintenance lease lost');
    return 'COMPLETED' as const;
  } catch {
    // If D1 is also unavailable here, the negative lease expires in five minutes,
    // rather than hiding a failed daily operation for24h. Never erase a new owner.
    try { await db.prepare('DELETE FROM dev_maintenance_state WHERE task=?1 AND last_run_at=?2').bind(task, -at).run(); } catch {}
    throw Error('maintenance task failed');
  }
}

export async function awaitScheduledWork(work: (ctx: ExecutionContext) => Promise<void>, parent: ExecutionContext) {
  const pending: Promise<PromiseSettledResult<unknown>>[] = [];
  const scoped = {
    waitUntil(value: Promise<unknown>) {
      // Attach rejection handling immediately; drain later, including nested work.
      pending.push(Promise.resolve(value).then(value => ({ status: 'fulfilled' as const, value }), reason => ({ status: 'rejected' as const, reason })));
    },
    passThroughOnException() { parent.passThroughOnException?.(); }
  } as ExecutionContext;
  let failed = false;
  try { await work(scoped); } catch { failed = true; }
  for (let index = 0; index < pending.length;) {
    const batch = pending.slice(index); index = pending.length;
    const results = await Promise.all(batch);
    if (results.some(result => result.status === 'rejected')) failed = true;
  }
  if (failed) throw Error('scheduled maintenance work failed');
}
