import { readBoundedBody } from "./bounded-body";
import { verifyDeviceSignature } from "./crypto";

export type CanaryEnv = { DB: D1Database };
type DeviceRecord = { public_key_spki_b64: string; revoked_at: number | null };
const NONCE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function handleCanary(req: Request, env: CanaryEnv, deviceId: string): Promise<Response> {
  const d = await env.DB.prepare("SELECT public_key_spki_b64,revoked_at FROM devices WHERE id=?1").bind(deviceId).first<DeviceRecord>();
  if (!d || d.revoked_at !== null) return json({ error: "device unauthorized" }, 401);
  const signature = req.headers.get("X-Brick-Signature");
  if (!signature || signature.length > 512) return json({ error: "missing signature" }, 401);
  const bounded = await readBoundedBody(req, 1024);
  if (!bounded.ok || !bounded.body.byteLength) return json({ error: "invalid canary payload" }, 400);
  if (!(await verifyDeviceSignature(d.public_key_spki_b64, bounded.body, signature))) return json({ error: "bad signature" }, 401);
  let body: Record<string, unknown>;
  try { body = JSON.parse(new TextDecoder().decode(bounded.body)) as Record<string, unknown>; } catch { return json({ error: "invalid JSON" }, 400); }
  if (body.protocol !== 1 || typeof body.nonce !== "string" || !NONCE_RE.test(body.nonce) ||
      typeof body.sentAtMs !== "number" || !Number.isSafeInteger(body.sentAtMs) || Math.abs(Date.now() - body.sentAtMs) > 10 * 60_000) {
    return json({ error: "invalid canary schema" }, 400);
  }
  return json({ ok: true, nonce: body.nonce, serverReceivedAtMs: Date.now() });
}
