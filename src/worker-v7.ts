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

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

async function authorizedDevice(env: Env, id: string) {
  const row = await env.DB.prepare("SELECT public_key_spki_b64,revoked_at FROM devices WHERE id=?1").bind(id).first<DeviceRecord>();
  return row && row.revoked_at === null ? row : null;
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
  const rate = await env.DEVICE_RATE.limit({ key: `${deviceId}:evidence` });
  if (!rate.success) return json({ error: "rate limited" }, 429);
  const device = await authorizedDevice(env, deviceId);
  if (!device) return json({ error: "device unauthorized" }, 401);
  const body = await signedEvidenceBody(req, device);
  if (body instanceof Response) return body;

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

export default {
  async fetch(req: Request<unknown, IncomingRequestCfProperties>, env: Env, ctx: ExecutionContext) {
    const u = new URL(req.url);
    const match = u.pathname.match(/^\/api\/device\/([^/]+)\/evidence$/);
    if (req.method === "POST" && match) return ingestEvidence(req, env, decodeURIComponent(match[1]));
    return base.fetch!(req, env, ctx);
  },
  async queue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) {
    if (base.queue) return base.queue(batch, env, ctx);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (base.scheduled) return base.scheduled(controller, env, ctx);
  }
} satisfies ExportedHandler<Env>;
