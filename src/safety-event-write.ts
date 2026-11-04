// Shared D1 acceptance boundary for signed child safety events. Queue durability
// remains a separate prerequisite owned by callers, not a D1/Queue transaction.
export type SafetyWrite = {
  id: string; deviceId: string; kind: string; deviceCreatedAt: number; serverCreatedAt: number;
  latitude: number | null; longitude: number | null; accuracyM: number | null; detailJson: string;
};
export async function persistActiveSafetyEvent(db: D1Database, event: SafetyWrite): Promise<"inserted" | "duplicate" | "revoked" | "conflict"> {
  const result = await db.prepare(
    "INSERT OR IGNORE INTO safety_events(id,device_id,kind,device_created_at,server_created_at,latitude,longitude,accuracy_m,detail_json) " +
    "SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9 WHERE EXISTS (SELECT 1 FROM devices WHERE id=?2 AND revoked_at IS NULL)"
  ).bind(event.id,event.deviceId,event.kind,event.deviceCreatedAt,event.serverCreatedAt,event.latitude,event.longitude,event.accuracyM,event.detailJson).run();
  if ((result.meta.changes ?? 0) === 1) return "inserted";
  const life = await db.prepare("SELECT revoked_at FROM devices WHERE id=?1").bind(event.deviceId).first<{ revoked_at: number | null }>();
  if (!life || life.revoked_at !== null) return "revoked";
  const existing = await db.prepare("SELECT device_id,kind FROM safety_events WHERE id=?1").bind(event.id).first<{device_id: string; kind: string}>();
  return existing?.device_id === event.deviceId && existing.kind === event.kind ? "duplicate" : "conflict";
}

export function validSafetyCoordinates(value: Record<string, unknown>): boolean {
  const lat = value.latitude, lon = value.longitude, accuracy = value.accuracyM;
  const missing = (v: unknown) => v === null || v === undefined;
  if (missing(lat) !== missing(lon)) return false;
  if (!missing(lat) && (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90)) return false;
  if (!missing(lon) && (typeof lon !== "number" || !Number.isFinite(lon) || lon < -180 || lon > 180)) return false;
  return missing(accuracy) || typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 100_000;
}
