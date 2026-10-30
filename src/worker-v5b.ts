import core, { BrickDevice } from "./index";
import { parentV5BHtml } from "./parent-v5b";
import { privateMapStatus, servePrivateBasemap } from "./private-map";
export { BrickDevice };

type Env = {
  DB: D1Database;
  HISTORY: R2Bucket;
  MAPS: R2Bucket;
  EVENTS: Queue;
  BRICK_DEVICE: DurableObjectNamespace<BrickDevice>;
  DEVICE_RATE: { limit(input: { key: string }): Promise<{ success: boolean }> };
  PAIR_RATE: { limit(input: { key: string }): Promise<{ success: boolean }> };
  APP_ENV: string;
};

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

const coreHandler = core as ExportedHandler<Env>;

export default {
  async fetch(req: Request<unknown, IncomingRequestCfProperties>, env: Env, ctx: ExecutionContext) {
    const u = new URL(req.url);
    if (u.pathname === "/parent" || u.pathname === "/parent/") {
      if (!parentAuthorized(req)) return denied();
      return new Response(parentV5BHtml(), { headers: parentHeaders });
    }
    if (u.pathname === "/parent/map/status") {
      if (!parentAuthorized(req)) return denied();
      return privateMapStatus(env);
    }
    if (u.pathname === "/parent/map/basemap.pmtiles") {
      if (!parentAuthorized(req)) return denied();
      return servePrivateBasemap(req, env);
    }
    if (!coreHandler.fetch) return new Response("Worker fetch handler unavailable", { status: 500 });
    return coreHandler.fetch(req, env, ctx);
  },
  async queue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) {
    if (coreHandler.queue) return coreHandler.queue(batch, env, ctx);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (coreHandler.scheduled) return coreHandler.scheduled(controller, env, ctx);
  }
} satisfies ExportedHandler<Env>;
