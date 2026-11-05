import baseWorker, { BrickDevice } from "./worker-v9";
import { maybeHandleFallEvent, type FallEventEnv } from "./fall-event-route";
import { ingestScreenTime, parentScreenTime, type ScreenTimeEnv } from "./screen-time-route";
import { parentCommutes, refreshCommutes, type CommuteEnv } from "./commute-summary";
import { nextCommuteRefreshCandidates } from "./commute-scheduler";
import { claimCommuteRefresh } from "./commute-refresh-claim";
import { runBackgroundWork } from './background-work';
import { parentReverseOneMap, type OneMapEnv } from "./onemap-client";
import { parentP8BHtml } from "./parent-p8b";
import { parentAuthorized, unauthorizedParent, type AccessAuthEnv } from "./access-auth";
import {
  childClaimPin,
  childPinStatus,
  parentConfirmPin,
  parentPinStatus,
  parentStartPin,
  type PinPairingEnv
} from "./pin-pairing";
export { BrickDevice };

type Env = FallEventEnv & ScreenTimeEnv & CommuteEnv & OneMapEnv & AccessAuthEnv & PinPairingEnv & {
  HISTORY: R2Bucket;
  MAPS: R2Bucket;
  EVENTS: Queue;
  BRICK_DEVICE: DurableObjectNamespace<BrickDevice>;
  DEVICE_RATE: { limit(input: { key: string }): Promise<{ success: boolean }> };
  PAIR_RATE: { limit(input: { key: string }): Promise<{ success: boolean }> };
  PARENT_HISTORY_RATE: { limit(input: { key: string }): Promise<{ success: boolean }> };
  PARENT_WS_RATE: { limit(input: { key: string }): Promise<{ success: boolean }> };
  PARENT_GEOCODE_RATE: { limit(input: { key: string }): Promise<{ success: boolean }> };
  PARENT_COMMUTE_RATE: { limit(input: { key: string }): Promise<{ success: boolean }> };
  APP_ENV: string;
  CURRENT_APP_VERSION: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
};
const base = baseWorker as ExportedHandler<Env>;

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
async function parentGuard(req: Request, env: Env) {
  return (await parentAuthorized(req, env)) ? null : unauthorizedParent(req);
}

export default {
  async fetch(req: Request<unknown, IncomingRequestCfProperties>, env: Env, ctx: ExecutionContext) {
    const u = new URL(req.url);

    if (req.method === "GET" && (u.pathname === "/parent" || u.pathname === "/parent/")) {
      const response = await base.fetch!(req, env, ctx);
      if (!response.ok) return response;
      const type = (response.headers.get("Content-Type") ?? "").toLowerCase();
      if (!type.includes("text/html")) return response;
      const headers = new Headers(response.headers); headers.set("Cache-Control", "no-store");
      return new Response(parentP8BHtml(await response.text()), { status: response.status, statusText: response.statusText, headers });
    }

    // Prevent authenticated, potentially expensive reads and WebSocket reconnect floods from
    // starving device ingestion/pairing. Two separately configured Cloudflare edge limits.
    const costlyParent = u.pathname.match(/^\/parent\/api\/device\/([^/]+)\/(history|ws)$/);
    if (costlyParent && req.method === "GET") {
      const kind = costlyParent[2];
      const denied = await parentGuard(req, env); if (denied) return denied;
      if (kind === "ws") {
        if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket" ||
            req.headers.get("Origin") !== u.origin) {
          return json({ error: "same-origin WebSocket upgrade required" }, 403);
        }
      }
      const rate = kind === "ws" ? env.PARENT_WS_RATE : env.PARENT_HISTORY_RATE;
      // Missing bindings are a deployment failure. Never allow unbounded request work.
      if (!rate || typeof rate.limit !== "function") return json({ error: "parent rate guard unavailable" }, 503);
      const edgeIp = (req.headers.get("CF-Connecting-IP") ?? "unknown").slice(0, 96);
      let allowed = false;
      try { allowed = (await rate.limit({ key: `parent-${kind}:${edgeIp}` })).success; }
      catch { return json({ error: "parent rate guard unavailable" }, 503); }
      if (!allowed) return json({ error: "parent request rate limited" }, 429);
    }

    // Rate-limit expensive authenticated OneMap and commute routes independently.
    // Cloudflare binding counters are approximate and per colo; provider D1 limits
    // remain authoritative for OneMap upstream traffic, not per-parent request cost.
    const expensiveRead = req.method === "GET"
      ? (u.pathname === "/parent/api/onemap/reverse" ? "geocode"
        : /^\/parent\/api\/device\/[^/]+\/commutes$/.test(u.pathname) ? "commute" : null)
      : null;
    if (expensiveRead) {
      const denied = await parentGuard(req, env); if (denied) return denied;
      const rate = expensiveRead === "geocode" ? env.PARENT_GEOCODE_RATE : env.PARENT_COMMUTE_RATE;
      if (!rate || typeof rate.limit !== "function") return json({ error: "parent expensive-read limiter unavailable" }, 503);
      const ip = (req.headers.get("CF-Connecting-IP") ?? "unknown").slice(0, 96);
      let allowed = false;
      try { allowed = (await rate.limit({ key: `parent-${expensiveRead}:${ip}` })).success; }
      catch { return json({ error: "parent expensive-read limiter unavailable" }, 503); }
      if (!allowed) return json({ error: "parent expensive-read rate limited" }, 429);
    }

    // Fallback PIN pairing never binds on the public child claim. The code is consumed into a
    // pending session; a separately authenticated parent confirmation creates the device.
    if (req.method === "POST" && u.pathname === "/api/pair/pin/claim") return childClaimPin(req, env);
    if (req.method === "POST" && u.pathname === "/api/pair/pin/status") return childPinStatus(req, env);
    if (u.pathname === "/parent/api/pair/pin/start" && req.method === "POST") {
      const denied = await parentGuard(req, env); if (denied) return denied;
      return parentStartPin(req, env);
    }
    const pinParent = u.pathname.match(/^\/parent\/api\/pair\/pin\/([0-9a-f-]+)$/i);
    if (pinParent) {
      const denied = await parentGuard(req, env); if (denied) return denied;
      const sessionId = pinParent[1];
      if (req.method === "GET") return parentPinStatus(env, sessionId);
      if (req.method === "POST") return parentConfirmPin(req, env, sessionId);
      return json({ error: "method not allowed" }, 405);
    }

    // Device safety/summary ingestion stays outside parent auth and verifies the signed device request
    // inside the route-specific handler.
    const event = u.pathname.match(/^\/api\/device\/([^/]+)\/event$/);
    if (req.method === "POST" && event) {
      const fall = await maybeHandleFallEvent(req, env, decodeURIComponent(event[1]));
      if (fall) return fall;
    }

    const screenIngest = u.pathname.match(/^\/api\/device\/([^/]+)\/screen-time$/);
    if (req.method === "POST" && screenIngest) return ingestScreenTime(req, env, decodeURIComponent(screenIngest[1]));

    const screenParent = u.pathname.match(/^\/parent\/api\/device\/([^/]+)\/screen-time$/);
    if (req.method === "GET" && screenParent) {
      const denied = await parentGuard(req, env); if (denied) return denied;
      const days = Number(u.searchParams.get("days") ?? "14");
      return parentScreenTime(env, decodeURIComponent(screenParent[1]), Number.isFinite(days) ? days : 14);
    }

    const commuteParent = u.pathname.match(/^\/parent\/api\/device\/([^/]+)\/commutes$/);
    if (req.method === "GET" && commuteParent) {
      const denied = await parentGuard(req, env); if (denied) return denied;
      const deviceId = decodeURIComponent(commuteParent[1]);
      const now = Date.now();
      // Cached response is immediate. Recompute from R2 only after an atomic,
      // per-device 10-minute refresh claim (also checked for active device).
      if (await claimCommuteRefresh(env.DB, deviceId, now)) {
        // The cached response stays independent; this catch follows a durable
        // failure receipt. Scheduled rotation retries according to its backoff.
        ctx.waitUntil(runBackgroundWork(env.DB, 'commute', deviceId, () => refreshCommutes(env, deviceId, now - 2 * 86_400_000, now)).catch(() => undefined));
      }
      return parentCommutes(env, deviceId, Number(u.searchParams.get("limit") ?? "50"));
    }

    if (req.method === "GET" && u.pathname === "/parent/api/onemap/reverse") {
      const denied = await parentGuard(req, env); if (denied) return denied;
      return parentReverseOneMap(req, env);
    }

    return base.fetch!(req, env, ctx);
  },
  async queue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) {
    if (base.queue) return base.queue(batch, env, ctx);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    let failed = false;
    try { if (base.scheduled) await base.scheduled(controller, env, ctx); } catch { failed = true; }
    if (controller.cron === '17 3 * * *') {
      if (failed) throw Error('base daily maintenance failed');
      return;
    }

    // Commute derivation is automatic and uses trusted durable history only. Bound every cron run so
    // it cannot crowd out safety/current-state work.
    const now = Date.now();
    try {
      // Fixed first-100 selection starves higher sorted IDs forever. Maintain a durable
      // cursor and cover a bounded rotating set each cron without crowding safety ACK work.
      await runBackgroundWork(env.DB, 'commute-scan', 'global', async () => {
        const candidates = await nextCommuteRefreshCandidates(env.DB, 4, now);
        for (const id of candidates) ctx.waitUntil(runBackgroundWork(env.DB, 'commute', id, () => refreshCommutes(env, id, now - 2 * 86_400_000, now)));
      });
    } catch { failed = true; }
    if (failed) throw Error('derived maintenance failed');
  }
} satisfies ExportedHandler<Env>;
