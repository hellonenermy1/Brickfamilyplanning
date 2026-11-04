import { readBoundedBody } from "./bounded-body";
import { verifyDeviceSignature } from "./crypto";
import type { BrickDevice } from "./device-do";
import { decodeLivePacket, V1_BYTES, V2_BYTES, type LivePacket } from "./protocol";
import { constrainFallbackToRoute } from "./route-constraint";
import { evaluateSafetyBatchV6 } from "./safety-batch-v6";
import { preciseEndpointStatements, processRefinementsForDevice } from "./phase5-refined-history";

type RateLimit = { limit(input: { key: string }): Promise<{ success: boolean }> };
export type LocationIngestEnv = {
  DB: D1Database;
  HISTORY: R2Bucket;
  MAPS: R2Bucket;
  EVENTS: Queue;
  BRICK_DEVICE: DurableObjectNamespace<BrickDevice>;
  DEVICE_RATE: RateLimit;
};

type DeviceRecord = { public_key_spki_b64: string; revoked_at: number | null };
type QueuedLocation = { packet: LivePacket; rawPacket: LivePacket };
const BATCH_VERSION = 1;
const ROUTE_CONSTRAINED_SOURCE = 5;
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
  const bounded = await readBoundedBody(req, maxBytes);
  if (!bounded.ok || !bounded.body.byteLength) return json({ error: "invalid payload size" }, 400);
  const body = bounded.body;
  if (!(await verifyDeviceSignature(publicKey, body, signature))) return json({ error: "bad signature" }, 401);
  return body;
}

function timeValid(packet: LivePacket, now: number) {
  return Number.isSafeInteger(packet.wallTimeMs) && packet.wallTimeMs >= now - MAX_HISTORY_AGE_MS && packet.wallTimeMs <= now + MAX_FUTURE_MS;
}

function order(a: LivePacket, b: LivePacket) {
  return a.epoch - b.epoch || a.sequence - b.sequence;
}

function newestCapturedPacket(packets: readonly LivePacket[]) {
  return packets.reduce((best, packet) => {
    if (packet.wallTimeMs > best.wallTimeMs) return packet;
    if (packet.wallTimeMs < best.wallTimeMs) return best;
    return order(best, packet) < 0 ? packet : best;
  });
}

async function trustedPacket(rawPacket: LivePacket, env: LocationIngestEnv) {
  return constrainFallbackToRoute(rawPacket, env.MAPS);
}

async function queueLocations(env: LocationIngestEnv, deviceId: string, locations: QueuedLocation[]) {
  // Capture receipt provenance once, before Queue delivery can be delayed or retried. The history
  // store keeps the earliest value for a logical packet, so neither Queue redelivery nor a later
  // duplicate HTTP upload can make old data appear newly received.
  const receivedAtMs = Date.now();
  const messages = locations.map(({ packet, rawPacket }) => ({ type: "location", deviceId, packet, rawPacket, receivedAtMs }));
  if (messages.length === 1) {
    await env.EVENTS.send(messages[0]);
    return;
  }
  await env.EVENTS.sendBatch(messages.map(body => ({ body })));
}

/**
 * Durable V6 ordering seam. D1 keeps epoch/sequence as the logical idempotency watermark, while the
 * Durable Object separately answers the parent-facing question "what is the newest captured event?".
 * This separation is intentional: backlog from two reboot epochs can arrive out of order, so a lower
 * logical epoch may still contain the newest event-time point and must be allowed to update live state.
 */
export async function persistAccepted(env: LocationIngestEnv, deviceId: string, packets: LivePacket[], publishLive = true) {
  const logicalHighest = packets.reduce((best, packet) => order(best, packet) < 0 ? packet : best);
  const liveCandidate = newestCapturedPacket(packets);
  const now = Date.now();
  // One multi-row INSERT replaces N individual D1 subqueries. Four bound parameters per packet
  // means MAX_BATCH=20 uses 80 parameters, safely below D1's 100-bound-parameter limit.
  const bindings: unknown[] = [];
  const values = packets.map((packet, index) => {
    const base = index * 4;
    bindings.push(deviceId, packet.epoch, packet.sequence, now);
    // SELECT/WHERE EXISTS runs inside one atomic D1 transaction with the active-device
    // liveness test. A stale prior auth SELECT must never insert revoked-device history.
    return `SELECT ?${base + 1},?${base + 2},?${base + 3},'location',?${base + 4} WHERE EXISTS (SELECT 1 FROM devices WHERE id=?${base + 1} AND revoked_at IS NULL)`;
  }).join(" UNION ALL ");
  const insert = env.DB.prepare(
    `INSERT OR IGNORE INTO device_events(device_id,epoch,sequence,kind,created_at) ${values}`
  ).bind(...bindings);
  // Any authenticated location upload proves recent device contact, even when it is delayed backlog
  // whose logical epoch/sequence is older than the current watermark. Keep last_seen_at independent
  // from the idempotency watermark while advancing last_epoch/last_sequence only when logically newer.
  const advance = env.DB.prepare(
    "UPDATE devices SET " +
    "last_epoch=CASE WHEN (last_epoch<?1 OR (last_epoch=?1 AND last_sequence<?2)) THEN ?1 ELSE last_epoch END," +
    "last_sequence=CASE WHEN (last_epoch<?1 OR (last_epoch=?1 AND last_sequence<?2)) THEN ?2 ELSE last_sequence END," +
    "last_seen_at=?3 WHERE id=?4 AND revoked_at IS NULL"
  ).bind(logicalHighest.epoch, logicalHighest.sequence, now, deviceId);
  const endpointStatements = preciseEndpointStatements(env.DB, deviceId, packets, now);
  // Endpoint indexing is part of the durable DB write before ACK. The heavier R2 smoothing pass is
  // intentionally not: a temporary refinement failure must never hold up live safety/location ACKs.
  const [insertResult, activeResult] = await env.DB.batch([insert, advance, ...endpointStatements]);
  // A matched UPDATE is the transaction's durable liveness proof even if the logical
  // watermark is unchanged. Never queue or broadcast if the device was already revoked.
  if ((activeResult?.meta.changes ?? 0) !== 1) {
    return { liveAdvanced: false, insertedCount: 0, preciseEndpointCount: 0, accepted: [], revoked: true };
  }
  const insertedCount = insertResult?.meta.changes ?? 0;
  let liveAdvanced = false;
  if (publishLive && insertedCount > 0) {
    // Direct test/legacy callers preserve this behavior. Public ingest routes must
    // defer parent-visible DO state until Queue submission is durable.
    liveAdvanced = await env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(deviceId)).setLatest(liveCandidate);
  }
  return {
    liveAdvanced,
    insertedCount,
    preciseEndpointCount: endpointStatements.length,
    accepted: packets.map(packet => ({ epoch: packet.epoch, sequence: packet.sequence })),
    revoked: false
  };
}

async function publishAfterQueue(env: LocationIngestEnv, deviceId: string, packets: LivePacket[]): Promise<{ liveAdvanced: boolean; revoked: boolean }> {
  // Another D1 read narrows the cross-store revocation window. Full atomicity
  // between D1, Queue and DO is impossible here and remains a live Phase8D gate.
  if (!(await device(env, deviceId))) return { liveAdvanced: false, revoked: true };
  const advanced = await env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(deviceId)).setLatest(newestCapturedPacket(packets));
  return { liveAdvanced: advanced, revoked: false };
}

async function tryRefineAfterPreciseEndpoint(env: LocationIngestEnv, deviceId: string, preciseEndpointCount: number) {
  if (preciseEndpointCount <= 0) return;
  // Endpoint metadata and hypothesis frames remain durable if this optional R2 pass fails. A future
  // endpoint/frame or scheduled maintenance can retry; the child ACK must not depend on smoothing.
  try { await processRefinementsForDevice(env, deviceId, Date.now()); } catch { /* retry later */ }
}

export async function ingestLocationV6(req: Request, env: LocationIngestEnv, deviceId: string) {
  const rate = await env.DEVICE_RATE.limit({ key: `${deviceId}:location` });
  if (!rate.success) return json({ error: "rate limited" }, 429);
  const d = await device(env, deviceId);
  if (!d) return json({ error: "device unauthorized" }, 401);
  const body = await signedBody(req, d.public_key_spki_b64, V2_BYTES); if (body instanceof Response) return body;
  if (body.byteLength !== V1_BYTES && body.byteLength !== V2_BYTES) return json({ error: "bad packet length" }, 400);
  let rawPacket: LivePacket; try { rawPacket = decodeLivePacket(body); } catch { return json({ error: "invalid location packet" }, 400); }
  if (!timeValid(rawPacket, Date.now())) return json({ error: "location timestamp outside allowed history window" }, 400);

  const packet = await trustedPacket(rawPacket, env);
  // Persist/verify current D1 device identity before sending any Queue message. On
  // Queue failure return 503; the child retries and the immutable D1 idempotency
  // index accepts the duplicate retry while Queue durability is recovered.
  const persisted = await persistAccepted(env, deviceId, [packet], false);
  if (persisted.revoked) return json({ error: "device unauthorized" }, 401);
  try { await queueLocations(env, deviceId, [{ packet, rawPacket }]); }
  catch { return json({ error: "location queue unavailable; retry" }, 503); }
  const published = await publishAfterQueue(env, deviceId, [packet]);
  if (published.revoked) return json({ error: "device unauthorized" }, 401);
  await evaluateSafetyBatchV6(env, deviceId, [packet]);
  await tryRefineAfterPreciseEndpoint(env, deviceId, persisted.preciseEndpointCount);
  return json({ ack: packet.sequence, duplicate: persisted.insertedCount === 0, liveAdvanced: published.liveAdvanced, routeConstrained: packet.source === ROUTE_CONSTRAINED_SOURCE });
}

export async function ingestLocationBatchV6(req: Request, env: LocationIngestEnv, deviceId: string) {
  const rate = await env.DEVICE_RATE.limit({ key: `${deviceId}:location-batch` });
  if (!rate.success) return json({ error: "rate limited" }, 429);
  const d = await device(env, deviceId); if (!d) return json({ error: "device unauthorized" }, 401);
  const maxBytes = 3 + MAX_BATCH * V2_BYTES;
  const body = await signedBody(req, d.public_key_spki_b64, maxBytes); if (body instanceof Response) return body;
  if (body.byteLength < 3) return json({ error: "invalid batch" }, 400);
  const view = new DataView(body);
  if (view.getUint8(0) !== BATCH_VERSION) return json({ error: "unsupported batch version" }, 400);
  const count = view.getUint16(1, false);
  if (count < 1 || count > MAX_BATCH || body.byteLength !== 3 + count * V2_BYTES) return json({ error: "invalid batch size" }, 400);

  const rawPackets: LivePacket[] = [], now = Date.now();
  try {
    for (let i = 0; i < count; i++) {
      const start = 3 + i * V2_BYTES;
      const packet = decodeLivePacket(body.slice(start, start + V2_BYTES));
      if (packet.version !== 2 || !timeValid(packet, now)) throw new Error("invalid packet");
      rawPackets.push(packet);
    }
  } catch { return json({ error: "invalid batch packet" }, 400); }
  for (let i = 1; i < rawPackets.length; i++) if (order(rawPackets[i - 1], rawPackets[i]) >= 0) return json({ error: "batch must be strictly ordered" }, 400);

  const packets = await Promise.all(rawPackets.map(packet => trustedPacket(packet, env)));
  const persisted = await persistAccepted(env, deviceId, packets, false);
  if (persisted.revoked) return json({ error: "device unauthorized" }, 401);
  try { await queueLocations(env, deviceId, packets.map((packet, i) => ({ packet, rawPacket: rawPackets[i] }))); }
  catch { return json({ error: "location queue unavailable; retry" }, 503); }
  const published = await publishAfterQueue(env, deviceId, packets);
  if (published.revoked) return json({ error: "device unauthorized" }, 401);
  await evaluateSafetyBatchV6(env, deviceId, packets);
  await tryRefineAfterPreciseEndpoint(env, deviceId, persisted.preciseEndpointCount);
  return json({ acked: persisted.accepted, count: persisted.accepted.length, liveAdvanced: published.liveAdvanced, routeConstrainedCount: packets.filter(packet => packet.source === ROUTE_CONSTRAINED_SOURCE).length });
}

export async function previewLatestLocationV6(req: Request, env: LocationIngestEnv, deviceId: string) {
  const rate = await env.DEVICE_RATE.limit({ key: `${deviceId}:live-preview` });
  if (!rate.success) return json({ error: "rate limited" }, 429);
  const d = await device(env, deviceId); if (!d) return json({ error: "device unauthorized" }, 401);
  const body = await signedBody(req, d.public_key_spki_b64, V2_BYTES); if (body instanceof Response) return body;
  if (body.byteLength !== V2_BYTES) return json({ error: "live preview requires v2 packet" }, 400);
  let rawPacket: LivePacket; try { rawPacket = decodeLivePacket(body); } catch { return json({ error: "invalid location packet" }, 400); }
  const now = Date.now();
  if (rawPacket.wallTimeMs < now - LIVE_PREVIEW_MAX_AGE_MS || rawPacket.wallTimeMs > now + MAX_FUTURE_MS) return json({ previewed: false, reason: "not_recent" });
  const packet = await trustedPacket(rawPacket, env);
  // A revoked child must never issue a live-only preview after the slow map/refinement stage.
  // This is a second D1 guard; exact concurrent revoke/DO write requires live isolation tests.
  if (!(await device(env, deviceId))) return json({ error: "device unauthorized" }, 401);
  const advanced = await env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(deviceId)).setLatest(packet);
  return json({ previewed: advanced, epoch: packet.epoch, sequence: packet.sequence, routeConstrained: packet.source === ROUTE_CONSTRAINED_SOURCE });
}
