import phase6Base, { BrickDevice } from "./worker-v5b";
import { parentV6Html } from "./parent-v6";
import { parentAuthorized, unauthorizedParent, type AccessAuthEnv } from "./access-auth";
import { getRetention, history, listGeofences, listTrips } from "./phase4";
import { listHealthIncidents, reliability } from "./phase5-ops";
import { batteryDrainTrend } from "./battery-health";
import { snapshotD1ToR2 } from "./backup-v6";
import type {BackgroundDispatchEnv} from './derived-work-dispatch';
import { recordAudit } from "./phase5c";
import { listBleAnchors, parentListBleAnchors, parentRemoveBleAnchor, parentSetBleAnchor } from "./ble-anchors";
import { validateSafetyReplayWindow } from "./device-json-security";
import { processDeadLetterBatch, processSafetyReceipts } from "./queue-v6";
import { augmentHealthWithLocationControl, noteLocationControlHealth, parentGetLocationControl, parentSetLocationControl } from "./phase6-location-control";
export { BrickDevice };

type RateLimit = { limit(input: { key: string }): Promise<{ success: boolean }> };
type Env = AccessAuthEnv & BackgroundDispatchEnv & {
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

type DeviceLife = { revoked_at: number | null };
const base = phase6Base as ExportedHandler<Env>;
const PRIMARY_QUEUE = "brick-family-v1-events";
const DLQ = "brick-family-v1-dlq";
const SAFETY_KINDS = new Set([
  "safe_checkin", "sos_started", "sos_cancelled",
  "battery_low", "battery_critical", "charging_started", "charging_stopped",
  "geofence_enter", "geofence_exit", "trip_started", "trip_ended", "trip_alert"
]);

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
function noStore(resp: Response) {
  const headers = new Headers(resp.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
}
function sameOriginMutation(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  const origin = req.headers.get("Origin");
  return origin !== null && origin === new URL(req.url).origin;
}
async function requireParent(req: Request, env: Env) {
  return (await parentAuthorized(req, env)) ? null : unauthorizedParent(req);
}
async function lifecycle(env: Env, id: string): Promise<DeviceLife | null> {
  return env.DB.prepare("SELECT revoked_at FROM devices WHERE id=?1").bind(id).first<DeviceLife>();
}

function finalParentResponse(baseResponse: Response, baseHtml: string) {
  const match = baseHtml.match(/<script\s+type=["']module["']\s+nonce=["']([^"']+)["']>/);
  if (!match) return new Response("Parent dashboard security nonce missing", { status: 500, headers: { "Cache-Control": "no-store" } });
  const html = parentV6Html().replace('<script type="module">', `<script type="module" nonce="${match[1]}">`);
  return new Response(html, { status: baseResponse.status, headers: baseResponse.headers });
}

async function healthWithConfiguration(req: Request<unknown, IncomingRequestCfProperties>, env: Env, ctx: ExecutionContext, deviceId: string) {
  // Clone before the base handler consumes the signed body. The copy is only used after the base
  // handler has accepted the request, so an unauthenticated body cannot update control status.
  const healthCopy = req.clone();
  const response = await base.fetch!(req, env, ctx);
  if (!response.ok) return response;
  try { await noteLocationControlHealth(healthCopy, env, deviceId); } catch { /* health ACK is best effort */ }
  const anchors = await listBleAnchors(env, deviceId);
  let body: Record<string, unknown>;
  try { body = await response.json<Record<string, unknown>>(); }
  catch { return response; }
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  const withAnchors = new Response(JSON.stringify({ ...body, bleAnchors: anchors }), { status: response.status, headers });
  return augmentHealthWithLocationControl(withAnchors, env, deviceId);
}

async function queueCriticalSafetyReceipt(req: Request, env: Env, deviceId: string): Promise<Response | null> {
  // Validate the signed anti-replay envelope before it is allowed to consume Queue/DLQ capacity.
  const denied = await validateSafetyReplayWindow(req, env, deviceId);
  if (denied) return denied;
  let event: Record<string, unknown>;
  try { event = await req.clone().json<Record<string, unknown>>(); }
  catch { return json({ error: "invalid event JSON" }, 400); }
  const eventId = event.eventId;
  const kind = event.kind;
  const createdAtMs = event.createdAtMs;
  if (typeof eventId !== "string" || !/^[0-9a-fA-F-]{36}$/.test(eventId) || typeof kind !== "string" || !SAFETY_KINDS.has(kind) ||
      typeof createdAtMs !== "number" || !Number.isSafeInteger(createdAtMs)) {
    return json({ error: "invalid safety event schema" }, 400);
  }
  try {
    await env.EVENTS.send({ type: "safety_receipt", deviceId, eventId, kind, createdAtMs });
    return null;
  } catch {
    // The child keeps the encrypted event locally. A 503 deliberately prevents ACK so it retries.
    return json({ error: "safety durability queue unavailable" }, 503);
  }
}

async function archivedRead(req: Request, env: Env, deviceId: string, suffix: string): Promise<Response> {
  const u = new URL(req.url);
  if (suffix === "/state" && req.method === "GET") {
    const stub = env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(deviceId));
    return noStore(await stub.fetch(new Request("https://do/state")));
  }
  if (suffix === "/ws") return json({ error: "revoked device is archived; live websocket disabled" }, 410);
  if (suffix === "/events" && req.method === "GET") {
    const n = Number(u.searchParams.get("limit") ?? "100");
    const limit = Number.isFinite(n) ? Math.max(1, Math.min(500, Math.trunc(n))) : 100;
    const r = await env.DB.prepare("SELECT id,kind,device_created_at,server_created_at,latitude,longitude,accuracy_m,detail_json FROM safety_events WHERE device_id=?1 ORDER BY server_created_at DESC LIMIT ?2").bind(deviceId, limit).all();
    return json({ events: r.results });
  }
  if (suffix === "/health/incidents" && req.method === "GET") {
    const n = Number(u.searchParams.get("limit") ?? "100");
    return noStore(await listHealthIncidents(env, deviceId, Number.isFinite(n) ? n : 100));
  }
  if (suffix === "/reliability" && req.method === "GET") {
    const days = Number(u.searchParams.get("days") ?? "30");
    return noStore(await reliability(env, deviceId, Number.isFinite(days) ? days : 30));
  }
  if (suffix === "/battery-drain" && req.method === "GET") return batteryDrainTrend(env, deviceId);
  if (suffix === "/geofences" && req.method === "GET") return noStore(await listGeofences(env, deviceId));
  if (suffix === "/ble-anchors" && req.method === "GET") return parentListBleAnchors(env, deviceId);
  if (suffix === "/trips" && req.method === "GET") return noStore(await listTrips(env, deviceId));
  if (suffix === "/history" && req.method === "GET") {
    return noStore(await history(env, deviceId, Number(u.searchParams.get("from")), Number(u.searchParams.get("to"))));
  }
  if (suffix === "/retention" && req.method === "GET") return noStore(await getRetention(env, deviceId));
  if (req.method === "GET") return json({ error: "archived endpoint not available" }, 404);
  return json({ error: "device is revoked and read-only" }, 409);
}

export default {
  async fetch(req: Request<unknown, IncomingRequestCfProperties>, env: Env, ctx: ExecutionContext) {
    const u = new URL(req.url);

    if (req.method === "GET" && (u.pathname === "/parent" || u.pathname === "/parent/")) {
      const response = await base.fetch!(req, env, ctx);
      if (!response.ok) return response;
      return finalParentResponse(response, await response.text());
    }

    let deviceMatch = u.pathname.match(/^\/api\/device\/([^/]+)\/health$/);
    if (req.method === "POST" && deviceMatch) {
      return healthWithConfiguration(req, env, ctx, decodeURIComponent(deviceMatch[1]));
    }

    const safetyMatch = u.pathname.match(/^\/api\/device\/([^/]+)\/event$/);
    if (req.method === "POST" && safetyMatch) {
      const denied = await queueCriticalSafetyReceipt(req, env, decodeURIComponent(safetyMatch[1]));
      if (denied) return denied;
      // The base handler now persists/broadcasts the same signed event. If that step fails, the
      // Queue receipt remains unacknowledged until a client retry successfully creates the row.
      return base.fetch!(req, env, ctx);
    }

    const match = u.pathname.match(/^\/parent\/api\/device\/([^/]+)(\/.*)$/);
    if (match) {
      const denied = await requireParent(req, env); if (denied) return denied;
      const deviceId = decodeURIComponent(match[1]);
      const suffix = match[2];
      const life = await lifecycle(env, deviceId);
      if (!life) return json({ error: "device not found" }, 404);

      // Revocation itself remains idempotent, but once revoked every other parent route is
      // dispatched through the archived/read-only policy before any Phase 6 mutation handler.
      if (suffix === "/revoke" && req.method === "POST") {
        if (!sameOriginMutation(req)) return json({ error: "same-origin request required" }, 403);
        const now = Date.now();
        await env.DB.batch([
          env.DB.prepare("UPDATE devices SET revoked_at=COALESCE(revoked_at,?1) WHERE id=?2").bind(now, deviceId),
          env.DB.prepare("UPDATE trips SET state='cancelled',ended_at=COALESCE(ended_at,?1),stationary_since=NULL WHERE device_id=?2 AND state='active'").bind(now, deviceId)
        ]);
        // D1 revocation prevents new sessions; explicitly fence and close existing DO WebSockets.
        // If the DO is unavailable, return a truthful retryable status, never a false full success.
        try {
          await env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(deviceId)).revokeParentSockets();
        } catch {
          ctx.waitUntil(recordAudit(env, "device_revocation_stream_close_pending", req, 503, { deviceId }));
          return json({ error: "device revoked; live subscription invalidation pending retry", deviceId, revoked: true }, 503);
        }
        ctx.waitUntil(recordAudit(env, "device_revoked", req, 200, { deviceId }));
        return json({ ok: true, deviceId, revokedAt: life.revoked_at ?? now });
      }

      if (life.revoked_at !== null) return archivedRead(req, env, deviceId, suffix);

      if (suffix === "/location-control" && req.method === "GET") {
        return parentGetLocationControl(env, deviceId);
      }
      if (suffix === "/location-control" && req.method === "POST") {
        if (!sameOriginMutation(req)) return json({ error: "same-origin request required" }, 403);
        const response = await parentSetLocationControl(req, env, deviceId);
        ctx.waitUntil(recordAudit(env, "location_control_set", req, response.status, { deviceId }));
        return response;
      }
      if (suffix === "/battery-drain" && req.method === "GET") return batteryDrainTrend(env, deviceId);
      if (suffix === "/ble-anchors" && req.method === "GET") return parentListBleAnchors(env, deviceId);
      if (suffix === "/ble-anchors" && req.method === "POST") {
        if (!sameOriginMutation(req)) return json({ error: "same-origin request required" }, 403);
        const response = await parentSetBleAnchor(req, env, deviceId);
        ctx.waitUntil(recordAudit(env, "ble_anchor_set", req, response.status, { deviceId }));
        return response;
      }
      const anchorDelete = suffix.match(/^\/ble-anchors\/([^/]+)$/);
      if (anchorDelete && req.method === "DELETE") {
        if (!sameOriginMutation(req)) return json({ error: "same-origin request required" }, 403);
        const response = await parentRemoveBleAnchor(env, deviceId, decodeURIComponent(anchorDelete[1]));
        ctx.waitUntil(recordAudit(env, "ble_anchor_removed", req, response.status, { deviceId }));
        return response;
      }
    }

    return base.fetch!(req, env, ctx);
  },
  async queue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) {
    if (batch.queue === DLQ) {
      await processDeadLetterBatch(batch, env);
      return;
    }
    if (batch.queue === PRIMARY_QUEUE) await processSafetyReceipts(batch, env);
    if (base.queue) return base.queue(batch, env, ctx);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (base.scheduled) await base.scheduled(controller, env, ctx);
    if (controller.cron === "17 3 * * *") ctx.waitUntil(env.BACKGROUND_WORK?env.BACKGROUND_WORK.backup():snapshotD1ToR2(env));
  }
} satisfies ExportedHandler<Env>;
