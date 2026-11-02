import phase9, { BrickDevice } from "./worker-v9";
import { parentV6CHtml } from "./parent-v6c";
import { cleanupDevelopmentObjectStore, developmentRuntimeEnv } from "./dev-free-runtime";
import {
  authorizeDevParentRequest,
  cleanupDevParentAuth,
  devParentUnauthorized,
  handleDevParentAuthRoute,
  stripDevParentInternalHeader
} from "./dev-parent-auth";
export { BrickDevice };

type Env = Record<string, unknown> & { DB?: D1Database; BRICK_MAP_SOURCE?: string };
const base = phase9 as ExportedHandler<Env>;

function developmentParentResponse(baseResponse: Response, baseHtml: string) {
  const match = baseHtml.match(/<script\s+type=["']module["']\s+nonce=["']([^"']+)["']>/);
  if (!match) {
    return new Response("Parent beta security nonce missing", {
      status: 500,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
    });
  }
  const html = parentV6CHtml().replace('<script type="module">', `<script type="module" nonce="${match[1]}">`);
  const headers = new Headers(baseResponse.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Brick-Environment", "development");
  headers.set("X-Brick-Portal", "phase6c-beta");
  headers.set("X-Brick-Storage", "d1-free-runtime");
  headers.set("X-Brick-Parent-Auth", "d1-session-v1");
  return new Response(html, { status: baseResponse.status, statusText: baseResponse.statusText, headers });
}

function isParentPath(pathname: string) {
  return pathname === "/parent" || pathname === "/parent/" || pathname.startsWith("/parent/");
}

export default {
  async fetch(req: Request<unknown, IncomingRequestCfProperties>, env: Env, ctx: ExecutionContext) {
    if (!env.DB) return new Response("Development D1 binding missing", { status: 503, headers: { "Cache-Control": "no-store" } });

    // Never trust an internal-development marker supplied by a client. Every request is cleaned at
    // the outermost worker before any imported Phase 6 handler can see it.
    const cleanReq = stripDevParentInternalHeader(req);
    const u = new URL(cleanReq.url);
    const runtime = developmentRuntimeEnv(env);

    if (isParentPath(u.pathname)) {
      const authRoute = await handleDevParentAuthRoute(cleanReq, { DB: env.DB });
      if (authRoute) return authRoute;

      const authorized = await authorizeDevParentRequest(cleanReq, { DB: env.DB });
      if (!authorized) return devParentUnauthorized(cleanReq);

      const response = await base.fetch!(authorized, runtime, ctx);
      if (cleanReq.method === "GET" && (u.pathname === "/parent" || u.pathname === "/parent/") && response.ok) {
        return developmentParentResponse(response, await response.text());
      }
      return response;
    }

    return base.fetch!(cleanReq, runtime, ctx);
  },
  async queue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) {
    // No Cloudflare Queue is bound in Phase 6C beta. Kept only for forward compatibility.
    if (base.queue) return base.queue(batch, developmentRuntimeEnv(env), ctx);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const runtime = developmentRuntimeEnv(env);
    if (base.scheduled) await base.scheduled(controller, runtime, ctx);
    if (env.DB) {
      ctx.waitUntil(cleanupDevelopmentObjectStore(env.DB));
      ctx.waitUntil(cleanupDevParentAuth({ DB: env.DB }));
    }
  }
} satisfies ExportedHandler<Env>;
