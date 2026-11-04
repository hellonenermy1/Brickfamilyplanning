import { BrickDevice, type DeviceHealth, type RealtimeSafetyEvent } from "./device-do";
import { decodeLivePacket, V1_BYTES, V2_BYTES, type LivePacket } from "./protocol";
import { randomToken, sha256Hex, verifyDeviceSignature } from "./crypto";
import {
  createGeofence,
  deleteGeofence,
  finishTrip,
  getRetention,
  history,
  listGeofences,
  listTrips,
  runRetentionCleanup,
  startTrip,
  updateGeofence,
  updateRetention
} from "./phase4";
import {
  alertPersistentIncidents,
  cleanupOps,
  listHealthIncidents,
  openOfflineIncident,
  recordHealthObservation,
  reliability
} from "./phase5-ops";
import { processHistoryBatch } from "./history-store";
import { parentV4Html } from "./parent-v4";
export { BrickDevice };

type RateLimit = { limit(input: { key: string }): Promise<{ success: boolean }> };
type Env = {
  DB: D1Database;
  HISTORY: R2Bucket;
  EVENTS: Queue;
  BRICK_DEVICE: DurableObjectNamespace<BrickDevice>;
  DEVICE_RATE: RateLimit;
  PAIR_RATE: RateLimit;
  APP_ENV: string;
};
type PairStartBody = { name?: string };
type PairCompleteBody = { token?: string; publicKeySpkiB64?: string };
type DeviceRecord = { public_key_spki_b64: string; revoked_at: number | null };
type SafetyEvent = {
  protocol: 1;
  eventId: string;
  kind:
    | "safe_checkin" | "sos_started" | "sos_cancelled"
    | "battery_low" | "battery_critical" | "charging_started" | "charging_stopped"
    | "geofence_enter" | "geofence_exit"
    | "trip_started" | "trip_ended" | "trip_alert";
  createdAtMs: number;
  latitude?: number | null;
  longitude?: number | null;
  accuracyM?: number | null;
  detail?: Record<string, unknown>;
};

const EVENT_KINDS = new Set<SafetyEvent["kind"]>([
  "safe_checkin", "sos_started", "sos_cancelled",
  "battery_low", "battery_critical", "charging_started", "charging_stopped",
  "geofence_enter", "geofence_exit", "trip_started", "trip_ended", "trip_alert"
]);

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline' https://unpkg.com; script-src 'self' https://unpkg.com; connect-src 'self' wss:; img-src 'self' data: https:; worker-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "X-Frame-Options": "DENY",
  "Cache-Control": "no-store"
};

function json(data: unknown, status = 200) { return Response.json(data, { status, headers: securityHeaders }); }
function noStore(resp: Response) {
  const h = new Headers(resp.headers);
  Object.entries(securityHeaders).forEach(([k, v]) => h.set(k, v));
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: h });
}
function parentAuthorized(req: Request) {
  const u = new URL(req.url);
  return u.hostname === "localhost" || u.hostname === "127.0.0.1" || Boolean(req.headers.get("Cf-Access-Jwt-Assertion"));
}
async function parentOnly(req: Request) { return parentAuthorized(req) ? null : json({ error: "Cloudflare Access authentication required" }, 401); }
async function getAuthorizedDevice(env: Env, id: string) {
  const d = await env.DB.prepare("SELECT public_key_spki_b64,revoked_at FROM devices WHERE id=?1").bind(id).first<DeviceRecord>();
  return d && !d.revoked_at ? d : null;
}
async function ensureParentDevice(req: Request, env: Env, id: string) {
  const denied = await parentOnly(req); if (denied) return denied;
  const x = await env.DB.prepare("SELECT id FROM devices WHERE id=?1 AND revoked_at IS NULL").bind(id).first();
  return x ? null : json({ error: "device not found" }, 404);
}
async function verifySignedPayload(req: Request, d: DeviceRecord, max: number): Promise<ArrayBuffer | Response> {
  const sig = req.headers.get("X-Brick-Signature");
  if (!sig || sig.length > 512) return json({ error: "missing or invalid signature" }, 401);
  const p = await req.arrayBuffer();
  if (!p.byteLength || p.byteLength > max) return json({ error: "invalid payload size" }, 400);
  if (!(await verifyDeviceSignature(d.public_key_spki_b64, p, sig))) return json({ error: "bad signature" }, 401);
  return p;
}

async function createPairing(req: Request, env: Env) {
  const denied = await parentOnly(req); if (denied) return denied;
  const rl = await env.PAIR_RATE.limit({ key: "parent-pair-start" }); if (!rl.success) return json({ error: "rate limited" }, 429);
  const b: PairStartBody = await req.json<PairStartBody>().catch(() => ({}));
  const name = (b.name ?? "Child device").trim().slice(0, 64) || "Child device";
  const token = randomToken(24), hash = await sha256Hex(token), expiresAt = Date.now() + 600_000;
  await env.DB.prepare("INSERT INTO pairing_tokens(token_hash,device_name,expires_at) VALUES(?1,?2,?3)").bind(hash, name, expiresAt).run();
  return json({ token, expiresAt });
}

async function completePairing(req: Request, env: Env) {
  const b: PairCompleteBody = await req.json<PairCompleteBody>().catch(() => ({}));
  if (!b.token || !b.publicKeySpkiB64) return json({ error: "missing fields" }, 400);
  const rl = await env.PAIR_RATE.limit({ key: `pair-complete:${b.token.slice(0, 12)}` }); if (!rl.success) return json({ error: "rate limited" }, 429);
  if (b.publicKeySpkiB64.length > 2048) return json({ error: "bad public key" }, 400);
  const hash = await sha256Hex(b.token), now = Date.now();
  const consumed = await env.DB.prepare(
    "UPDATE pairing_tokens SET consumed_at=?1 WHERE token_hash=?2 AND consumed_at IS NULL AND expires_at>=?1 RETURNING device_name"
  ).bind(now, hash).first<{ device_name: string }>();
  if (!consumed) return json({ error: "invalid or expired token" }, 400);
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare("INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?1,?2,?3,?4)")
      .bind(id, consumed.device_name, b.publicKeySpkiB64, now).run();
    await env.DB.prepare("INSERT OR IGNORE INTO retention_settings(device_id,safety_event_days,updated_at) VALUES(?1,180,?2)").bind(id, now).run();
  } catch {
    return json({ error: "device registration failed; create a new pairing code" }, 500);
  }
  return json({ deviceId: id, apiBase: new URL(req.url).origin });
}

async function ingest(req: Request, env: Env, id: string) {
  const rl = await env.DEVICE_RATE.limit({ key: id }); if (!rl.success) return json({ error: "rate limited" }, 429);
  const d = await getAuthorizedDevice(env, id); if (!d) return json({ error: "device unauthorized" }, 401);
  const v = await verifySignedPayload(req, d, V2_BYTES); if (v instanceof Response) return v;
  if (v.byteLength !== V1_BYTES && v.byteLength !== V2_BYTES) return json({ error: "bad packet length" }, 400);
  let packet: LivePacket; try { packet = decodeLivePacket(v); } catch (e) { return json({ error: String(e) }, 400); }
  const now = Date.now();
  const [seen, advance] = await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO device_events(device_id,epoch,sequence,kind,created_at) VALUES(?1,?2,?3,'location',?4)").bind(id, packet.epoch, packet.sequence, now),
    env.DB.prepare("UPDATE devices SET last_epoch=?1,last_sequence=?2,last_seen_at=?3 WHERE id=?4 AND revoked_at IS NULL AND (last_epoch<?1 OR (last_epoch=?1 AND last_sequence<?2))").bind(packet.epoch, packet.sequence, now, id)
  ]);
  const isNew = (seen.meta.changes ?? 0) > 0, isNewest = (advance.meta.changes ?? 0) > 0;
  if (isNew) await env.EVENTS.send({ type: "location", deviceId: id, packet });
  if (isNewest) {
    const stub = env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(id));
    await stub.setLatest(packet);
  }
  return json({ ack: packet.sequence, duplicate: !isNew, liveAdvanced: isNewest });
}

function validHealth(x: unknown): x is DeviceHealth {
  if (!x || typeof x !== "object") return false;
  const h = x as Record<string, unknown>, n = h.network;
  if (!(h.protocol === 1 && typeof h.elapsedRealtimeMs === "number" && h.elapsedRealtimeMs >= 0 &&
    typeof h.serviceUptimeMs === "number" && h.serviceUptimeMs >= 0 &&
    (h.locationAgeMs === null || (typeof h.locationAgeMs === "number" && h.locationAgeMs >= 0)) &&
    (h.ackAgeMs === null || (typeof h.ackAgeMs === "number" && h.ackAgeMs >= 0)) &&
    typeof h.pendingRecords === "number" && Number.isInteger(h.pendingRecords) && h.pendingRecords >= 0 && h.pendingRecords <= 10_000_000 &&
    (h.oldestPendingAgeMs === null || (typeof h.oldestPendingAgeMs === "number" && h.oldestPendingAgeMs >= 0)) &&
    (n === "wifi" || n === "mobile" || n === "other" || n === "offline") &&
    typeof h.locationEnabled === "boolean" && typeof h.locationSubscribed === "boolean" && typeof h.managed === "boolean" &&
    typeof h.recoveryCount === "number" && Number.isInteger(h.recoveryCount) && h.recoveryCount >= 0 &&
    typeof h.appVersion === "string" && h.appVersion.length <= 64)) return false;
  if (h.pendingSafetyEvents !== undefined && (typeof h.pendingSafetyEvents !== "number" || !Number.isInteger(h.pendingSafetyEvents) || h.pendingSafetyEvents < 0 || h.pendingSafetyEvents > 100_000)) return false;
  if (h.activityMode !== undefined && typeof h.activityMode !== "string") return false;
  if (h.activityConfidence !== undefined && (typeof h.activityConfidence !== "number" || h.activityConfidence < 0 || h.activityConfidence > 100)) return false;
  if (h.trackingIntervalMs !== undefined && (typeof h.trackingIntervalMs !== "number" || h.trackingIntervalMs < 1000 || h.trackingIntervalMs > 300_000)) return false;
  if (h.gnssUsedInFix !== undefined && (typeof h.gnssUsedInFix !== "number" || h.gnssUsedInFix < 0 || h.gnssUsedInFix > 255)) return false;
  if (h.gnssTotal !== undefined && (typeof h.gnssTotal !== "number" || h.gnssTotal < 0 || h.gnssTotal > 255)) return false;
  if (h.batteryPct !== undefined && (typeof h.batteryPct !== "number" || !Number.isInteger(h.batteryPct) || h.batteryPct < 0 || h.batteryPct > 100)) return false;
  const boolFields = [
    "charging", "sosActive", "serviceActive", "fineLocationPermission", "backgroundLocationPermission",
    "activityRecognitionPermission", "notificationPermission", "batteryOptimizationExempt", "powerSaveMode",
    "backgroundRestricted", "networkValidated", "dataSaverRestricted", "accelerometerAvailable", "gyroscopeAvailable",
    "rotationVectorAvailable", "stepCounterAvailable", "stepDetectorAvailable"
  ];
  for (const field of boolFields) if (h[field] !== undefined && typeof h[field] !== "boolean") return false;
  if (h.lastSelfRecoveryAgeMs !== undefined && h.lastSelfRecoveryAgeMs !== null && (typeof h.lastSelfRecoveryAgeMs !== "number" || h.lastSelfRecoveryAgeMs < 0)) return false;
  return true;
}

async function ingestHealth(req: Request, env: Env, id: string) {
  const rl = await env.DEVICE_RATE.limit({ key: `${id}:health` }); if (!rl.success) return json({ error: "rate limited" }, 429);
  const d = await getAuthorizedDevice(env, id); if (!d) return json({ error: "device unauthorized" }, 401);
  const v = await verifySignedPayload(req, d, 8192); if (v instanceof Response) return v;
  let h: unknown; try { h = JSON.parse(new TextDecoder().decode(v)); } catch { return json({ error: "invalid health JSON" }, 400); }
  if (!validHealth(h)) return json({ error: "invalid health schema" }, 400);
  const now = Date.now();
  const classification = await recordHealthObservation(env, id, h, now);
  const serverHealth: DeviceHealth = { ...h, operationalStatus: classification.status, operationalReason: classification.reason };
  await env.DB.prepare("UPDATE devices SET last_health_at=?1,health_status=?2,recovery_count=?3,pending_records=?4,app_version=?5 WHERE id=?6 AND revoked_at IS NULL")
    .bind(now, classification.status, h.recoveryCount, h.pendingRecords, h.appVersion, id).run();
  const stub = env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(id));
  const cf = req.cf as Record<string, unknown> | undefined;
  await Promise.all([
    stub.setHealth(serverHealth),
    stub.setNetworkEvidence({
      country: typeof cf?.country === "string" ? cf.country : null,
      region: typeof cf?.region === "string" ? cf.region : null,
      city: typeof cf?.city === "string" ? cf.city : null,
      colo: typeof cf?.colo === "string" ? cf.colo : null,
      receivedAt: now
    })
  ]);
  return json({ ok: true, receivedAt: now, healthStatus: classification.status, healthReason: classification.reason });
}

function validSafetyEvent(x: unknown): x is SafetyEvent {
  if (!x || typeof x !== "object") return false;
  const e = x as Record<string, unknown>;
  if (e.protocol !== 1 || typeof e.eventId !== "string" || !/^[0-9a-fA-F-]{36}$/.test(e.eventId)) return false;
  if (typeof e.kind !== "string" || !EVENT_KINDS.has(e.kind as SafetyEvent["kind"])) return false;
  if (typeof e.createdAtMs !== "number" || !Number.isFinite(e.createdAtMs)) return false;
  if ((e.latitude === null || e.latitude === undefined) !== (e.longitude === null || e.longitude === undefined)) return false;
  if (e.latitude !== undefined && e.latitude !== null && (typeof e.latitude !== "number" || e.latitude < -90 || e.latitude > 90)) return false;
  if (e.longitude !== undefined && e.longitude !== null && (typeof e.longitude !== "number" || e.longitude < -180 || e.longitude > 180)) return false;
  if (e.accuracyM !== undefined && e.accuracyM !== null && (typeof e.accuracyM !== "number" || e.accuracyM < 0 || e.accuracyM > 100_000)) return false;
  if (e.detail !== undefined && (!e.detail || typeof e.detail !== "object" || Array.isArray(e.detail))) return false;
  return true;
}

async function ingestSafetyEvent(req: Request, env: Env, id: string) {
  const rl = await env.DEVICE_RATE.limit({ key: `${id}:event` }); if (!rl.success) return json({ error: "rate limited" }, 429);
  const d = await getAuthorizedDevice(env, id); if (!d) return json({ error: "device unauthorized" }, 401);
  const v = await verifySignedPayload(req, d, 8192); if (v instanceof Response) return v;
  let e: unknown; try { e = JSON.parse(new TextDecoder().decode(v)); } catch { return json({ error: "invalid event JSON" }, 400); }
  if (!validSafetyEvent(e)) return json({ error: "invalid event schema" }, 400);
  const now = Date.now();
  if (e.createdAtMs > now + 600_000 || e.createdAtMs < now - 30 * 86_400_000) return json({ error: "event timestamp outside allowed window" }, 400);
  const detail = JSON.stringify(e.detail ?? {}); if (detail.length > 4096) return json({ error: "event detail too large" }, 400);
  const r = await env.DB.prepare(
    "INSERT OR IGNORE INTO safety_events(id,device_id,kind,device_created_at,server_created_at,latitude,longitude,accuracy_m,detail_json) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)"
  ).bind(e.eventId, id, e.kind, e.createdAtMs, now, e.latitude ?? null, e.longitude ?? null, e.accuracyM ?? null, detail).run();
  const duplicate = (r.meta.changes ?? 0) === 0;
  if (!duplicate) {
    const event: RealtimeSafetyEvent = {
      id: e.eventId, kind: e.kind, deviceCreatedAt: e.createdAtMs, serverCreatedAt: now,
      latitude: e.latitude ?? null, longitude: e.longitude ?? null, accuracyM: e.accuracyM ?? null,
      detail: e.detail ?? {}
    };
    const stub = env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(id));
    await stub.pushSafetyEvent(event);
  }
  return json({ ok: true, eventId: e.eventId, duplicate, receivedAt: now });
}

async function listDevices(req: Request, env: Env) {
  const d = await parentOnly(req); if (d) return d;
  const r = await env.DB.prepare("SELECT id,name,created_at,last_seen_at,last_health_at,health_status,recovery_count,pending_records,app_version,revoked_at FROM devices ORDER BY created_at DESC").all();
  return json({ devices: r.results });
}
async function listSafetyEvents(req: Request, env: Env, id: string) {
  const d = await ensureParentDevice(req, env, id); if (d) return d;
  const n = Number(new URL(req.url).searchParams.get("limit") ?? "100"), limit = Number.isFinite(n) ? Math.max(1, Math.min(500, Math.trunc(n))) : 100;
  const r = await env.DB.prepare("SELECT id,kind,device_created_at,server_created_at,latitude,longitude,accuracy_m,detail_json FROM safety_events WHERE device_id=?1 ORDER BY server_created_at DESC LIMIT ?2").bind(id, limit).all();
  return json({ events: r.results });
}
async function parentDeviceProxy(req: Request, env: Env, id: string, kind: "state" | "ws") {
  const d = await ensureParentDevice(req, env, id); if (d) return d;
  const stub = env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(id));
  if (kind === "state") return noStore(await stub.fetch(new Request("https://do/state")));
  // Never forward a browser's cookies, Access token or arbitrary headers to the DO.
  // The outer verified parent wrapper creates this short internal lease after validating the session.
  const lease = req.headers.get("X-Brick-Internal-Ws-Lease-Until");
  return stub.fetch(new Request("https://do/ws", {
    method: req.method,
    headers: {
      Upgrade: req.headers.get("Upgrade") ?? "",
      ...(lease === null ? {} : { "X-Brick-Internal-Ws-Lease-Until": lease })
    }
  }));
}

async function runOpsWatchdog(env: Env) {
  const now = Date.now();
  const devices = await env.DB.prepare("SELECT id,created_at,last_health_at FROM devices WHERE revoked_at IS NULL").all<{ id: string; created_at: number; last_health_at: number | null }>();
  for (const device of devices.results) {
    const last = device.last_health_at ?? device.created_at;
    if (now - last >= 90_000) await openOfflineIncident(env, device.id, last + 75_000, now);
  }
  const alerts = await alertPersistentIncidents(env, now);
  for (const { deviceId, event } of alerts) {
    await env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(deviceId)).pushSafetyEvent(event);
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const u = new URL(req.url);
    if (u.pathname === "/") return Response.redirect(new URL("/parent", u), 302);
    if (u.pathname === "/healthz") return json({ ok: true, env: env.APP_ENV });
    if (req.method === "POST" && u.pathname === "/api/pair/complete") return completePairing(req, env);

    let m = u.pathname.match(/^\/api\/device\/([^/]+)\/location$/);
    if (req.method === "POST" && m) return ingest(req, env, decodeURIComponent(m[1]));
    m = u.pathname.match(/^\/api\/device\/([^/]+)\/health$/);
    if (req.method === "POST" && m) return ingestHealth(req, env, decodeURIComponent(m[1]));
    m = u.pathname.match(/^\/api\/device\/([^/]+)\/event$/);
    if (req.method === "POST" && m) return ingestSafetyEvent(req, env, decodeURIComponent(m[1]));

    if (u.pathname === "/parent" || u.pathname === "/parent/") {
      const d = await parentOnly(req); if (d) return d;
      return new Response(parentV4Html(), { headers: { "content-type": "text/html; charset=utf-8", ...securityHeaders } });
    }
    if (req.method === "POST" && u.pathname === "/parent/api/pair/start") return createPairing(req, env);
    if (req.method === "GET" && u.pathname === "/parent/api/devices") return listDevices(req, env);

    m = u.pathname.match(/^\/parent\/api\/device\/([^/]+)\/state$/);
    if (req.method === "GET" && m) return parentDeviceProxy(req, env, decodeURIComponent(m[1]), "state");
    m = u.pathname.match(/^\/parent\/api\/device\/([^/]+)\/events$/);
    if (req.method === "GET" && m) return listSafetyEvents(req, env, decodeURIComponent(m[1]));
    m = u.pathname.match(/^\/parent\/api\/device\/([^/]+)\/ws$/);
    if (m) return parentDeviceProxy(req, env, decodeURIComponent(m[1]), "ws");

    m = u.pathname.match(/^\/parent\/api\/device\/([^/]+)\/health\/incidents$/);
    if (req.method === "GET" && m) {
      const id = decodeURIComponent(m[1]), d = await ensureParentDevice(req, env, id); if (d) return d;
      const n = Number(u.searchParams.get("limit") ?? "100");
      return noStore(await listHealthIncidents(env, id, Number.isFinite(n) ? n : 100));
    }
    m = u.pathname.match(/^\/parent\/api\/device\/([^/]+)\/reliability$/);
    if (req.method === "GET" && m) {
      const id = decodeURIComponent(m[1]), d = await ensureParentDevice(req, env, id); if (d) return d;
      const days = Number(u.searchParams.get("days") ?? "30");
      return noStore(await reliability(env, id, Number.isFinite(days) ? days : 30));
    }

    m = u.pathname.match(/^\/parent\/api\/device\/([^/]+)\/geofences$/);
    if (m) {
      const id = decodeURIComponent(m[1]), d = await ensureParentDevice(req, env, id); if (d) return d;
      if (req.method === "GET") return noStore(await listGeofences(env, id));
      if (req.method === "POST") return noStore(await createGeofence(req, env, id));
    }
    m = u.pathname.match(/^\/parent\/api\/device\/([^/]+)\/geofences\/([^/]+)$/);
    if (m) {
      const id = decodeURIComponent(m[1]), geofenceId = decodeURIComponent(m[2]), d = await ensureParentDevice(req, env, id); if (d) return d;
      if (req.method === "PATCH") return noStore(await updateGeofence(req, env, id, geofenceId));
      if (req.method === "DELETE") return noStore(await deleteGeofence(env, id, geofenceId));
    }

    m = u.pathname.match(/^\/parent\/api\/device\/([^/]+)\/trips$/);
    if (m) {
      const id = decodeURIComponent(m[1]), d = await ensureParentDevice(req, env, id); if (d) return d;
      if (req.method === "GET") return noStore(await listTrips(env, id));
      if (req.method === "POST") {
        const response = await startTrip(req, env, id);
        if (response.ok) {
          const body = await response.clone().json<{ event?: RealtimeSafetyEvent }>();
          if (body.event) await env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(id)).pushSafetyEvent(body.event);
        }
        return noStore(response);
      }
    }
    m = u.pathname.match(/^\/parent\/api\/device\/([^/]+)\/trips\/([^/]+)\/end$/);
    if (req.method === "POST" && m) {
      const id = decodeURIComponent(m[1]), tripId = decodeURIComponent(m[2]), d = await ensureParentDevice(req, env, id); if (d) return d;
      const body: { reason?: string } = await req.json<{ reason?: string }>().catch(() => ({}));
      if (body.reason !== "cancelled" && body.reason !== "ended") return json({ error: "reason must be cancelled or ended" }, 400);
      const response = await finishTrip(env, id, tripId, body.reason);
      if (response.ok) {
        const data = await response.clone().json<{ event?: RealtimeSafetyEvent }>();
        if (data.event) await env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(id)).pushSafetyEvent(data.event);
      }
      return noStore(response);
    }

    m = u.pathname.match(/^\/parent\/api\/device\/([^/]+)\/history$/);
    if (req.method === "GET" && m) {
      const id = decodeURIComponent(m[1]), d = await ensureParentDevice(req, env, id); if (d) return d;
      const from = Number(u.searchParams.get("from")), to = Number(u.searchParams.get("to"));
      return noStore(await history(env, id, from, to));
    }

    m = u.pathname.match(/^\/parent\/api\/device\/([^/]+)\/retention$/);
    if (m) {
      const id = decodeURIComponent(m[1]), d = await ensureParentDevice(req, env, id); if (d) return d;
      if (req.method === "GET") return noStore(await getRetention(env, id));
      if (req.method === "PATCH") return noStore(await updateRetention(req, env, id));
    }

    return new Response("Not found", { status: 404, headers: securityHeaders });
  },

  async queue(batch: MessageBatch<unknown>, env: Env) {
    await processHistoryBatch(batch, env);
  },

  async scheduled(controller: ScheduledController, env: Env) {
    await runOpsWatchdog(env);
    if (controller.cron === "17 3 * * *") {
      await Promise.all([runRetentionCleanup(env), cleanupOps(env)]);
    }
  }
} satisfies ExportedHandler<Env>;
