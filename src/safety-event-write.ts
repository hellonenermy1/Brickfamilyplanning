// Shared D1 acceptance boundary for signed child safety events. Queue durability
// remains a separate prerequisite owned by callers, not a D1/Queue transaction.
export type SafetyWrite = {
  id: string; deviceId: string; kind: string; deviceCreatedAt: number; serverCreatedAt: number;
  latitude: number | null; longitude: number | null; accuracyM: number | null; detailJson: string;
};
type StoredSafetyWrite = { device_id: string; kind: string; device_created_at: number; latitude: number | null; longitude: number | null; accuracy_m: number | null; detail_json: string };

// Iterative JSON comparison ignores object-key order without recursion/depth risk.
// Array order and every primitive remain significant. Inputs stay bounded by the
// signed route body/detail limits; no content or signature is emitted to logs.
function sameJson(a: unknown, b: unknown): boolean {
  const pending: [unknown, unknown][] = [[a, b]];
  while (pending.length) {
    const [left, right] = pending.pop()!;
    if (left === right) continue;
    if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
    if (Array.isArray(left) !== Array.isArray(right)) return false;
    const l = left as Record<string, unknown>, r = right as Record<string, unknown>;
    const keys = Object.keys(l).sort(), other = Object.keys(r).sort();
    if (keys.length !== other.length || keys.some((key, i) => key !== other[i])) return false;
    for (const key of keys) pending.push([l[key], r[key]]);
  }
  return true;
}

export async function checkSafetyEventIdentity(db: D1Database, event: SafetyWrite): Promise<"absent" | "duplicate" | "revoked" | "conflict"> {
  const existing = await db.prepare("SELECT device_id,kind,device_created_at,latitude,longitude,accuracy_m,detail_json FROM safety_events WHERE id=?1")
    .bind(event.id).first<StoredSafetyWrite>();
  if (!existing) return "absent";
  const life = await db.prepare("SELECT revoked_at FROM devices WHERE id=?1").bind(event.deviceId).first<{ revoked_at: number | null }>();
  if (!life || life.revoked_at !== null) return "revoked";
  if (existing.device_id !== event.deviceId || existing.kind !== event.kind || existing.device_created_at !== event.deviceCreatedAt ||
      existing.latitude !== event.latitude || existing.longitude !== event.longitude || existing.accuracy_m !== event.accuracyM) return "conflict";
  try { return sameJson(JSON.parse(existing.detail_json), JSON.parse(event.detailJson)) ? "duplicate" : "conflict"; }
  catch { return "conflict"; }
}

export async function persistActiveSafetyEvent(db: D1Database, event: SafetyWrite): Promise<"inserted" | "duplicate" | "revoked" | "conflict"> {
  const result = await db.prepare(
    "INSERT OR IGNORE INTO safety_events(id,device_id,kind,device_created_at,server_created_at,latitude,longitude,accuracy_m,detail_json) " +
    "SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9 WHERE EXISTS (SELECT 1 FROM devices WHERE id=?2 AND revoked_at IS NULL)"
  ).bind(event.id,event.deviceId,event.kind,event.deviceCreatedAt,event.serverCreatedAt,event.latitude,event.longitude,event.accuracyM,event.detailJson).run();
  if ((result.meta.changes ?? 0) === 1) return "inserted";
  const life = await db.prepare("SELECT revoked_at FROM devices WHERE id=?1").bind(event.deviceId).first<{ revoked_at: number | null }>();
  if (!life || life.revoked_at !== null) return "revoked";
  const identity = await checkSafetyEventIdentity(db, event);
  return identity === "absent" ? "conflict" : identity;
}

export function validSafetyCoordinates(value: Record<string, unknown>): boolean {
  const lat = value.latitude, lon = value.longitude, accuracy = value.accuracyM;
  const missing = (v: unknown) => v === null || v === undefined;
  if (missing(lat) !== missing(lon)) return false;
  if (!missing(lat) && (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90)) return false;
  if (!missing(lon) && (typeof lon !== "number" || !Number.isFinite(lon) || lon < -180 || lon > 180)) return false;
  return missing(accuracy) || typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 100_000;
}
