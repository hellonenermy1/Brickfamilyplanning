import { verifyDeviceSignature } from "./crypto";
import type { BrickDevice } from "./device-do";
import { decodeLivePacket, V1_BYTES, V2_BYTES, type LivePacket } from "./protocol";

type RateLimit = { limit(input: { key: string }): Promise<{ success: boolean }> };
export type LocationIngestEnv = {
  DB: D1Database;
  EVENTS: Queue;
  BRICK_DEVICE: DurableObjectNamespace<BrickDevice>;
  DEVICE_RATE: RateLimit;
};

type DeviceRecord = { public_key_spki_b64: string; revoked_at: number | null };
const BATCH_VERSION = 1;
const MAX_BATCH = 50;
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

function advances(candidate: LivePacket, epoch: number, sequence: number) {
  return candidate.epoch > epoch || (candidate.epoch === epoch && candidate.sequence > sequence);
}

async function queueLocations(env: LocationIngestEnv, deviceId: string, packets: LivePacket[]) {
  if (packets.length === 1) {
    await env.EVENTS.send({ type: "location", deviceId, packet: packets[0] });
    return;
  }
  await env.EVENTS.sendBatch(packets.map(packet => ({ body: { type: "location", deviceId, packet } })));
}

async function persistAccepted(env: LocationIngestEnv, deviceId: string, packets: LivePacket[]) {
  const highest = packets[packets.length - 1];
  const now = Date.now();
  const statements = packets.map(packet =>
    env.DB.prepare("INSERT OR IGNORE INTO device_events(device_id,epoch,sequence,kind,created_at) VALUES(?1,?2,?3,'location',?4)")
      .bind(deviceId, packet.epoch, packet.sequence, now)
  );
  statements.push(
    env.DB.prepare("UPDATE devices SET last_epoch=?1,last_sequence=?2,last_seen_at=?3 WHERE id=?4 AND revoked_at IS NULL AND (last_epoch<?1 OR (last_epoch=?1 AND last_sequence<?2))")
      .bind(highest.epoch, highest.sequence, now, deviceId)
  );
  const results = await env.DB.batch(statements);
  const advance = results[results.length - 1];
  if ((advance?.meta.changes ?? 0) > 0) {
    await env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(deviceId)).setLatest(highest);
  }
  return results.slice(0, packets.length).map((r, i) => ({
    epoch: packets[i].epoch,
    sequence: packets[i].sequence,
    duplicate: (r.meta.changes ?? 0) === 0
  }));
}

export async function ingestLocationV6(req: Request, env: LocationIngestEnv, deviceId: string) {
  const rate = await env.DEVICE_RATE.limit({ key: `${deviceId}:location` });
  if (!rate.success) return json({ error: "rate limited" }, 429);
  const d = await device(env, deviceId);
  if (!d) return json({ error: "device unauthorized" }, 401);
  const body = await signedBody(req, d.public_key_spki_b64, V2_BYTES);
  if (body instanceof Response) return body;
  if (body.byteLength !== V1_BYTES && body.byteLength !== V2_BYTES) return json({ error: "bad packet length" }, 400);
  let packet: LivePacket;
  try { packet = decodeLivePacket(body); } catch { return json({ error: "invalid location packet" }, 400); }
  if (!timeValid(packet, Date.now())) return json({ error: "location timestamp outside allowed history window" }, 400);

  // Queue first. If anything later fails, retry may enqueue a duplicate, which is safer than a
  // D1 dedupe row permanently suppressing a history message that never reached the Queue.
  await queueLocations(env, deviceId, [packet]);
  const accepted = await persistAccepted(env, deviceId, [packet]);
  return json({ ack: packet.sequence, duplicate: accepted[0].duplicate, liveAdvanced: !accepted[0].duplicate });
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

  const packets: LivePacket[] = [];
  const now = Date.now();
  try {
    for (let i = 0; i < count; i++) {
      const start = 3 + i * V2_BYTES;
      const packet = decodeLivePacket(body.slice(start, start + V2_BYTES));
      if (packet.version !== 2 || !timeValid(packet, now)) throw new Error("invalid packet");
      packets.push(packet);
    }
  } catch {
    return json({ error: "invalid batch packet" }, 400);
  }
  for (let i = 1; i < packets.length; i++) {
    if (order(packets[i - 1], packets[i]) >= 0) return json({ error: "batch must be strictly ordered" }, 400);
  }

  await queueLocations(env, deviceId, packets);
  const accepted = await persistAccepted(env, deviceId, packets);
  return json({ acked: accepted, count: accepted.length });
}

export async function previewLatestLocationV6(req: Request, env: LocationIngestEnv, deviceId: string) {
  const rate = await env.DEVICE_RATE.limit({ key: `${deviceId}:live-preview` });
  if (!rate.success) return json({ error: "rate limited" }, 429);
  const d = await device(env, deviceId);
  if (!d) return json({ error: "device unauthorized" }, 401);
  const body = await signedBody(req, d.public_key_spki_b64, V2_BYTES);
  if (body instanceof Response) return body;
  if (body.byteLength !== V2_BYTES) return json({ error: "live preview requires v2 packet" }, 400);
  let packet: LivePacket;
  try { packet = decodeLivePacket(body); } catch { return json({ error: "invalid location packet" }, 400); }
  const now = Date.now();
  if (packet.wallTimeMs < now - LIVE_PREVIEW_MAX_AGE_MS || packet.wallTimeMs > now + MAX_FUTURE_MS) {
    return json({ previewed: false, reason: "not_recent" });
  }
  const advanced = await env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(deviceId)).setLatest(packet);
  return json({ previewed: advanced !== false, epoch: packet.epoch, sequence: packet.sequence });
}
