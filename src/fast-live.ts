import { readBoundedBody } from "./bounded-body";
import { verifyDeviceSignature } from "./crypto";
import { decodeLivePacket, V2_BYTES, type LivePacket } from "./protocol";
import { constrainFallbackToRoute } from "./route-constraint";
import type { BrickDevice, LiveTraceInput } from "./device-do";

type RateLimit = { limit(input: { key: string }): Promise<{ success: boolean }> };
export type FastLiveEnv = {
  DB: D1Database;
  MAPS: R2Bucket;
  BRICK_DEVICE: DurableObjectNamespace<BrickDevice>;
  DEVICE_RATE: RateLimit;
};
type DeviceRecord = { public_key_spki_b64: string; revoked_at: number | null };
const MAX_FUTURE_MS = 10 * 60_000;
const LIVE_PREVIEW_MAX_AGE_MS = 10 * 60_000;
const TRACE_RE = /^[A-Za-z0-9._:-]{1,120}$/;

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
function intHeader(req: Request, name: string): number | null {
  const raw = req.headers.get(name);
  if (!raw || !/^-?\d{1,16}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

export async function handleFastLive(req: Request, env: FastLiveEnv, deviceId: string): Promise<Response> {
  const backendReceivedAtMs = Date.now();
  const rate = await env.DEVICE_RATE.limit({ key: `${deviceId}:live-preview` });
  if (!rate.success) return json({ error: "rate limited" }, 429);
  const d = await env.DB.prepare("SELECT public_key_spki_b64,revoked_at FROM devices WHERE id=?1").bind(deviceId).first<DeviceRecord>();
  if (!d || d.revoked_at !== null) return json({ error: "device unauthorized" }, 401);
  const signature = req.headers.get("X-Brick-Signature");
  if (!signature || signature.length > 512) return json({ error: "missing or invalid signature" }, 401);
  const bounded = await readBoundedBody(req, V2_BYTES);
  if (!bounded.ok || bounded.body.byteLength !== V2_BYTES) return json({ error: "live preview requires v2 packet" }, 400);
  if (!(await verifyDeviceSignature(d.public_key_spki_b64, bounded.body, signature))) return json({ error: "bad signature" }, 401);

  let rawPacket: LivePacket;
  try { rawPacket = decodeLivePacket(bounded.body); } catch { return json({ error: "invalid location packet" }, 400); }
  const now = Date.now();
  if (rawPacket.version !== 2 || rawPacket.wallTimeMs < now - LIVE_PREVIEW_MAX_AGE_MS || rawPacket.wallTimeMs > now + MAX_FUTURE_MS) {
    return json({ previewed: false, reason: "not_recent", backendReceivedAtMs });
  }
  const packet = await constrainFallbackToRoute(rawPacket, env.MAPS);
  // Route work may await storage. The identity read before signature verification
  // is not authority to write current state after a concurrent D1 revocation.
  const life = await env.DB.prepare("SELECT revoked_at FROM devices WHERE id=?1")
    .bind(deviceId).first<{ revoked_at: number | null }>();
  if (!life || life.revoked_at !== null) return json({ error: "device unauthorized" }, 401);
  const traceIdRaw = req.headers.get("X-Brick-Live-Trace") ?? "";
  const trace: LiveTraceInput = {
    id: TRACE_RE.test(traceIdRaw) ? traceIdRaw : `${packet.epoch}:${packet.sequence}`,
    sourceWallMs: intHeader(req, "X-Brick-Source-Wall-Ms"),
    persistedWallMs: intHeader(req, "X-Brick-Persisted-Wall-Ms"),
    persistDurationMs: intHeader(req, "X-Brick-Persist-Duration-Ms"),
    sendWallMs: intHeader(req, "X-Brick-Send-Wall-Ms"),
    backendReceivedAtMs
  };
  const stub = env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(deviceId));
  let committed: Awaited<ReturnType<BrickDevice["setLatestWithTrace"]>>;
  try { committed = await stub.setLatestWithTrace(packet, trace); }
  catch { return json({ error: "live state unavailable; retry" }, 503); }
  // D1 and DO are not one transaction. The DO's durable revoke fence closes
  // the remaining window once revocation reaches the authoritative object.
  if (committed.revoked) return json({ error: "device unauthorized" }, 401);
  return json({
    previewed: committed.advanced,
    epoch: packet.epoch,
    sequence: packet.sequence,
    routeConstrained: packet.source === 5,
    backendReceivedAtMs,
    doUpdatedAtMs: committed.doUpdatedAtMs
  });
}
