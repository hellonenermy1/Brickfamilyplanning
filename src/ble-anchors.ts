import { readBoundedBody } from "./bounded-body";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BLE_ANCHOR_BODY_BYTES = 4096;

export type BleAnchorEnv = { DB: D1Database };
export type BleAnchorConfig = {
  geofenceId: string;
  name: string;
  beaconUuid: string;
  latitude: number;
  longitude: number;
  radiusM: number;
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const uuid = value.trim().toLowerCase();
  return UUID_RE.test(uuid) ? uuid : null;
}

export async function listBleAnchors(env: BleAnchorEnv, deviceId: string): Promise<BleAnchorConfig[]> {
  const rows = await env.DB.prepare(
    `SELECT a.geofence_id,g.name,a.beacon_uuid,g.latitude,g.longitude,g.radius_m
     FROM ble_anchors a JOIN geofences g ON g.id=a.geofence_id
     WHERE a.device_id=?1 AND g.device_id=?1 AND g.enabled=1
     ORDER BY g.created_at`
  ).bind(deviceId).all<{
    geofence_id: string; name: string; beacon_uuid: string; latitude: number; longitude: number; radius_m: number;
  }>();
  return rows.results.map(row => ({
    geofenceId: row.geofence_id,
    name: row.name,
    beaconUuid: row.beacon_uuid,
    latitude: row.latitude,
    longitude: row.longitude,
    radiusM: Math.max(25, row.radius_m)
  }));
}

export async function parentListBleAnchors(env: BleAnchorEnv, deviceId: string) {
  return json({ anchors: await listBleAnchors(env, deviceId) });
}

export async function parentSetBleAnchor(req: Request, env: BleAnchorEnv, deviceId: string) {
  const bounded = await readBoundedBody(req, MAX_BLE_ANCHOR_BODY_BYTES);
  if (!bounded.ok) return json({ error: bounded.reason === "too_large" ? "BLE anchor payload too large" : "invalid BLE anchor body" }, bounded.reason === "too_large" ? 413 : 400);
  let body: Record<string, unknown>;
  try {
    const decoded = JSON.parse(new TextDecoder().decode(bounded.body)) as unknown;
    body = decoded && typeof decoded === "object" && !Array.isArray(decoded) ? decoded as Record<string, unknown> : {};
  } catch { body = {}; }
  const geofenceId = typeof body.geofenceId === "string" ? body.geofenceId.trim() : "";
  const beaconUuid = normalizeUuid(body.beaconUuid);
  if (!geofenceId || geofenceId.length > 64 || !beaconUuid) return json({ error: "invalid BLE anchor" }, 400);
  const place = await env.DB.prepare("SELECT id FROM geofences WHERE id=?1 AND device_id=?2 AND enabled=1")
    .bind(geofenceId, deviceId).first();
  if (!place) return json({ error: "saved place not found" }, 404);
  const now = Date.now();
  try {
    await env.DB.prepare(
      `INSERT INTO ble_anchors(geofence_id,device_id,beacon_uuid,created_at,updated_at)
       VALUES(?1,?2,?3,?4,?4)
       ON CONFLICT(geofence_id) DO UPDATE SET beacon_uuid=excluded.beacon_uuid,updated_at=excluded.updated_at`
    ).bind(geofenceId, deviceId, beaconUuid, now).run();
  } catch {
    return json({ error: "beacon UUID is already assigned to another saved place" }, 409);
  }
  return json({ ok: true, geofenceId, beaconUuid });
}

export async function parentRemoveBleAnchor(env: BleAnchorEnv, deviceId: string, geofenceId: string) {
  const result = await env.DB.prepare("DELETE FROM ble_anchors WHERE geofence_id=?1 AND device_id=?2")
    .bind(geofenceId, deviceId).run();
  if ((result.meta.changes ?? 0) === 0) return json({ error: "BLE anchor not found" }, 404);
  return json({ ok: true });
}
