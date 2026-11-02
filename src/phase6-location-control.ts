import { readBoundedBody } from "./bounded-body";

const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const COMMAND_ID_RE = /^[A-Za-z0-9._:-]{8,128}$/;
const DELIVERY_TTL_MS = 5 * 60_000;
const MAX_BODY_BYTES = 1024;

type LocationControlRow = {
  desired_enabled: number;
  command_id: string;
  issued_at: number;
  last_actual_enabled: number | null;
  last_actual_at: number | null;
  last_acked_command_id: string | null;
};

type JsonCloneRequest = {
  clone(): { json<T>(): Promise<T> };
};

export type LocationControlEnv = { DB: D1Database };

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
  });
}

async function parseJson(req: Request): Promise<Record<string, unknown> | null> {
  const bounded = await readBoundedBody(req, MAX_BODY_BYTES);
  if (!bounded.ok) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bounded.body));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export async function parentSetLocationControl(req: Request, env: LocationControlEnv, deviceId: string): Promise<Response> {
  if (!DEVICE_ID_RE.test(deviceId)) return json({ error: "invalid device id" }, 400);
  const body = await parseJson(req);
  if (!body || typeof body.enabled !== "boolean" || Object.keys(body).some(k => k !== "enabled")) {
    return json({ error: "expected { enabled: boolean }" }, 400);
  }

  const device = await env.DB.prepare("SELECT revoked_at FROM devices WHERE id=?1 LIMIT 1")
    .bind(deviceId).first<{ revoked_at: number | null }>();
  if (!device) return json({ error: "device not found" }, 404);
  if (device.revoked_at !== null) return json({ error: "device is revoked" }, 409);

  const now = Date.now();
  const commandId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO device_location_control(device_id,desired_enabled,command_id,issued_at,updated_at)
     VALUES(?1,?2,?3,?4,?4)
     ON CONFLICT(device_id) DO UPDATE SET
       desired_enabled=excluded.desired_enabled,
       command_id=excluded.command_id,
       issued_at=CASE
         WHEN excluded.issued_at <= device_location_control.issued_at THEN device_location_control.issued_at + 1
         ELSE excluded.issued_at
       END,
       updated_at=excluded.updated_at`
  ).bind(deviceId, body.enabled ? 1 : 0, commandId, now).run();

  // Read back this command's stored sequence time. If another parent command already superseded it,
  // the phone will receive only that newer row; this response remains an acknowledgement of this tap.
  const stored = await env.DB.prepare(
    "SELECT issued_at FROM device_location_control WHERE device_id=?1 AND command_id=?2 LIMIT 1"
  ).bind(deviceId, commandId).first<{ issued_at: number }>();

  return json({ ok: true, deviceId, desiredEnabled: body.enabled, commandId, issuedAtMs: stored?.issued_at ?? now });
}

export async function parentGetLocationControl(env: LocationControlEnv, deviceId: string): Promise<Response> {
  if (!DEVICE_ID_RE.test(deviceId)) return json({ error: "invalid device id" }, 400);
  const row = await env.DB.prepare(
    "SELECT desired_enabled,command_id,issued_at,last_actual_enabled,last_actual_at,last_acked_command_id FROM device_location_control WHERE device_id=?1 LIMIT 1"
  ).bind(deviceId).first<LocationControlRow>();

  if (!row) {
    return json({
      deviceId,
      desiredEnabled: true,
      configured: false,
      actualEnabled: null,
      actualObservedAtMs: null,
      matchesDesired: null,
      lastAckedCommandId: null
    });
  }
  const desired = row.desired_enabled === 1;
  const actual = row.last_actual_enabled === null ? null : row.last_actual_enabled === 1;
  return json({
    deviceId,
    desiredEnabled: desired,
    configured: true,
    commandId: row.command_id,
    issuedAtMs: row.issued_at,
    actualEnabled: actual,
    actualObservedAtMs: row.last_actual_at,
    matchesDesired: actual === null ? null : actual === desired,
    lastAckedCommandId: row.last_acked_command_id
  });
}

/** Add a short-lived, device-bound delivery envelope to an already-authenticated child health response. */
export async function augmentHealthWithLocationControl(response: Response, env: LocationControlEnv, deviceId: string): Promise<Response> {
  if (!response.ok || !DEVICE_ID_RE.test(deviceId)) return response;
  const type = (response.headers.get("Content-Type") ?? "").toLowerCase();
  if (!type.includes("application/json")) return response;

  let body: Record<string, unknown>;
  try { body = await response.json<Record<string, unknown>>(); }
  catch { return response; }

  const row = await env.DB.prepare(
    "SELECT desired_enabled,command_id,issued_at,last_actual_enabled,last_actual_at,last_acked_command_id FROM device_location_control WHERE device_id=?1 LIMIT 1"
  ).bind(deviceId).first<LocationControlRow>();

  if (!row || !COMMAND_ID_RE.test(row.command_id)) {
    return new Response(JSON.stringify(body), { status: response.status, headers: response.headers });
  }

  const now = Date.now();
  const locationCommand = {
    protocol: 1,
    deviceId,
    commandId: row.command_id,
    nonce: crypto.randomUUID(),
    desiredEnabled: row.desired_enabled === 1,
    issuedAtMs: row.issued_at,
    expiresAtMs: now + DELIVERY_TTL_MS
  };
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify({ ...body, locationCommand }), { status: response.status, headers });
}

/** Record the phone's actual Location state and acknowledgement after the signed health request was accepted. */
export async function noteLocationControlHealth(req: JsonCloneRequest, env: LocationControlEnv, deviceId: string): Promise<void> {
  if (!DEVICE_ID_RE.test(deviceId)) return;
  let body: Record<string, unknown>;
  try { body = await req.clone().json<Record<string, unknown>>(); }
  catch { return; }

  const actual = body.locationEnabled;
  if (typeof actual !== "boolean") return;
  const commandId = typeof body.locationControlCommandId === "string" && COMMAND_ID_RE.test(body.locationControlCommandId)
    ? body.locationControlCommandId : null;
  const now = Date.now();

  await env.DB.prepare(
    `UPDATE device_location_control
     SET last_actual_enabled=?1,last_actual_at=?2,
         last_acked_command_id=CASE WHEN command_id=?3 THEN ?3 ELSE last_acked_command_id END
     WHERE device_id=?4`
  ).bind(actual ? 1 : 0, now, commandId, deviceId).run();
}
