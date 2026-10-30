import core, { BrickDevice } from "./index";
import { parentV5BHtml } from "./parent-v5b";
import { privateMapStatus, servePrivateBasemap } from "./private-map";
import { D1MapBucket, cleanupExpiredD1Objects, withD1ObjectStores } from "./d1-r2-compat";
export { BrickDevice };

type RuntimeEnv = {
  DB: D1Database;
  MAP_DB: D1Database;
  BRICK_DEVICE: DurableObjectNamespace<BrickDevice>;
  DEVICE_RATE: { limit(input: { key: string }): Promise<{ success: boolean }> };
  PAIR_RATE: { limit(input: { key: string }): Promise<{ success: boolean }> };
  APP_ENV: string;
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

function parentAuthorized(req: Request) {
  const u = new URL(req.url);
  return u.hostname === "localhost" || u.hostname === "127.0.0.1" || Boolean(req.headers.get("Cf-Access-Jwt-Assertion"));
}
function denied() { return Response.json({ error: "Cloudflare Access authentication required" }, { status: 401, headers: { "Cache-Control": "no-store" } }); }
function coreEnv(env: RuntimeEnv): CoreEnv { return withD1ObjectStores(env) as CoreEnv; }
function mapEnv(env: RuntimeEnv) { return { MAPS: new D1MapBucket(env.MAP_DB) as unknown as R2Bucket }; }

const coreHandler = core as ExportedHandler<CoreEnv>;

export default {
  async fetch(req: Request<unknown, IncomingRequestCfProperties>, env: RuntimeEnv, ctx: ExecutionContext) {
    const u = new URL(req.url);
    if (u.pathname === "/parent" || u.pathname === "/parent/") {
      if (!parentAuthorized(req)) return denied();
      return new Response(parentV5BHtml(), { headers: parentHeaders });
    }
    if (u.pathname === "/parent/map/status") {
      if (!parentAuthorized(req)) return denied();
      return privateMapStatus(mapEnv(env));
    }
    if (u.pathname === "/parent/map/basemap.pmtiles") {
      if (!parentAuthorized(req)) return denied();
      try { return await servePrivateBasemap(req, mapEnv(env)); }
      catch (error) { return new Response(`Private basemap unavailable: ${String(error)}`, { status: 503, headers: { "Cache-Control": "no-store" } }); }
    }
    if (!coreHandler.fetch) return new Response("Worker fetch handler unavailable", { status: 500 });
    return coreHandler.fetch(req, coreEnv(env), ctx);
  },
  async queue(batch: MessageBatch<unknown>, env: RuntimeEnv, ctx: ExecutionContext) {
    if (coreHandler.queue) return coreHandler.queue(batch, coreEnv(env), ctx);
  },
  async scheduled(controller: ScheduledController, env: RuntimeEnv, ctx: ExecutionContext) {
    if (coreHandler.scheduled) await coreHandler.scheduled(controller, coreEnv(env), ctx);
    ctx.waitUntil(cleanupExpiredD1Objects(env.DB));
  }
} satisfies ExportedHandler<RuntimeEnv>;
