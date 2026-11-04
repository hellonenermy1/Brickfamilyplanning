// Phase 8D.18: bounded, fair, durable scheduled commute refresh selection.
// Cursor is operational/ephemeral: a reset only repeats an idempotent refresh.
const PROVIDER = "brick_commute_scheduler";
const KEY = "cursor";
const MAX_PER_TICK = 20;

function previousId(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const decoded: unknown = JSON.parse(value);
    return typeof decoded === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(decoded) ? decoded : "";
  } catch { return ""; }
}

export async function nextCommuteRefreshCandidates(db: D1Database, limit = MAX_PER_TICK, now = Date.now()): Promise<string[]> {
  const safeLimit = Math.max(1, Math.min(MAX_PER_TICK, Math.trunc(limit)));
  if (!Number.isFinite(safeLimit)) throw new Error("invalid scheduled commute limit");
  const prior = await db.prepare("SELECT value_json FROM provider_cache WHERE provider=?1 AND cache_key=?2")
    .bind(PROVIDER, KEY).first<{ value_json: string }>();
  const cursor = previousId(prior?.value_json);
  const first = await db.prepare(
    "SELECT id FROM devices WHERE revoked_at IS NULL AND id>?1 ORDER BY id LIMIT ?2"
  ).bind(cursor, safeLimit).all<{ id: string }>();
  const result = first.results.map(row => row.id);
  if (result.length < safeLimit && cursor) {
    const wrapped = await db.prepare(
      "SELECT id FROM devices WHERE revoked_at IS NULL AND id<=?1 ORDER BY id LIMIT ?2"
    ).bind(cursor, safeLimit - result.length).all<{ id: string }>();
    result.push(...wrapped.results.map(row => row.id));
  }
  if (!result.length) return [];
  // Persist advancement BEFORE launching bounded background work. Failed/partial refreshes
  // will be retried on a later rotation without permanently starving any device.
  await db.prepare(
    "INSERT INTO provider_cache(provider,cache_key,value_json,expires_at,updated_at) VALUES(?1,?2,?3,?4,?5) " +
    "ON CONFLICT(provider,cache_key) DO UPDATE SET value_json=excluded.value_json,expires_at=excluded.expires_at,updated_at=excluded.updated_at"
  ).bind(PROVIDER, KEY, JSON.stringify(result[result.length - 1]), now + 365 * 86_400_000, now).run();
  return result;
}
