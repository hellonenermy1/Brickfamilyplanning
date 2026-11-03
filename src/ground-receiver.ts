import { readBoundedBody } from "./bounded-body";
import { verifyDeviceSignature } from "./crypto";
import { conservativeBleAllowanceM, WITNESS_ALIAS_RE, WITNESS_CLOCK_GRACE_MS } from "./phase5-evidence";

const MAX_REQUEST_BYTES = 2_048;
const RECEIVER_ID_RE = /^[A-Za-z0-9._:-]{3,64}$/;
const SIGHTING_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BACKLOG_WINDOW_MS = 14 * 24 * 60 * 60_000;

type RateLimit = { limit(input: { key: string }): Promise<{ success: boolean }> };
export type GroundReceiverEnv = { DB: D1Database; DEVICE_RATE: RateLimit };
type ReceiverRow = {
  device_id: string;
  latitude: number | null;
  longitude: number | null;
  radius_m: number | null;
  public_key_spki_b64: string | null;
  enabled: number;
};
type ExistingRow = { payload_sha256: string; resolved: number; child_device_id: string | null };
type AliasRow = { child_device_id: string };

export type GroundSightingRequest = {
  protocol: 1;
  sightingId: string;
  alias: string;
  observedWallMs: number;
  rssi: number;
  txPower: number | null;
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function isInt(v: unknown): v is number { return typeof v === "number" && Number.isSafeInteger(v); }
function isObject(v: unknown): v is Record<string, unknown> { return Boolean(v) && typeof v === "object" && !Array.isArray(v); }

export function parseGroundSighting(body: ArrayBuffer): GroundSightingRequest {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  const raw = JSON.parse(text) as unknown;
  if (!isObject(raw)) throw new Error("invalid ground sighting JSON");
  const allowed = new Set(["protocol", "sightingId", "alias", "observedWallMs", "rssi", "txPower"]);
  if (Object.keys(raw).some(key => !allowed.has(key))) throw new Error("unexpected ground sighting field");
  if (raw.protocol !== 1) throw new Error("invalid ground sighting protocol");
  if (typeof raw.sightingId !== "string" || !SIGHTING_ID_RE.test(raw.sightingId)) throw new Error("invalid ground sighting id");
  if (typeof raw.alias !== "string" || !WITNESS_ALIAS_RE.test(raw.alias)) throw new Error("invalid ground alias");
  if (!isInt(raw.observedWallMs) || raw.observedWallMs <= 0) throw new Error("invalid ground observation time");
  if (!isInt(raw.rssi) || raw.rssi < -127 || raw.rssi > 20) throw new Error("invalid ground RSSI");
  if (raw.txPower !== undefined && raw.txPower !== null && (!isInt(raw.txPower) || raw.txPower < -127 || raw.txPower > 20)) {
    throw new Error("invalid ground tx power");
  }
  return {
    protocol: 1,
    sightingId: raw.sightingId,
    alias: raw.alias,
    observedWallMs: raw.observedWallMs,
    rssi: raw.rssi,
    txPower: raw.txPower === undefined || raw.txPower === null ? null : raw.txPower as number
  };
}

export function groundUncertaintyM(receiverRadiusM: number, rssi: number): number {
  if (!Number.isFinite(receiverRadiusM) || receiverRadiusM < 1 || receiverRadiusM > 5_000) throw new Error("invalid receiver radius");
  return Math.min(10_000, Math.max(35, receiverRadiusM + conservativeBleAllowanceM(rssi)));
}

async function sha256Bytes(body: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", body);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function attemptKey(req: Request) {
  const ip = (req.headers.get("CF-Connecting-IP") ?? "").trim();
  return `ground-attempt:${ip && ip.length <= 64 ? ip : "unknown"}`;
}

async function receiver(env: GroundReceiverEnv, id: string): Promise<ReceiverRow | null> {
  const row = await env.DB.prepare(
    "SELECT device_id,latitude,longitude,radius_m,public_key_spki_b64,enabled FROM ground_receivers WHERE id=?1 LIMIT 1"
  ).bind(id).first<ReceiverRow>();
  if (!row || row.enabled !== 1 || !row.public_key_spki_b64) return null;
  if (row.latitude === null || !Number.isFinite(row.latitude) || row.latitude < -90 || row.latitude > 90) return null;
  if (row.longitude === null || !Number.isFinite(row.longitude) || row.longitude < -180 || row.longitude > 180) return null;
  if (row.radius_m === null || !Number.isFinite(row.radius_m) || row.radius_m < 1 || row.radius_m > 5_000) return null;
  return row;
}

export async function handleGroundReceiverRequest(req: Request, env: GroundReceiverEnv, receiverId: string): Promise<Response> {
  if (!RECEIVER_ID_RE.test(receiverId)) return json({ error: "invalid receiver path" }, 400);
  const attempt = await env.DEVICE_RATE.limit({ key: attemptKey(req) });
  if (!attempt.success) return json({ error: "rate limited" }, 429);

  const configured = await receiver(env, receiverId);
  if (!configured) return json({ error: "receiver unauthorized" }, 401);
  const contentType = (req.headers.get("Content-Type") ?? "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return json({ error: "unsupported ground content type" }, 415);
  const signature = req.headers.get("X-Brick-Receiver-Signature");
  if (!signature || signature.length > 512) return json({ error: "missing or invalid receiver signature" }, 401);

  const bounded = await readBoundedBody(req, MAX_REQUEST_BYTES);
  if (!bounded.ok) return bounded.reason === "too_large" ? json({ error: "ground sighting too large" }, 413) : json({ error: "could not read ground sighting" }, 400);
  if (!bounded.body.byteLength) return json({ error: "empty ground sighting" }, 400);
  if (!(await verifyDeviceSignature(configured.public_key_spki_b64!, bounded.body, signature))) return json({ error: "bad receiver signature" }, 401);

  const authenticatedRate = await env.DEVICE_RATE.limit({ key: `ground-receiver:${receiverId}` });
  if (!authenticatedRate.success) return json({ error: "rate limited" }, 429);

  let sighting: GroundSightingRequest;
  try { sighting = parseGroundSighting(bounded.body); }
  catch (error) { return json({ error: String(error) }, 400); }

  const now = Date.now();
  if (sighting.observedWallMs > now + 5 * 60_000 || sighting.observedWallMs < now - BACKLOG_WINDOW_MS) {
    return json({ error: "ground sighting outside durable time window" }, 409);
  }
  const hash = await sha256Bytes(bounded.body);
  const existing = await env.DB.prepare(
    "SELECT payload_sha256,resolved,child_device_id FROM ground_sightings WHERE receiver_id=?1 AND sighting_id=?2 LIMIT 1"
  ).bind(receiverId, sighting.sightingId).first<ExistingRow>();
  if (existing) {
    if (existing.payload_sha256 !== hash) return json({ error: "ground sighting identity conflict" }, 409);
    return json({ protocol: 1, sightingId: sighting.sightingId, accepted: true, duplicate: true, resolved: existing.resolved === 1 });
  }

  const alias = await env.DB.prepare(
    "SELECT child_device_id FROM witness_aliases WHERE alias=?1 AND ?2 BETWEEN valid_from_ms-?3 AND valid_to_ms+?3 LIMIT 1"
  ).bind(sighting.alias, sighting.observedWallMs, WITNESS_CLOCK_GRACE_MS).first<AliasRow>();
  const childDeviceId = alias?.child_device_id === configured.device_id ? configured.device_id : null;
  const resolved = childDeviceId === null ? 0 : 1;
  const allowance = conservativeBleAllowanceM(sighting.rssi);
  const uncertainty = groundUncertaintyM(configured.radius_m!, sighting.rssi);

  try {
    await env.DB.prepare(
      "INSERT INTO ground_sightings(receiver_id,sighting_id,alias,child_device_id,observed_wall_ms,receiver_latitude,receiver_longitude," +
      "receiver_radius_m,rssi,tx_power,proximity_allowance_m,uncertainty_m,resolved,payload_sha256,received_at) " +
      "VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)"
    ).bind(
      receiverId, sighting.sightingId, sighting.alias, childDeviceId, sighting.observedWallMs,
      configured.latitude!, configured.longitude!, configured.radius_m!, sighting.rssi, sighting.txPower,
      allowance, uncertainty, resolved, hash, now
    ).run();
  } catch {
    // A concurrent duplicate races into the composite PK. Re-read and only ACK if the exact body won.
    const raced = await env.DB.prepare(
      "SELECT payload_sha256,resolved FROM ground_sightings WHERE receiver_id=?1 AND sighting_id=?2 LIMIT 1"
    ).bind(receiverId, sighting.sightingId).first<ExistingRow>();
    if (!raced || raced.payload_sha256 !== hash) return json({ error: "ground sighting identity conflict" }, 409);
    return json({ protocol: 1, sightingId: sighting.sightingId, accepted: true, duplicate: true, resolved: raced.resolved === 1 });
  }

  return json({ protocol: 1, sightingId: sighting.sightingId, accepted: true, duplicate: false, resolved: resolved === 1 });
}
