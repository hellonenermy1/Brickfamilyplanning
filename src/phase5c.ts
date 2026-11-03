import { readBoundedBody } from "./bounded-body";
import { verifyDeviceSignature } from "./crypto";

type RateLimit = { limit(input: { key: string }): Promise<{ success: boolean }> };
export type Phase5CEnv = {
  DB: D1Database;
  DEVICE_RATE: RateLimit;
  CURRENT_APP_VERSION: string;
};

type DeviceRecord = { public_key_spki_b64: string; revoked_at: number | null };
export type CrashReport = {
  protocol: 1;
  reportId: string;
  appVersion: string;
  module: string;
  exceptionSignature: string;
  createdAtMs: number;
};

const crashKeys = new Set(["protocol", "reportId", "appVersion", "module", "exceptionSignature", "createdAtMs"]);
const forbiddenCrashKey = /(lat|lon|location|coordinate|stack|trace|message|address)/i;

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function validCrashReport(value: unknown): value is CrashReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const x = value as Record<string, unknown>;
  const keys = Object.keys(x);
  if (keys.some(k => forbiddenCrashKey.test(k) || !crashKeys.has(k))) return false;
  if (keys.length !== crashKeys.size) return false;
  return x.protocol === 1 &&
    typeof x.reportId === "string" && isUuid(x.reportId) &&
    typeof x.appVersion === "string" && x.appVersion.length >= 1 && x.appVersion.length <= 64 &&
    typeof x.module === "string" && /^[a-z0-9_.-]{1,64}$/i.test(x.module) &&
    typeof x.exceptionSignature === "string" && /^[a-f0-9]{16,64}$/i.test(x.exceptionSignature) &&
    typeof x.createdAtMs === "number" && Number.isSafeInteger(x.createdAtMs) && x.createdAtMs > 0;
}

async function authorizedDevice(env: Phase5CEnv, id: string) {
  const row = await env.DB.prepare("SELECT public_key_spki_b64,revoked_at FROM devices WHERE id=?1").bind(id).first<DeviceRecord>();
  return row && row.revoked_at === null ? row : null;
}

export async function ingestCrashReport(req: Request, env: Phase5CEnv, deviceId: string) {
  const rate = await env.DEVICE_RATE.limit({ key: `${deviceId}:crash` });
  if (!rate.success) return json({ error: "rate limited" }, 429);
  const device = await authorizedDevice(env, deviceId);
  if (!device) return json({ error: "device unauthorized" }, 401);
  const signature = req.headers.get("X-Brick-Signature");
  if (!signature || signature.length > 512) return json({ error: "missing or invalid signature" }, 401);
  const bounded = await readBoundedBody(req, 4096);
  if (!bounded.ok || !bounded.body.byteLength) return json({ error: "invalid payload size" }, 400);
  const body = bounded.body;
  if (!(await verifyDeviceSignature(device.public_key_spki_b64, body, signature))) return json({ error: "bad signature" }, 401);

  let decoded: unknown;
  try { decoded = JSON.parse(new TextDecoder().decode(body)); }
  catch { return json({ error: "invalid crash JSON" }, 400); }
  if (!validCrashReport(decoded)) return json({ error: "invalid or privacy-unsafe crash schema" }, 400);

  const now = Date.now();
  if (decoded.createdAtMs > now + 600_000 || decoded.createdAtMs < now - 30 * 86_400_000) {
    return json({ error: "crash timestamp outside allowed window" }, 400);
  }

  const result = await env.DB.prepare(
    "INSERT OR IGNORE INTO crash_reports(report_id,device_id,app_version,module,exception_signature,device_created_at,received_at) VALUES(?1,?2,?3,?4,?5,?6,?7)"
  ).bind(decoded.reportId, deviceId, decoded.appVersion, decoded.module, decoded.exceptionSignature.toLowerCase(), decoded.createdAtMs, now).run();

  return json({ ok: true, reportId: decoded.reportId, duplicate: (result.meta.changes ?? 0) === 0, receivedAt: now });
}

export async function listCrashReports(env: Phase5CEnv, deviceId: string, limit = 50) {
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
  const rows = await env.DB.prepare(
    "SELECT report_id,app_version,module,exception_signature,device_created_at,received_at FROM crash_reports WHERE device_id=?1 ORDER BY received_at DESC LIMIT ?2"
  ).bind(deviceId, safeLimit).all();
  return json({ crashes: rows.results });
}

export function releaseStatus(env: Phase5CEnv) {
  return json({ currentRelease: env.CURRENT_APP_VERSION || "unknown" });
}

function safeAuditPath(raw: string) {
  const u = new URL(raw);
  return u.pathname.slice(0, 240);
}

export async function recordAudit(
  env: Phase5CEnv,
  eventType: string,
  req: Request,
  status: number,
  detail: Record<string, unknown> = {}
) {
  const sanitizedDetail: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (forbiddenCrashKey.test(key)) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) sanitizedDetail[key] = value;
  }
  await env.DB.prepare(
    "INSERT INTO audit_log(event_type,method,path,status,created_at,detail_json) VALUES(?1,?2,?3,?4,?5,?6)"
  ).bind(eventType.slice(0, 64), req.method.slice(0, 12), safeAuditPath(req.url), status, Date.now(), JSON.stringify(sanitizedDetail)).run();
}

export async function listAudit(env: Phase5CEnv, limit = 100) {
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  const rows = await env.DB.prepare(
    "SELECT id,event_type,method,path,status,created_at,detail_json FROM audit_log ORDER BY created_at DESC LIMIT ?1"
  ).bind(safeLimit).all();
  return json({ audit: rows.results });
}

export async function cleanupPhase5C(env: Phase5CEnv, now = Date.now()) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM crash_reports WHERE received_at<?1").bind(now - 365 * 86_400_000),
    env.DB.prepare("DELETE FROM audit_log WHERE created_at<?1").bind(now - 90 * 86_400_000)
  ]);
}
