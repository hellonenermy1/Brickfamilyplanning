import core, { BrickDevice } from "./index";
import { parentV5BHtml } from "./parent-v5b";
import { privateMapStatus, servePrivateBasemap } from "./private-map";
import { D1MapBucket, cleanupExpiredD1Objects, withD1ObjectStores } from "./d1-r2-compat";
import { phase5CGuardDatabase } from "./phase5c-d1-guard";
import { handleParentLogin, handleParentLogout, parentAuthorized, unauthorizedParent } from "./parent-auth";
import { cleanupPhase5C, ingestCrashReport, listAudit, listCrashReports, recordAudit, releaseStatus } from "./phase5c";
export { BrickDevice };

type RuntimeEnv = {
  DB: D1Database;
  MAP_DB: D1Database;
  BRICK_DEVICE: DurableObjectNamespace<BrickDevice>;
  DEVICE_RATE: { limit(input: { key: string }): Promise<{ success: boolean }> };
  PAIR_RATE: { limit(input: { key: string }): Promise<{ success: boolean }> };
  APP_ENV: string;
  STORAGE_BACKEND: string;
  CURRENT_APP_VERSION: string;
  BRICK_PARENT_PASSWORD?: string;
};

type CoreEnv = RuntimeEnv & { HISTORY: R2Bucket; EVENTS: Queue };

const parentHeaders = {
  "content-type": "text/html; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' wss:; img-src 'self' data: blob:; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "X-Frame-Options": "DENY",
  "Cache-Control": "no-store"
};

function coreEnv(env: RuntimeEnv): CoreEnv {
  return withD1ObjectStores({ ...env, DB: phase5CGuardDatabase(env.DB) }) as CoreEnv;
}
function mapEnv(env: RuntimeEnv) { return { MAPS: new D1MapBucket(env.MAP_DB) as unknown as R2Bucket }; }
function authorizeForCore(req: Request<unknown, IncomingRequestCfProperties>): Request<unknown, IncomingRequestCfProperties> {
  const headers = new Headers(req.headers);
  headers.set("Cf-Access-Jwt-Assertion", "brick-parent-session");
  return new Request(req, { headers }) as Request<unknown, IncomingRequestCfProperties>;
}
function sameOriginMutation(req: Request) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return true;
  const origin = req.headers.get("Origin");
  return origin !== null && origin === new URL(req.url).origin;
}
function csrfDenied() {
  return Response.json({ error: "same-origin request required" }, { status: 403, headers: { "Cache-Control": "no-store" } });
}

const coreHandler = core as ExportedHandler<CoreEnv>;

export default {
  async fetch(req: Request<unknown, IncomingRequestCfProperties>, env: RuntimeEnv, ctx: ExecutionContext) {
    const u = new URL(req.url);

    if (u.pathname === "/parent/login") {
      const response = await handleParentLogin(req, env);
      if (req.method === "POST") ctx.waitUntil(recordAudit(env, "parent_login", req, response.status));
      return response;
    }
    if (u.pathname === "/parent/logout") {
      if (!(await parentAuthorized(req, env))) return unauthorizedParent(req);
      const response = handleParentLogout();
      ctx.waitUntil(recordAudit(env, "parent_logout", req, response.status));
      return response;
    }

    if (u.pathname === "/parent" || u.pathname === "/parent/") {
      if (!(await parentAuthorized(req, env))) return unauthorizedParent(req);
      return new Response(parentV5BHtml(), { headers: parentHeaders });
    }
    if (u.pathname === "/parent/map/status") {
      if (!(await parentAuthorized(req, env))) return unauthorizedParent(req);
      return privateMapStatus(mapEnv(env));
    }
    if (u.pathname === "/parent/map/basemap.pmtiles") {
      if (!(await parentAuthorized(req, env))) return unauthorizedParent(req);
      try { return await servePrivateBasemap(req, mapEnv(env)); }
      catch { return new Response("Private basemap unavailable", { status: 503, headers: { "Cache-Control": "no-store" } }); }
    }
    if (u.pathname === "/parent/api/release") {
      if (!(await parentAuthorized(req, env))) return unauthorizedParent(req);
      return releaseStatus(env);
    }
    if (u.pathname === "/parent/api/audit") {
      if (!(await parentAuthorized(req, env))) return unauthorizedParent(req);
      const limit = Number(u.searchParams.get("limit") ?? "100");
      return listAudit(env, Number.isFinite(limit) ? limit : 100);
    }
    let m = u.pathname.match(/^\/parent\/api\/device\/([^/]+)\/crashes$/);
    if (req.method === "GET" && m) {
      if (!(await parentAuthorized(req, env))) return unauthorizedParent(req);
      const limit = Number(u.searchParams.get("limit") ?? "50");
      return listCrashReports(env, decodeURIComponent(m[1]), Number.isFinite(limit) ? limit : 50);
    }

    m = u.pathname.match(/^\/api\/device\/([^/]+)\/crash$/);
    if (req.method === "POST" && m) return ingestCrashReport(req, env, decodeURIComponent(m[1]));

    if (!coreHandler.fetch) return new Response("Worker fetch handler unavailable", { status: 500 });
    if (u.pathname.startsWith("/parent/")) {
      if (!(await parentAuthorized(req, env))) return unauthorizedParent(req);
      if (!sameOriginMutation(req)) return csrfDenied();
      const response = await coreHandler.fetch(authorizeForCore(req), coreEnv(env), ctx);
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        ctx.waitUntil(recordAudit(env, "parent_mutation", req, response.status));
      }
      return response;
    }
    return coreHandler.fetch(req, coreEnv(env), ctx);
  },
  async queue(batch: MessageBatch<unknown>, env: RuntimeEnv, ctx: ExecutionContext) {
    if (coreHandler.queue) return coreHandler.queue(batch, coreEnv(env), ctx);
  },
  async scheduled(controller: ScheduledController, env: RuntimeEnv, ctx: ExecutionContext) {
    if (coreHandler.scheduled) await coreHandler.scheduled(controller, coreEnv(env), ctx);
    ctx.waitUntil(cleanupExpiredD1Objects(env.DB));
    if (controller.cron === "17 3 * * *") ctx.waitUntil(cleanupPhase5C(env));
  }
} satisfies ExportedHandler<RuntimeEnv>;
