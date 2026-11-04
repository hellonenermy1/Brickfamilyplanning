// 8D.14 P8D-027: parent reads may trigger at most one costly R2 commute
// derivation per active device per 10 minutes. The 1-minute cron independently
// rotates through devices and remains the eventual refresh path.
const REFRESH_EVERY_MS = 10 * 60_000;

export async function claimCommuteRefresh(db: D1Database, deviceId: string, now = Date.now()): Promise<boolean> {
  if (typeof deviceId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(deviceId))
    return false;
  const write = await db.prepare(
    "INSERT INTO provider_cache(provider,cache_key,value_json,expires_at,updated_at) " +
    "SELECT 'brick_commute_refresh',?1,'{}',?2,?3 " +
    "WHERE EXISTS (SELECT 1 FROM devices WHERE id=?1 AND revoked_at IS NULL) " +
    "ON CONFLICT(provider,cache_key) DO UPDATE SET " +
    "updated_at=excluded.updated_at,expires_at=excluded.expires_at " +
    "WHERE provider_cache.updated_at<=?4"
  ).bind(deviceId, now + 30 * 86_400_000, now, now - REFRESH_EVERY_MS).run();
  return (write.meta.changes ?? 0) === 1;
}
