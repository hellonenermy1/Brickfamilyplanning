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
  // Never persist attacker-controlled path segments, device IDs, pairing-session IDs or URLs.
  // Log a fixed vocabulary instead; unknown segments intentionally collapse to {redacted}.
  const segments = new URL(raw).pathname.split("/").slice(1).filter(Boolean);
  const fixed = new Set([
    "parent", "api", "pair", "pin", "start", "confirm", "status", "devices", "device",
    "revoke", "geofences", "ble-anchors", "location-control", "live-track",
    "wifi-schedules", "rename", "trips", "end", "retention", "screen-time",
    "commutes", "history", "events", "crashes", "state", "health", "reliability",
    "battery-drain", "audit", "release", "onemap", "reverse", "logout", "login"
  ]);
  const safe = segments.map((segment, index) => {
    const deviceRoot = segments[0] === "parent" && segments[1] === "api" &&
      segments[2] === "device";
    if (deviceRoot && index === 3) return "{device}";
    if (deviceRoot && index === 5 && ["geofences", "ble-anchors", "trips"].includes(segments[4])) {
      return "{resource}";
    }
    if (segments[0] === "parent" && segments[1] === "api" && segments[2] === "pair" &&
        segments[3] === "pin" && index === 4 && segment !== "start") return "{session}";
    return fixed.has(segment) ? segment : "{redacted}";
  });
  return ("/" + safe.join("/")).slice(0, 240);
}

async function pseudonymousAuditDeviceRef(id: string) {
  // A device ID is a randomly generated UUID: its truncated digest permits D1 audit correlation
  // without writing its raw ID. Do not apply this approach to low-entropy user-supplied secrets.
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id));
  return Array.from(new Uint8Array(bytes)).slice(0, 12).map(x => x.toString(16).padStart(2, "0")).join("");
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
    if (key === "deviceId" && typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value)) {
      sanitizedDetail.deviceRef = await pseudonymousAuditDeviceRef(value);
      continue;
    }
    // Do not persist arbitrary details or raw IDs/tokens. Audit outcomes remain observable
    // through the event_type, method, route template, status and a small safe reason vocabulary.
    if (key === "reason" && typeof value === "string" && /^[a-z0-9_-]{1,64}$/i.test(value)) {
      sanitizedDetail.reason = value;
    }
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
    env.DB.prepare("DELETE FROM crash_reports WHERE rowid IN(SELECT rowid FROM crash_reports WHERE received_at<?1 ORDER BY received_at,rowid LIMIT 200)").bind(now - 365 * 86_400_000),
    env.DB.prepare("DELETE FROM audit_log WHERE rowid IN(SELECT rowid FROM audit_log WHERE created_at<?1 ORDER BY created_at,rowid LIMIT 200)").bind(now - 90 * 86_400_000)
  ]);
}
