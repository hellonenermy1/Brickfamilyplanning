import { readBoundedBody } from "./bounded-body";

export type P8BControlEnv = { DB: D1Database };
const DEVICE_RE = /^[0-9a-f-]{36}$/i;
const ID_RE = /^[A-Za-z0-9._:-]{1,96}$/;
const MAX_BODY = 32 * 1024;
const LIVE_TRACK_MAX_MS = 10 * 60_000;

// The later P8B control routes are intercepted before worker-v6's archived-device
// dispatcher. Enforce revocation at this trust boundary, not only in the old layer.
async function requireWritableDevice(env: P8BControlEnv, deviceId: string): Promise<Response | null> {
  if (!DEVICE_RE.test(deviceId)) return json({ error: "invalid device" }, 400);
  const row = await env.DB.prepare("SELECT revoked_at FROM devices WHERE id=?1 LIMIT 1")
    .bind(deviceId).first<{ revoked_at: number | null }>();
  if (!row) return json({ error: "device not found" }, 404);
  if (row.revoked_at !== null) return json({ error: "device revoked; controls are read-only" }, 410);
  return null;
}

type CloneJson = { clone(): { json<T>(): Promise<T> } };
function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
async function body(req: Request): Promise<Record<string, unknown> | null> {
  const b = await readBoundedBody(req, MAX_BODY); if (!b.ok) return null;
  try { const x = JSON.parse(new TextDecoder().decode(b.body)); return x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : null; } catch { return null; }
}

export async function parentSetLiveTrack(req: Request, env: P8BControlEnv, deviceId: string) {
  const denied = await requireWritableDevice(env, deviceId); if (denied) return denied;
  const b = await body(req); if (!b || typeof b.active !== "boolean") return json({ error: "expected {active:boolean}" }, 400);
  const now = Date.now(), id = crypto.randomUUID(), expires = now + LIVE_TRACK_MAX_MS;
  const result = await env.DB.prepare(
    `INSERT INTO device_live_track_control(device_id,command_id,requested_active,issued_at,expires_at,command_status)
     SELECT ?1,?2,?3,?4,?5,'pending'
     WHERE EXISTS (SELECT 1 FROM devices WHERE id=?1 AND revoked_at IS NULL)
     ON CONFLICT(device_id) DO UPDATE SET command_id=excluded.command_id,requested_active=excluded.requested_active,
       issued_at=excluded.issued_at,expires_at=excluded.expires_at,command_status='pending',last_actual_active=NULL,completed_at=NULL,result_reason=NULL
     WHERE EXISTS (SELECT 1 FROM devices WHERE id=?1 AND revoked_at IS NULL)`
  ).bind(deviceId, id, b.active ? 1 : 0, now, expires).run();
  if (result.meta.changes !== 1) return json({ error: "device no longer active" }, 410);
  return json({ ok: true, commandId: id, requestedActive: b.active, status: "pending", issuedAtMs: now, expiresAtMs: expires });
}

export async function parentGetLiveTrack(env: P8BControlEnv, deviceId: string) {
  const row = await env.DB.prepare("SELECT command_id,requested_active,issued_at,expires_at,command_status,last_actual_active,completed_at,result_reason FROM device_live_track_control WHERE device_id=?1")
    .bind(deviceId).first<Record<string, unknown>>();
  if (!row) return json({ deviceId, lastCommand: null });
  let status = String(row.command_status ?? "pending");
  if (status === "pending" && Number(row.expires_at) <= Date.now()) {
    status = "expired";
    await env.DB.prepare("UPDATE device_live_track_control SET command_status='expired',completed_at=?1,result_reason='expired_before_phone_confirmation' WHERE device_id=?2 AND command_status='pending'")
      .bind(Date.now(), deviceId).run();
  }
  return json({ deviceId, lastCommand: { commandId: row.command_id, requestedActive: Number(row.requested_active) === 1, issuedAtMs: row.issued_at, expiresAtMs: row.expires_at, status, actualActive: row.last_actual_active == null ? null : Number(row.last_actual_active) === 1, completedAtMs: row.completed_at, reason: row.result_reason } });
}

export async function parentSetWifiSchedules(req: Request, env: P8BControlEnv, deviceId: string) {
  const denied = await requireWritableDevice(env, deviceId); if (denied) return denied;
  const b = await body(req); const list = b?.schedules;
  if (!Array.isArray(list) || list.length > 8) return json({ error: "expected schedules array <=8" }, 400);
  const normalized: Array<{id:string;enabled:boolean;targetEnabled:boolean;localMinuteOfDay:number;daysMask:number;graceMinutes:number}> = [];
  const seen = new Set<string>();
  for (const raw of list) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return json({ error: "invalid schedule" }, 400);
    const x = raw as Record<string, unknown>;
    if (typeof x.id !== "string" || !ID_RE.test(x.id) || seen.has(x.id) || typeof x.enabled !== "boolean" || typeof x.targetEnabled !== "boolean" ||
        typeof x.localMinuteOfDay !== "number" || !Number.isInteger(x.localMinuteOfDay) || x.localMinuteOfDay < 0 || x.localMinuteOfDay > 1439 ||
        typeof x.daysMask !== "number" || !Number.isInteger(x.daysMask) || x.daysMask < 1 || x.daysMask > 127 ||
        typeof x.graceMinutes !== "number" || !Number.isInteger(x.graceMinutes) || x.graceMinutes < 1 || x.graceMinutes > 120) return json({ error: "invalid schedule" }, 400);
    seen.add(x.id); normalized.push(x as typeof normalized[number]);
  }
  const now = Date.now();
  const statements = [env.DB.prepare("DELETE FROM device_wifi_schedules WHERE device_id=?1 AND EXISTS (SELECT 1 FROM devices WHERE id=?1 AND revoked_at IS NULL)").bind(deviceId), ...normalized.map(s =>
    env.DB.prepare(`INSERT INTO device_wifi_schedules(id,device_id,enabled,target_enabled,local_minute_of_day,days_mask,grace_minutes,updated_at)
      SELECT ?1,?2,?3,?4,?5,?6,?7,?8 WHERE EXISTS (SELECT 1 FROM devices WHERE id=?2 AND revoked_at IS NULL)`)
      .bind(s.id, deviceId, s.enabled ? 1 : 0, s.targetEnabled ? 1 : 0, s.localMinuteOfDay, s.daysMask, s.graceMinutes, now))];
  await env.DB.batch(statements);
  const after = await requireWritableDevice(env, deviceId); if (after) return after;
  return json({ ok: true, schedules: normalized });
}

export async function parentGetWifiSchedules(env: P8BControlEnv, deviceId: string) {
  const [schedules, result] = await Promise.all([
    env.DB.prepare("SELECT id,enabled,target_enabled,local_minute_of_day,days_mask,grace_minutes,updated_at FROM device_wifi_schedules WHERE device_id=?1 ORDER BY id").bind(deviceId).all(),
    env.DB.prepare("SELECT schedule_id,target_enabled,actual_enabled,status,attempted_at,detail,received_at FROM device_wifi_schedule_result WHERE device_id=?1").bind(deviceId).first()
  ]);
  return json({ schedules: schedules.results, lastPhoneResult: result ?? null });
}

export async function parentRenameDevice(req: Request, env: P8BControlEnv, deviceId: string) {
  const b = await body(req); const name = typeof b?.name === "string" ? b.name.trim() : "";
  if (!name || name.length > 64) return json({ error: "name must be 1..64 chars" }, 400);
  const r = await env.DB.prepare("UPDATE devices SET name=?1 WHERE id=?2 AND revoked_at IS NULL").bind(name, deviceId).run();
  if ((r.meta.changes ?? 0) !== 1) return json({ error: "device not found" }, 404);
  return json({ ok: true, deviceId, name });
}

export async function augmentHealthWithP8BControls(response: Response, env: P8BControlEnv, deviceId: string): Promise<Response> {
  if (!response.ok) return response;
  let base: Record<string, unknown>; try { base = await response.json<Record<string, unknown>>(); } catch { return response; }
  const now = Date.now();
  const [live, wifi] = await Promise.all([
    env.DB.prepare("SELECT command_id,requested_active,issued_at,expires_at,command_status FROM device_live_track_control WHERE device_id=?1").bind(deviceId).first<Record<string, unknown>>(),
    env.DB.prepare("SELECT id,enabled,target_enabled,local_minute_of_day,days_mask,grace_minutes FROM device_wifi_schedules WHERE device_id=?1 ORDER BY id").bind(deviceId).all<Record<string, unknown>>()
  ]);
  let liveTrackCommand: unknown = undefined;
  if (live && live.command_status === "pending" && Number(live.expires_at) > now) {
    liveTrackCommand = { protocol: 1, deviceId, commandId: live.command_id, active: Number(live.requested_active) === 1, issuedAtMs: live.issued_at, expiresAtMs: live.expires_at, nonce: crypto.randomUUID() };
  }
  const wifiSchedules = wifi.results.map(r => ({ id: r.id, enabled: Number(r.enabled) === 1, targetEnabled: Number(r.target_enabled) === 1, localMinuteOfDay: r.local_minute_of_day, daysMask: r.days_mask, graceMinutes: r.grace_minutes }));
  const headers = new Headers(response.headers); headers.set("Content-Type", "application/json; charset=utf-8"); headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify({ ...base, ...(liveTrackCommand ? { liveTrackCommand } : {}), wifiSchedules }), { status: response.status, headers });
}

function capabilitySnapshotFromHealth(b: Record<string, unknown>, now: number) {
  const keys = [
    "fineLocationPermission","backgroundLocationPermission","activityRecognitionPermission","bluetoothScanPermission","nearbyWifiPermission",
    "notificationPermission","batteryOptimizationExempt","backgroundRestricted","accelerometerAvailable","gyroscopeAvailable","magnetometerAvailable",
    "rotationVectorAvailable","stepCounterAvailable","stepDetectorAvailable","privilegedProvider","privilegedAvailable","privilegedConnected",
    "privilegedPermissionGranted","privilegedCapabilities","atlasWifiProviderCapability","atlasRttProviderCapability","atlasBleProviderCapability",
    "atlasCellularProviderCapability","atlasLanProviderCapability","atlasGnssProviderCapability","atlasNetworkProviderCapability","atlasDeviceContextProviderCapability"
  ];
  const out: Record<string, unknown> = { version: 1, updatedAtMs: now };
  for (const key of keys) if (b[key] !== undefined) out[key] = b[key];
  return out;
}

async function storeCapabilityProfile(env: P8BControlEnv, deviceId: string, profile: Record<string, unknown>, now: number) {
  const version = Number(profile.version), updated = Number(profile.updatedAtMs), text = JSON.stringify(profile);
  if (!Number.isInteger(version) || version < 1 || !Number.isSafeInteger(updated) || updated <= 0 || text.length > 16_000) return;
  await env.DB.prepare(`INSERT INTO device_capability_profile(device_id,profile_version,profile_json,device_updated_at,received_at) VALUES(?1,?2,?3,?4,?5)
    ON CONFLICT(device_id) DO UPDATE SET profile_version=excluded.profile_version,profile_json=excluded.profile_json,device_updated_at=excluded.device_updated_at,received_at=excluded.received_at`)
    .bind(deviceId, version, text, updated, now).run();
}

export async function noteP8BHealth(req: CloneJson, env: P8BControlEnv, deviceId: string) {
  let b: Record<string, unknown>; try { b = await req.clone().json<Record<string, unknown>>(); } catch { return; }
  const now = Date.now();

  // Prefer explicit command history when present. For current V1 clients the authenticated actual
  // state itself is also sufficient to complete the single pending command because there can be only
  // one current command per device and the phone only changes this cadence after validating it.
  const liveId = typeof b.liveTrackCommandId === "string" ? b.liveTrackCommandId : null;
  const liveStatus = typeof b.liveTrackCommandStatus === "string" ? b.liveTrackCommandStatus : null;
  const actualLive = typeof b.liveTrackActive === "boolean" ? b.liveTrackActive : null;
  if (liveId && (liveStatus === "completed" || liveStatus === "failed")) {
    const reason = typeof b.liveTrackResultDetail === "string" ? b.liveTrackResultDetail.slice(0,120) : null;
    await env.DB.prepare("UPDATE device_live_track_control SET command_status=?1,last_actual_active=?2,completed_at=?3,result_reason=?4 WHERE device_id=?5 AND command_id=?6")
      .bind(liveStatus, actualLive === null ? null : actualLive ? 1 : 0, now, reason, deviceId, liveId).run();
  } else if (actualLive !== null) {
    const pending = await env.DB.prepare("SELECT command_id,requested_active,expires_at FROM device_live_track_control WHERE device_id=?1 AND command_status='pending'")
      .bind(deviceId).first<{ command_id: string; requested_active: number; expires_at: number }>();
    if (pending && pending.expires_at > now && actualLive === (pending.requested_active === 1)) {
      await env.DB.prepare("UPDATE device_live_track_control SET command_status='completed',last_actual_active=?1,completed_at=?2,result_reason='signed_phone_actual_confirmed' WHERE device_id=?3 AND command_id=?4 AND command_status='pending'")
        .bind(actualLive ? 1 : 0, now, deviceId, pending.command_id).run();
    }
  }

  const wr = b.wifiScheduleResult;
  if (wr && typeof wr === "object" && !Array.isArray(wr)) {
    const x = wr as Record<string, unknown>;
    if (typeof x.scheduleId === "string" && ID_RE.test(x.scheduleId) && typeof x.targetEnabled === "boolean" && typeof x.status === "string" &&
        typeof x.attemptedAtMs === "number" && Number.isSafeInteger(x.attemptedAtMs)) {
      const actual = typeof x.actualEnabled === "boolean" ? x.actualEnabled : null;
      await env.DB.prepare(`INSERT INTO device_wifi_schedule_result(device_id,schedule_id,target_enabled,actual_enabled,status,attempted_at,detail,received_at)
        VALUES(?1,?2,?3,?4,?5,?6,?7,?8) ON CONFLICT(device_id) DO UPDATE SET schedule_id=excluded.schedule_id,target_enabled=excluded.target_enabled,
        actual_enabled=excluded.actual_enabled,status=excluded.status,attempted_at=excluded.attempted_at,detail=excluded.detail,received_at=excluded.received_at`)
        .bind(deviceId, x.scheduleId, x.targetEnabled ? 1 : 0, actual === null ? null : actual ? 1 : 0, x.status.slice(0,40), x.attemptedAtMs, typeof x.detail === "string" ? x.detail.slice(0,120) : null, now).run();
    }
  }

  const cp = b.capabilityProfile;
  if (cp && typeof cp === "object" && !Array.isArray(cp)) await storeCapabilityProfile(env, deviceId, cp as Record<string, unknown>, now);
  else await storeCapabilityProfile(env, deviceId, capabilitySnapshotFromHealth(b, now), now);
}
