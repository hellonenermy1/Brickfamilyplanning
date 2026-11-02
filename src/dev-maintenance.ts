export async function claimDevMaintenance(
  db: D1Database,
  task: string,
  intervalMs: number,
  now = Date.now()
) {
  if (!task || task.length > 64 || !Number.isSafeInteger(intervalMs) || intervalMs < 10_000) return false;
  const cutoff = now - intervalMs;
  const result = await db.prepare(
    "INSERT INTO dev_maintenance_state(task,last_run_at) VALUES(?1,?2) " +
    "ON CONFLICT(task) DO UPDATE SET last_run_at=excluded.last_run_at " +
    "WHERE dev_maintenance_state.last_run_at<=?3"
  ).bind(task, now, cutoff).run();
  return Number(result.meta.changes ?? 0) > 0;
}

export function syntheticScheduledController(cron: string, now = Date.now()) {
  return {
    scheduledTime: now,
    cron,
    noRetry() {}
  } as ScheduledController;
}
