import { randomToken, sha256Hex } from "./crypto";

export type PinPairingEnv = {
  DB: D1Database;
  PAIR_RATE: { limit(input: { key: string }): Promise<{ success: boolean }> };
};

type PinRow = {
  id: string;
  device_name: string;
  expires_at: number;
  claimed_at: number | null;
  pending_public_key_spki_b64: string | null;
  claim_secret_hash: string | null;
  confirmed_at: number | null;
  device_id: string | null;
  cancelled_at: number | null;
};

const PIN_TTL_MS = 10 * 60_000;
const PIN_RE = /^\d{8}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
function sameOrigin(req: Request) {
  const origin = req.headers.get("Origin");
  return origin !== null && origin === new URL(req.url).origin;
}
function randomPin() {
  const bytes = new Uint32Array(1); crypto.getRandomValues(bytes);
  return String(bytes[0] % 100_000_000).padStart(8, "0");
}
function clientKey(req: Request, suffix: string) {
  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  return `pin:${suffix}:${ip.slice(0, 96)}`;
}
async function rate(env: PinPairingEnv, key: string) {
  return (await env.PAIR_RATE.limit({ key })).success;
}
function statusOf(row: PinRow, now: number) {
  if (row.cancelled_at !== null) return "cancelled";
  if (row.confirmed_at !== null && row.device_id) return "confirmed";
  if (row.expires_at < now) return "expired";
  if (row.claimed_at !== null) return "claimed";
  return "waiting_for_child";
}

/** Authenticated parent starts a family/deployment-scoped fallback session. */
export async function parentStartPin(req: Request, env: PinPairingEnv) {
  if (!sameOrigin(req)) return json({ error: "same-origin request required" }, 403);
  if (!(await rate(env, "parent-pin-start"))) return json({ error: "rate limited" }, 429);
  let body: Record<string, unknown> = {};
  try { body = await req.json<Record<string, unknown>>(); } catch {}
  const name = (typeof body.name === "string" ? body.name : "Child device").trim().slice(0, 64) || "Child device";
  const now = Date.now(), expiresAt = now + PIN_TTL_MS;
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = crypto.randomUUID(), pin = randomPin(), pinHash = await sha256Hex(pin);
    try {
      await env.DB.prepare("INSERT INTO pairing_pin_sessions(id,pin_hash,device_name,created_at,expires_at) VALUES(?1,?2,?3,?4,?5)")
        .bind(id, pinHash, name, now, expiresAt).run();
      return json({ sessionId: id, pin, expiresAt, status: "waiting_for_child" });
    } catch { /* collision or transient insert failure; bounded retry */ }
  }
  return json({ error: "could not create fallback pairing session" }, 503);
}

/** Public child claim consumes the low-entropy code exactly once but does not bind a device. */
export async function childClaimPin(req: Request, env: PinPairingEnv) {
  if (!(await rate(env, clientKey(req, "claim")))) return json({ error: "rate limited" }, 429);
  let body: Record<string, unknown>; try { body = await req.json<Record<string, unknown>>(); } catch { return json({ error: "invalid JSON" }, 400); }
  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  const publicKey = typeof body.publicKeySpkiB64 === "string" ? body.publicKeySpkiB64.trim() : "";
  if (!PIN_RE.test(pin) || publicKey.length < 32 || publicKey.length > 2048) return json({ error: "invalid fallback code" }, 400);
  if (!(await rate(env, `pin-value:${(await sha256Hex(pin)).slice(0, 24)}`))) return json({ error: "rate limited" }, 429);
  const now = Date.now(), pinHash = await sha256Hex(pin), claimSecret = randomToken(24), claimHash = await sha256Hex(claimSecret);
  const claimed = await env.DB.prepare(
    "UPDATE pairing_pin_sessions SET claimed_at=?1,pending_public_key_spki_b64=?2,claim_secret_hash=?3 WHERE pin_hash=?4 AND claimed_at IS NULL AND confirmed_at IS NULL AND cancelled_at IS NULL AND expires_at>=?1 RETURNING id,device_name,expires_at,claimed_at,pending_public_key_spki_b64,claim_secret_hash,confirmed_at,device_id,cancelled_at"
  ).bind(now, publicKey, claimHash, pinHash).first<PinRow>();
  if (!claimed) return json({ error: "invalid, expired, or already-used fallback code" }, 400);
  return json({ sessionId: claimed.id, claimSecret, expiresAt: claimed.expires_at, status: "pending_parent_confirmation" }, 202);
}

/** Parent can inspect a session without learning the child's claim secret or public key. */
export async function parentPinStatus(env: PinPairingEnv, sessionId: string) {
  if (!UUID_RE.test(sessionId)) return json({ error: "invalid session" }, 400);
  const row = await env.DB.prepare("SELECT id,device_name,expires_at,claimed_at,pending_public_key_spki_b64,claim_secret_hash,confirmed_at,device_id,cancelled_at FROM pairing_pin_sessions WHERE id=?1")
    .bind(sessionId).first<PinRow>();
  if (!row) return json({ error: "session not found" }, 404);
  return json({ sessionId: row.id, deviceName: row.device_name, expiresAt: row.expires_at, status: statusOf(row, Date.now()), claimed: row.claimed_at !== null, confirmed: row.confirmed_at !== null });
}

/** Binding only happens after this separate authenticated parent confirmation. */
export async function parentConfirmPin(req: Request, env: PinPairingEnv, sessionId: string) {
  if (!sameOrigin(req)) return json({ error: "same-origin request required" }, 403);
  if (!UUID_RE.test(sessionId)) return json({ error: "invalid session" }, 400);
  if (!(await rate(env, `parent-pin-confirm:${sessionId}`))) return json({ error: "rate limited" }, 429);
  const now = Date.now();
  const row = await env.DB.prepare("SELECT id,device_name,expires_at,claimed_at,pending_public_key_spki_b64,claim_secret_hash,confirmed_at,device_id,cancelled_at FROM pairing_pin_sessions WHERE id=?1")
    .bind(sessionId).first<PinRow>();
  if (!row) return json({ error: "session not found" }, 404);
  if (row.cancelled_at !== null || row.expires_at < now) return json({ error: "session expired or cancelled" }, 410);
  if (row.confirmed_at !== null && row.device_id) return json({ ok: true, deviceId: row.device_id, status: "confirmed" });
  if (row.claimed_at === null || !row.pending_public_key_spki_b64 || !row.claim_secret_hash) return json({ error: "child has not claimed this code yet" }, 409);
  const deviceId = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?1,?2,?3,?4)").bind(deviceId, row.device_name, row.pending_public_key_spki_b64, now),
      env.DB.prepare("INSERT OR IGNORE INTO retention_settings(device_id,safety_event_days,updated_at) VALUES(?1,180,?2)").bind(deviceId, now),
      env.DB.prepare("UPDATE pairing_pin_sessions SET confirmed_at=?1,device_id=?2 WHERE id=?3 AND confirmed_at IS NULL AND cancelled_at IS NULL AND expires_at>=?1").bind(now, deviceId, sessionId)
    ]);
  } catch {
    return json({ error: "device registration failed; retry parent confirmation" }, 500);
  }
  return json({ ok: true, deviceId, status: "confirmed" });
}

/** Child proves possession of the high-entropy claim secret; PIN replay alone cannot read the result. */
export async function childPinStatus(req: Request, env: PinPairingEnv) {
  if (!(await rate(env, clientKey(req, "status")))) return json({ error: "rate limited" }, 429);
  let body: Record<string, unknown>; try { body = await req.json<Record<string, unknown>>(); } catch { return json({ error: "invalid JSON" }, 400); }
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const secret = typeof body.claimSecret === "string" ? body.claimSecret : "";
  if (!UUID_RE.test(sessionId) || secret.length < 24 || secret.length > 256) return json({ error: "invalid claim" }, 400);
  const row = await env.DB.prepare("SELECT id,device_name,expires_at,claimed_at,pending_public_key_spki_b64,claim_secret_hash,confirmed_at,device_id,cancelled_at FROM pairing_pin_sessions WHERE id=?1")
    .bind(sessionId).first<PinRow>();
  if (!row || !row.claim_secret_hash || await sha256Hex(secret) !== row.claim_secret_hash) return json({ error: "claim unauthorized" }, 401);
  const status = statusOf(row, Date.now());
  if (status === "expired" || status === "cancelled") return json({ status }, 410);
  if (status !== "confirmed" || !row.device_id) return json({ status: "pending_parent_confirmation", expiresAt: row.expires_at }, 202);
  return json({ status: "confirmed", deviceId: row.device_id, apiBase: new URL(req.url).origin });
}
