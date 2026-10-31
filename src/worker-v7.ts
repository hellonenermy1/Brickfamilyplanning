import phase6, { BrickDevice } from "./worker-v6";
import { verifyDeviceSignature } from "./crypto";
import { decodeEvidenceBatch, EVIDENCE_MAX_BATCH_BYTES } from "./evidence-protocol";
import { EvidenceConflict, persistEvidenceBatch } from "./evidence-ingest";
export { BrickDevice };

type RateLimit = { limit(input: { key: string }): Promise<{ success: boolean }> };
type Env = {
  DB: D1Database;
  HISTORY: R2Bucket;
  MAPS: R2Bucket;
  EVENTS: Queue;
  BRICK_DEVICE: DurableObjectNamespace<BrickDevice>;
  DEVICE_RATE: RateLimit;
  PAIR_RATE: RateLimit;
  APP_ENV: string;
  CURRENT_APP_VERSION: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
};
type DeviceRecord = { public_key_spki_b64: string; revoked_at: number | null };
const base = phase6 as ExportedHandler<Env>;
const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

async function authorizedDevice(env: Env, id: string) {
  const row = await env.DB.prepare("SELECT public_key_spki_b64,revoked_at FROM devices WHERE id=?1").bind(id).first<DeviceRecord>();
  return row && row.revoked_at === null ? row : null;
}

function evidenceAttemptRateKey(req: Request) {
  // Cloudflare supplies CF-Connecting-IP at the edge. Invalid/unsigned traffic is limited by the
  // requester, not by the claimed device ID, so a stranger cannot exhaust a child's device bucket
  // merely by learning that identifier. The post-signature device bucket still bounds valid traffic.
  const ip = (req.headers.get("CF-Connecting-IP") ?? "").trim();
  return `evidence-attempt:${ip && ip.length <= 64 ? ip : "unknown"}`;
}

async function signedEvidenceBody(req: Request, device: DeviceRecord): Promise<ArrayBuffer | Response> {
  const contentType = (req.headers.get("Content-Type") ?? "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/vnd.brick.evidence") return json({ error: "unsupported evidence content type" }, 415);
  const declared = Number(req.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declared) && declared > EVIDENCE_MAX_BATCH_BYTES) return json({ error: "evidence payload too large" }, 413);
  const signature = req.headers.get("X-Brick-Signature");
  if (!signature || signature.length > 512) return json({ error: "missing or invalid signature" }, 401);
  const body = await req.arrayBuffer();
  if (!body.byteLength || body.byteLength > EVIDENCE_MAX_BATCH_BYTES) return json({ error: "invalid evidence payload size" }, 400);
  if (!(await verifyDeviceSignature(device.public_key_spki_b64, body, signature))) return json({ error: "bad signature" }, 401);
  return body;
}

async function ingestEvidence(req: Request, env: Env, deviceId: string) {
  const attemptRate = await env.DEVICE_RATE.limit({ key: evidenceAttemptRateKey(req) });
  if (!attemptRate.success) return json({ error: "rate limited" }, 429);

  const device = await authorizedDevice(env, deviceId);
  if (!device) return json({ error: "device unauthorized" }, 401);
  const body = await signedEvidenceBody(req, device);
  if (body instanceof Response) return body;

  // Only a request that has proved possession of this device's key can consume the device-scoped
  // evidence budget. This prevents unsigned traffic from starving the real phone's upload path.
  const deviceRate = await env.DEVICE_RATE.limit({ key: `evidence-device:${deviceId}` });
  if (!deviceRate.success) return json({ error: "rate limited" }, 429);

  // Separate validation from persistence so malformed client payloads are 400s while storage
  // failures remain server errors. persistEvidenceBatch validates again before durable writes.
  try { decodeEvidenceBatch(body); }
  catch (error) { return json({ error: String(error) }, 400); }

  try {
    return json(await persistEvidenceBatch(env, deviceId, body));
  } catch (error) {
    if (error instanceof EvidenceConflict) return json({ error: error.message }, 409);
    return json({ error: "evidence persistence unavailable" }, 503);
  }
}

function decodeDevicePath(raw: string): string | null {
  try {
    const decoded = decodeURIComponent(raw);
    // Pairing creates device IDs with crypto.randomUUID(). Restrict evidence routes to that exact
    // canonical v4 form so arbitrary path text never reaches D1 lookups, rate keys or object names.
    return DEVICE_ID_RE.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export default {
  async fetch(req: Request<unknown, IncomingRequestCfProperties>, env: Env, ctx: ExecutionContext) {
    const u = new URL(req.url);
    const match = u.pathname.match(/^\/api\/device\/([^/]+)\/evidence$/);
    if (req.method === "POST" && match) {
      const deviceId = decodeDevicePath(match[1]);
      if (!deviceId) return json({ error: "invalid device path" }, 400);
      return ingestEvidence(req, env, deviceId);
    }
    return base.fetch!(req, env, ctx);
  },
  async queue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) {
    if (base.queue) return base.queue(batch, env, ctx);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (base.scheduled) return base.scheduled(controller, env, ctx);
  }
} satisfies ExportedHandler<Env>;
