import { readBoundedBody } from "./bounded-body";
import { validDevicePublicKey, verifyDeviceSignature } from "./crypto";

export type DeviceJsonSecurityEnv = { DB: D1Database };
type DeviceKeyRow = { public_key_spki_b64: string; revoked_at: number | null };

type SignedJson = { body: ArrayBuffer; json: Record<string, unknown> };

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function validatePairingPublicKey(req: Request): Promise<Response | null> {
  // Read a clone because the validated original request still has to reach completePairing(). The
  // shared reader stops at the application limit even when Content-Length is omitted/chunked.
  const bounded = await readBoundedBody(req.clone(), 4096);
  if (!bounded.ok) return jsonError(bounded.reason === "too_large" ? "pairing payload too large" : "invalid pairing body", 400);
  const raw = bounded.body;
  if (!raw.byteLength) return jsonError("invalid pairing body", 400);

  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(raw)); } catch { return jsonError("invalid pairing JSON", 400); }
  if (!value || typeof value !== "object" || Array.isArray(value)) return jsonError("invalid pairing JSON", 400);
  const body = value as Record<string, unknown>;
  const token = body.token;
  const publicKey = body.publicKeySpkiB64;
  if (typeof token !== "string" || token.length < 16 || token.length > 256) return jsonError("invalid pairing token", 400);
  if (typeof publicKey !== "string" || publicKey.length > 2048 || !(await validDevicePublicKey(publicKey))) {
    return jsonError("invalid P-256 device public key", 400);
  }
  return null;
}

async function signedJson(req: Request, env: DeviceJsonSecurityEnv, deviceId: string, maxBytes = 8192): Promise<SignedJson | Response> {
  const signature = req.headers.get("X-Brick-Signature");
  if (!signature || signature.length > 512) return jsonError("missing or invalid signature", 401);
  const row = await env.DB.prepare("SELECT public_key_spki_b64,revoked_at FROM devices WHERE id=?1").bind(deviceId).first<DeviceKeyRow>();
  if (!row || row.revoked_at !== null) return jsonError("device unauthorized", 401);
  const bounded = await readBoundedBody(req.clone(), maxBytes);
  if (!bounded.ok || !bounded.body.byteLength) return jsonError("invalid payload size", 400);
  const body = bounded.body;
  const ok = await verifyDeviceSignature(row.public_key_spki_b64, body, signature);
  if (!ok) return jsonError("bad signature", 401);
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(body)); } catch { return jsonError("invalid JSON", 400); }
  if (!value || typeof value !== "object" || Array.isArray(value)) return jsonError("invalid JSON object", 400);
  return { body, json: value as Record<string, unknown> };
}

function safePositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function safeTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export async function readVerifiedHealthRequest(req: Request, env: DeviceJsonSecurityEnv, deviceId: string, now = Date.now()): Promise<(SignedJson & {sequence:number;sentAt:number}) | Response> {
  const verified = await signedJson(req, env, deviceId);
  if (verified instanceof Response) return verified;
  const sequence = verified.json.healthSequence;
  const sentAt = verified.json.healthSentAtMs;
  if (!safePositiveInteger(sequence) || !safeTimestamp(sentAt)) return jsonError("missing health replay evidence", 400);
  if (sentAt > now + 120_000) return jsonError("health timestamp is in the future", 400);
  if (sentAt < now - 10 * 60_000) return jsonError("stale health heartbeat", 409);

  return {...verified,sequence,sentAt};
}

export async function reserveHealthReplay(req: Request, env: DeviceJsonSecurityEnv, deviceId: string, now = Date.now()): Promise<Response | null> {
  const verified=await readVerifiedHealthRequest(req,env,deviceId,now);
  if(verified instanceof Response)return verified;
  const {sequence}=verified;
  const result = await env.DB.prepare(
    "INSERT INTO device_replay_state(device_id,last_health_sequence,updated_at) " +
    "SELECT ?1,?2,?3 WHERE EXISTS (SELECT 1 FROM devices WHERE id=?1 AND revoked_at IS NULL) " +
    "ON CONFLICT(device_id) DO UPDATE SET last_health_sequence=excluded.last_health_sequence,updated_at=excluded.updated_at " +
    "WHERE device_replay_state.last_health_sequence<excluded.last_health_sequence " +
    "AND EXISTS (SELECT 1 FROM devices WHERE id=?1 AND revoked_at IS NULL)"
  ).bind(deviceId, sequence, now).run();
  if ((result.meta.changes ?? 0) !== 1) {
    const life = await env.DB.prepare("SELECT revoked_at FROM devices WHERE id=?1").bind(deviceId).first<{ revoked_at: number | null }>();
    if (!life || life.revoked_at !== null) return jsonError("device unauthorized", 401);
    return jsonError("replayed or out-of-order health heartbeat", 409);
  }
  return null;
}

export async function validateSafetyReplayWindow(req: Request, env: DeviceJsonSecurityEnv, deviceId: string, now = Date.now()): Promise<Response | null> {
  const verified = await signedJson(req, env, deviceId);
  if (verified instanceof Response) return verified;
  const eventId = verified.json.eventId;
  const eventSequence = verified.json.eventSequence;
  const createdAt = verified.json.createdAtMs;
  if (typeof eventId !== "string" || !/^[0-9a-fA-F-]{36}$/.test(eventId)) return jsonError("invalid safety event id", 400);
  if (!safePositiveInteger(eventSequence)) return jsonError("missing safety event sequence", 400);
  if (!safeTimestamp(createdAt)) return jsonError("invalid safety event timestamp", 400);
  if (createdAt > now + 5 * 60_000) return jsonError("safety event timestamp is in the future", 400);
  if (createdAt < now - 30 * 86_400_000) return jsonError("safety event is too old", 409);
  return null;
}
