import { verifyDeviceSignature } from "./crypto";
import type { BrickDevice } from "./device-do";
import { decodeLivePacket, V1_BYTES, V2_BYTES, type LivePacket } from "./protocol";
import { constrainFallbackToRoute } from "./route-constraint";
import { evaluateSafetyBatchV6 } from "./safety-batch-v6";

type RateLimit = { limit(input: { key: string }): Promise<{ success: boolean }> };
export type LocationIngestEnv = {
  DB: D1Database;
  MAPS: R2Bucket;
  EVENTS: Queue;
  BRICK_DEVICE: DurableObjectNamespace<BrickDevice>;
  DEVICE_RATE: RateLimit;
};

type DeviceRecord = { public_key_spki_b64: string; revoked_at: number | null };
type QueuedLocation = { packet: LivePacket; rawPacket: LivePacket };
const BATCH_VERSION = 1;
// 20 packets keeps one ingest comfortably below the Workers Free D1 50-query ceiling even when
// geofence/trip state and safety events need writes in the same invocation.
const MAX_BATCH = 20;
const MAX_HISTORY_AGE_MS = 30 * 86_400_000;
const MAX_FUTURE_MS = 10 * 60_000;
const LIVE_PREVIEW_MAX_AGE_MS = 10 * 60_000;

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

async function device(env: LocationIngestEnv, id: string) {
  const row = await env.DB.prepare("SELECT public_key_spki_b64,revoked_at FROM devices WHERE id=?1").bind(id).first<DeviceRecord>();
  return row && row.revoked_at === null ? row : null;
}

async function signedBody(req: Request, publicKey: string, maxBytes: number): Promise<ArrayBuffer | Response> {
  const signature = req.headers.get("X-Brick-Signature");
  if (!signature || signature.length > 512) return json({ error: "missing or invalid signature" }, 401);
  const body = await req.arrayBuffer();
  if (!body.byteLength || body.byteLength > maxBytes) return json({ error: "invalid payload size" }, 400);
  if (!(await verifyDeviceSignature(publicKey, body, signature))) return json({ error: "bad signature" }, 401);
  return body;
}

function timeValid(packet: LivePacket, now: number) {
  return Number.isSafeInteger(packet.wallTimeMs) && packet.wallTimeMs >= now - MAX_HISTORY_AGE_MS && packet.wallTimeMs <= now + MAX_FUTURE_MS;
}

function order(a: LivePacket, b: LivePacket) {
  return a.epoch - b.epoch || a.sequence - b.sequence;
}

async function trustedPacket(rawPacket: LivePacket, env: LocationIngestEnv) {
  return constrainFallbackToRoute(rawPacket, env.MAPS);
}

async function queueLocations(env: LocationIngestEnv, deviceId: string, locations: QueuedLocation[]) {
  const messages = locations.map(({ packet, rawPacket }) => ({ type: "location", deviceId, packet, rawPacket }));
  if (messages.length === 1) {
    await env.EVENTS.send(messages[0]);
    return;
  }
  await env.EVENTS.sendBatch(messages.map(body => ({ body })));
}

async function persistAccepted(env: LocationIngestEnv, deviceId: string, packets: LivePacket[]) {
  const highest = packets[packets.length - 1];
  const now = Date.now();
  // One multi-row INSERT replaces N individual D1 subqueries. Four bound parameters per packet
  // means MAX_BATCH=20 uses 80 parameters, safely below D1's 100-bound-parameter limit.
  const bindings: unknown[] = [];
  const values = packets.map((packet, index) => {
    const base = index * 4;
    bindings.push(deviceId, packet.epoch, packet.sequence, now);
    return `(?${base + 1},?${base + 2},?${base + 3},'location',?${base + 4})`;
  }).join(",");
  const insert = env.DB.prepare(
    `INSERT OR IGNORE INTO device_events(device_id,epoch,sequence,kind,created_at) VALUES ${values}`
  ).bind(...bindings);
  const advance = env.DB.prepare(
    "UPDATE devices SET last_epoch=?1,last_sequence=?2,last_seen_at=?3 WHERE id=?4 AND revoked_at IS NULL AND (last_epoch<?1 OR (last_epoch=?1 AND last_sequence<?2))"
  ).bind(highest.epoch, highest.sequence, now, deviceId);
  const [insertResult, advanceResult] = await env.DB.batch([insert, advance]);
  const liveAdvanced = (advanceResult?.meta.changes ?? 0) > 0;
  if (liveAdvanced) {
    await env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(deviceId)).setLatest(highest);
  }
  return {
    liveAdvanced,
    insertedCount: insertResult?.meta.changes ?? 0,
    accepted: packets.map(packet => ({ epoch: packet.epoch, sequence: packet.sequence }))
  };
}

export async function ingestLocationV6(req: Request, env: LocationIngestEnv, deviceId: string) {
  const rate = await env.DEVICE_RATE.limit({ key: `${deviceId}:location` });
  if (!rate.success) return json({ error: "rate limited" }, 429);
  const d = await device(env, deviceId);
  if (!d) return json({ error: "device unauthorized" }, 401);
  const body = await signedBody(req, d.public_key_spki_b64, V2_BYTES);
  if (body instanceof Response) return body;
  if (body.byteLength !== V1_BYTES && body.byteLength !== V2_BYTES) return json({ error: "bad packet length" }, 400);
  let rawPacket: LivePacket;
  try { rawPacket = decodeLivePacket(body); } catch { return json({ error: "invalid location packet" }, 400); }
  if (!timeValid(rawPacket, Date.now())) return json({ error: "location timestamp outside allowed history window" }, 400);

  const packet = await trustedPacket(rawPacket, env);
  await queueLocations(env, deviceId, [{ packet, rawPacket }]);
  const persisted = await persistAccepted(env, deviceId, [packet]);
  await evaluateSafetyBatchV6(env, deviceId, [packet]);
  return json({ ack: packet.sequence, duplicate: persisted.insertedCount === 0, liveAdvanced: persisted.liveAdvanced, routeConstrained: packet.source === 4 });
}

export async function ingestLocationBatchV6(req: Request, env: LocationIngestEnv, deviceId: string) {
  const rate = await env.DEVICE_RATE.limit({ key: `${deviceId}:location-batch` });
  if (!rate.success) return json({ error: "rate limited" }, 429);
  const d = await device(env, deviceId);
  if (!d) return json({ error: "device unauthorized" }, 401);
  const maxBytes = 3 + MAX_BATCH * V2_BYTES;
  const body = await signedBody(req, d.public_key_spki_b64, maxBytes);
  if (body instanceof Response) return body;
  if (body.byteLength < 3) return json({ error: "invalid batch" }, 400);
  const view = new DataView(body);
  if (view.getUint8(0) !== BATCH_VERSION) return json({ error: "unsupported batch version" }, 400);
  const count = view.getUint16(1, false);
  if (count < 1 || count > MAX_BATCH || body.byteLength !== 3 + count * V2_BYTES) return json({ error: "invalid batch size" }, 400);

  const rawPackets: LivePacket[] = [];
  const now = Date.now();
  try {
    for (let i = 0; i < count; i++) {
      const start = 3 + i * V2_BYTES;
      const packet = decodeLivePacket(body.slice(start, start + V2_BYTES));
      if (packet.version !== 2 || !timeValid(packet, now)) throw new Error("invalid packet");
      rawPackets.push(packet);
    }
  } catch {
    return json({ error: "invalid batch packet" }, 400);
  }
  for (let i = 1; i < rawPackets.length; i++) {
    if (order(rawPackets[i - 1], rawPackets[i]) >= 0) return json({ error: "batch must be strictly ordered" }, 400);
  }

  const packets = await Promise.all(rawPackets.map(packet => trustedPacket(packet, env)));
  await queueLocations(env, deviceId, packets.map((packet, i) => ({ packet, rawPacket: rawPackets[i] })));
  const persisted = await persistAccepted(env, deviceId, packets);
  await evaluateSafetyBatchV6(env, deviceId, packets);
  return json({
    acked: persisted.accepted,
    count: persisted.accepted.length,
    liveAdvanced: persisted.liveAdvanced,
    routeConstrainedCount: packets.filter(packet => packet.source === 4).length
  });
}

export async function previewLatestLocationV6(req: Request, env: LocationIngestEnv, deviceId: string) {
  const rate = await env.DEVICE_RATE.limit({ key: `${deviceId}:live-preview` });
  if (!rate.success) return json({ error: "rate limited" }, 429);
  const d = await device(env, deviceId);
  if (!d) return json({ error: "device unauthorized" }, 401);
  const body = await signedBody(req, d.public_key_spki_b64, V2_BYTES);
  if (body instanceof Response) return body;
  if (body.byteLength !== V2_BYTES) return json({ error: "live preview requires v2 packet" }, 400);
  let rawPacket: LivePacket;
  try { rawPacket = decodeLivePacket(body); } catch { return json({ error: "invalid location packet" }, 400); }
  const now = Date.now();
  if (rawPacket.wallTimeMs < now - LIVE_PREVIEW_MAX_AGE_MS || rawPacket.wallTimeMs > now + MAX_FUTURE_MS) {
    return json({ previewed: false, reason: "not_recent" });
  }
  const packet = await trustedPacket(rawPacket, env);
  const advanced = await env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(deviceId)).setLatest(packet);
  return json({ previewed: advanced, epoch: packet.epoch, sequence: packet.sequence, routeConstrained: packet.source === 4 });
}
