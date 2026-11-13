import { readBoundedBody } from "./bounded-body";
import { verifyDeviceSignature } from "./crypto";
import { decodeEvidenceBatch, EVIDENCE_MAX_BATCH_BYTES, type EvidenceBatch } from "./evidence-protocol";
import { EvidenceConflict, persistEvidenceBatch } from "./evidence-ingest";
import { Phase5SemanticError, phase5EvidenceStatements } from "./phase5-evidence";
import {
  Phase5RefinedHistoryError,
  persistHypothesisFrameIfPresent
} from "./phase5-refined-history";

export type EvidenceRateLimit = { limit(input: { key: string }): Promise<{ success: boolean }> };
export type EvidenceRouteEnv = {
  DB: D1Database;
  HISTORY: R2Bucket;
  DEVICE_RATE: EvidenceRateLimit;
};
type DeviceRecord = { public_key_spki_b64: string; revoked_at: number | null };

const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export function decodeEvidenceDevicePath(raw: string): string | null {
  try {
    const decoded = decodeURIComponent(raw);
    return DEVICE_ID_RE.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

async function authorizedDevice(env: EvidenceRouteEnv, id: string) {
  const row = await env.DB.prepare("SELECT public_key_spki_b64,revoked_at FROM devices WHERE id=?1").bind(id).first<DeviceRecord>();
  return row && row.revoked_at === null ? row : null;
}

function evidenceAttemptRateKey(req: Request) {
  const ip = (req.headers.get("CF-Connecting-IP") ?? "").trim();
  return `evidence-attempt:${ip && ip.length <= 64 ? ip : "unknown"}`;
}

async function signedEvidenceBody(req: Request, device: DeviceRecord): Promise<ArrayBuffer | Response> {
  const contentType = (req.headers.get("Content-Type") ?? "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/vnd.brick.evidence") return json({ error: "unsupported evidence content type" }, 415);

  const declaredRaw = req.headers.get("Content-Length");
  if (declaredRaw !== null) {
    const declared = Number(declaredRaw);
    if (Number.isFinite(declared) && declared > EVIDENCE_MAX_BATCH_BYTES) return json({ error: "evidence payload too large" }, 413);
  }

  const signature = req.headers.get("X-Brick-Signature");
  if (!signature || signature.length > 512) return json({ error: "missing or invalid signature" }, 401);

  const bounded = await readBoundedBody(req, EVIDENCE_MAX_BATCH_BYTES);
  if (!bounded.ok) {
    return bounded.reason === "too_large"
      ? json({ error: "evidence payload too large" }, 413)
      : json({ error: "could not read evidence payload" }, 400);
  }
  const body = bounded.body;
  if (!body.byteLength) return json({ error: "invalid evidence payload size" }, 400);
  if (!(await verifyDeviceSignature(device.public_key_spki_b64, body, signature))) return json({ error: "bad signature" }, 401);
  return body;
}

export async function handleEvidenceRequest(req: Request, env: EvidenceRouteEnv, deviceId: string): Promise<Response> {
  if (!DEVICE_ID_RE.test(deviceId)) return json({ error: "invalid device path" }, 400);

  const attemptRate = await env.DEVICE_RATE.limit({ key: evidenceAttemptRateKey(req) });
  if (!attemptRate.success) return json({ error: "rate limited" }, 429);

  const device = await authorizedDevice(env, deviceId);
  if (!device) return json({ error: "device unauthorized" }, 401);
  const body = await signedEvidenceBody(req, device);
  if (body instanceof Response) return body;

  const deviceRate = await env.DEVICE_RATE.limit({ key: `evidence-device:${deviceId}` });
  if (!deviceRate.success) return json({ error: "rate limited" }, 429);

  let decoded: EvidenceBatch;
  try { decoded = decodeEvidenceBatch(body); }
  catch (error) { return json({ error: String(error) }, 400); }

  try {
    // Raw BREV is persisted first. Phase 5 semantic indexes and normalized smoothing inputs are then
    // committed before the exact ACK is returned. A transient secondary-index failure therefore
    // leaves the child record pending; retry is safe because raw and normalized objects are idempotent.
    const persisted = await persistEvidenceBatch(env, deviceId, body);
    const semantic: D1PreparedStatement[] = [];
    const now = Date.now();
    for (const record of decoded.records) {
      await persistHypothesisFrameIfPresent(env, deviceId, record, now);
      semantic.push(...await phase5EvidenceStatements(env.DB, deviceId, record, now));
    }
    if (semantic.length) await env.DB.batch(semantic);
    // Pending normalized inputs are the durable work index. The automatic
    // scheduler refines them after either upload order; optional derivation
    // cannot delay or change the exact ACK for required durable ingest.
    return json(persisted);
  } catch (error) {
    if (error instanceof EvidenceConflict) return json({ error: error.message }, 409);
    if (error instanceof Phase5SemanticError) return json({ error: error.message }, 409);
    if (error instanceof Phase5RefinedHistoryError) return json({ error: error.message }, 409);
    return json({ error: "evidence persistence unavailable" }, 503);
  }
}
