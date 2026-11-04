import { readBoundedBody } from "./bounded-body";

const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const COMMAND_ID_RE = /^[A-Za-z0-9._:-]{8,128}$/;
const DELIVERY_TTL_MS = 5 * 60_000;
const LOGICAL_COMMAND_TTL_MS = 10 * 60_000;
const MAX_BODY_BYTES = 1024;

type LocationControlRow = {
  desired_enabled: number;
  command_id: string;
  issued_at: number;
  last_actual_enabled: number | null;
  last_actual_at: number | null;
  last_acked_command_id: string | null;
  command_status: string;
  completed_at: number | null;
  result_actual_enabled: number | null;
  result_success: number | null;
  result_reason: string | null;
};

type JsonCloneRequest = { clone(): { json<T>(): Promise<T> } };
export type LocationControlEnv = { DB: D1Database };

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

async function parseJson(req: Request): Promise<Record<string, unknown> | null> {
  const bounded = await readBoundedBody(req, MAX_BODY_BYTES);
  if (!bounded.ok) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bounded.body));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
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
  const write = await env.DB.prepare(
    `INSERT INTO device_location_control(device_id,desired_enabled,command_id,issued_at,updated_at,command_status)
     SELECT ?1,?2,?3,?4,?4,'pending'
     WHERE EXISTS (SELECT 1 FROM devices WHERE id=?1 AND revoked_at IS NULL)
     ON CONFLICT(device_id) DO UPDATE SET
       desired_enabled=excluded.desired_enabled,
       command_id=excluded.command_id,
       issued_at=CASE WHEN excluded.issued_at <= device_location_control.issued_at THEN device_location_control.issued_at + 1 ELSE excluded.issued_at END,
       updated_at=excluded.updated_at,
       command_status='pending',completed_at=NULL,result_actual_enabled=NULL,result_success=NULL,result_reason=NULL,last_acked_command_id=NULL
     WHERE EXISTS (SELECT 1 FROM devices WHERE id=?1 AND revoked_at IS NULL)`
  ).bind(deviceId, body.enabled ? 1 : 0, commandId, now).run();
  // Recheck in the same atomic SQLite statement as INSERT/UPSERT. A device can
  // be revoked after the earlier read. Never acknowledge a command written to a
  // revoked identity, or overwrite its last observed command history.
  if ((write.meta.changes ?? 0) !== 1) return json({ error: "device no longer active" }, 410);
  const stored = await env.DB.prepare("SELECT issued_at FROM device_location_control WHERE device_id=?1 AND command_id=?2 LIMIT 1")
    .bind(deviceId, commandId).first<{ issued_at: number }>();
  return json({ ok: true, deviceId, commandId, targetEnabled: body.enabled, status: "pending", issuedAtMs: stored?.issued_at ?? now });
}

export async function parentGetLocationControl(env: LocationControlEnv, deviceId: string): Promise<Response> {
  if (!DEVICE_ID_RE.test(deviceId)) return json({ error: "invalid device id" }, 400);
  const row = await env.DB.prepare(
    "SELECT desired_enabled,command_id,issued_at,last_actual_enabled,last_actual_at,last_acked_command_id,command_status,completed_at,result_actual_enabled,result_success,result_reason FROM device_location_control WHERE device_id=?1 LIMIT 1"
  ).bind(deviceId).first<LocationControlRow>();
  if (!row) return json({ deviceId, actualEnabled: null, actualObservedAtMs: null, lastCommand: null });

  const now = Date.now();
  let status = row.command_status;
  if (status === "pending" && now - row.issued_at > LOGICAL_COMMAND_TTL_MS) {
    status = "expired";
    await env.DB.prepare("UPDATE device_location_control SET command_status='expired',completed_at=?1,result_success=0,result_reason='expired_before_phone_confirmation' WHERE device_id=?2 AND command_id=?3 AND command_status='pending'")
      .bind(now, deviceId, row.command_id).run();
  }
  return json({
    deviceId,
    actualEnabled: row.last_actual_enabled === null ? null : row.last_actual_enabled === 1,
    actualObservedAtMs: row.last_actual_at,
    lastCommand: {
      commandId: row.command_id,
      targetEnabled: row.desired_enabled === 1,
      issuedAtMs: row.issued_at,
      status,
      completedAtMs: row.completed_at,
      actualAfter: row.result_actual_enabled === null ? null : row.result_actual_enabled === 1,
      success: row.result_success === null ? null : row.result_success === 1,
      reason: row.result_reason
    }
  });
}

/** Deliver only an uncompleted one-shot command. Completed/failed/expired commands are history. */
export async function augmentHealthWithLocationControl(response: Response, env: LocationControlEnv, deviceId: string): Promise<Response> {
  if (!response.ok || !DEVICE_ID_RE.test(deviceId)) return response;
  const type = (response.headers.get("Content-Type") ?? "").toLowerCase();
  if (!type.includes("application/json")) return response;
  let body: Record<string, unknown>;
  try { body = await response.json<Record<string, unknown>>(); } catch { return response; }

  const row = await env.DB.prepare(
    "SELECT desired_enabled,command_id,issued_at,last_actual_enabled,last_actual_at,last_acked_command_id,command_status,completed_at,result_actual_enabled,result_success,result_reason FROM device_location_control WHERE device_id=?1 LIMIT 1"
  ).bind(deviceId).first<LocationControlRow>();
  if (!row || !COMMAND_ID_RE.test(row.command_id) || row.command_status !== "pending" || row.last_acked_command_id === row.command_id) {
    return new Response(JSON.stringify(body), { status: response.status, headers: response.headers });
  }

  const now = Date.now();
  if (now - row.issued_at > LOGICAL_COMMAND_TTL_MS) {
    await env.DB.prepare("UPDATE device_location_control SET command_status='expired',completed_at=?1,result_success=0,result_reason='expired_before_delivery' WHERE device_id=?2 AND command_id=?3 AND command_status='pending'")
      .bind(now, deviceId, row.command_id).run();
    return new Response(JSON.stringify(body), { status: response.status, headers: response.headers });
  }

  const locationCommand = {
    protocol: 1,
    deviceId,
    commandId: row.command_id,
    nonce: crypto.randomUUID(),
    desiredEnabled: row.desired_enabled === 1,
    issuedAtMs: row.issued_at,
    expiresAtMs: Math.min(row.issued_at + LOGICAL_COMMAND_TTL_MS, now + DELIVERY_TTL_MS)
  };
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify({ ...body, locationCommand }), { status: response.status, headers });
}

/** Record actual current Location plus completion truth from the next authenticated child health. */
export async function noteLocationControlHealth(req: JsonCloneRequest, env: LocationControlEnv, deviceId: string): Promise<void> {
  if (!DEVICE_ID_RE.test(deviceId)) return;
  let body: Record<string, unknown>;
  try { body = await req.clone().json<Record<string, unknown>>(); } catch { return; }
  const actual = body.locationEnabled;
  if (typeof actual !== "boolean") return;
  const commandId = typeof body.locationControlCommandId === "string" && COMMAND_ID_RE.test(body.locationControlCommandId) ? body.locationControlCommandId : null;
  const commandStatus = typeof body.locationControlCommandStatus === "string" ? body.locationControlCommandStatus : null;
  const actualAfter = typeof body.locationControlActualAfter === "boolean" ? body.locationControlActualAfter : null;
  const completedAt = typeof body.locationControlCompletedAtMs === "number" && Number.isSafeInteger(body.locationControlCompletedAtMs) && body.locationControlCompletedAtMs > 0
    ? body.locationControlCompletedAtMs : null;
  const reason = typeof body.locationControlResultDetail === "string" ? body.locationControlResultDetail.slice(0, 120) : null;
  const now = Date.now();

  await env.DB.prepare("UPDATE device_location_control SET last_actual_enabled=?1,last_actual_at=?2 WHERE device_id=?3")
    .bind(actual ? 1 : 0, now, deviceId).run();

  if (!commandId || (commandStatus !== "completed" && commandStatus !== "failed")) return;
  await env.DB.prepare(
    `UPDATE device_location_control SET
       last_acked_command_id=?1,command_status=?2,completed_at=COALESCE(?3,?4),result_actual_enabled=?5,
       result_success=?6,result_reason=?7,updated_at=?4
     WHERE device_id=?8 AND command_id=?1 AND command_status='pending'
       AND issued_at>=?4-600000`
  ).bind(commandId, commandStatus, completedAt, now, actualAfter === null ? null : actualAfter ? 1 : 0,
    commandStatus === "completed" ? 1 : 0, reason, deviceId).run();
}
