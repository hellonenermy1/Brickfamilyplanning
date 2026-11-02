import phase9, { BrickDevice } from "./worker-v9";
import { parentV7Html } from "./parent-v7";
import { augmentPhase7ParentStateResponse } from "./phase7-parent-presentation";
import { cleanupDevelopmentObjectStore, developmentRuntimeEnv } from "./dev-free-runtime";
import {
  authorizeDevParentRequest,
  cleanupDevParentAuth,
  devParentUnauthorized,
  handleDevParentAuthRoute,
  stripDevParentInternalHeader
} from "./dev-parent-auth";
import { claimDevMaintenance, syntheticScheduledController } from "./dev-maintenance";
export { BrickDevice };

type RateLimit = { limit(input: { key: string }): Promise<{ success: boolean }> };
type Env = Record<string, unknown> & {
  DB?: D1Database;
  BRICK_MAP_SOURCE?: string;
  PARENT_LOGIN_RATE?: RateLimit;
  DEV_PARENT_PIN_HASH?: string;
};
const base = phase9 as ExportedHandler<Env>;

function developmentParentResponse(baseResponse: Response, baseHtml: string) {
  const match = baseHtml.match(/<script\s+type=["']module["']\s+nonce=["']([^"']+)["']>/);
  if (!match) {
    return new Response("Parent beta security nonce missing", {
      status: 500,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
    });
  }
  const html = parentV7Html().replace('<script type="module">', `<script type="module" nonce="${match[1]}">`);
  const headers = new Headers(baseResponse.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Brick-Environment", "development");
  headers.set("X-Brick-Portal", "phase7-beta1");
  headers.set("X-Brick-Storage", "d1-free-runtime");
  headers.set("X-Brick-Parent-Auth", "d1-session-v1");
  return new Response(html, { status: baseResponse.status, statusText: baseResponse.statusText, headers });
}

function isParentPath(pathname: string) {
  return pathname === "/parent" || pathname === "/parent/" || pathname.startsWith("/parent/");
}

function isParentStatePath(pathname: string) {
  return /^\/parent\/api\/device\/[^/]+\/state$/.test(pathname);
}

function scheduleRequestDrivenMaintenance(env: Env & { DB: D1Database }, runtime: Env, ctx: ExecutionContext) {
  ctx.waitUntil((async () => {
    const now = Date.now();
    if (base.scheduled && await claimDevMaintenance(env.DB, "minute", 60_000, now)) {
      await base.scheduled(syntheticScheduledController("*/1 * * * *", now), runtime, ctx);
    }
    if (await claimDevMaintenance(env.DB, "daily", 86_400_000, now)) {
      if (base.scheduled) await base.scheduled(syntheticScheduledController("17 3 * * *", now), runtime, ctx);
      await Promise.all([
        cleanupDevelopmentObjectStore(env.DB),
        cleanupDevParentAuth({ DB: env.DB })
      ]);
    }
  })().catch(() => {
    // Maintenance is best-effort and must never break a child ACK or parent request. Its normal
    // work is retried by the next request after the D1 lease interval.
  }));
}

export default {
  async fetch(req: Request<unknown, IncomingRequestCfProperties>, env: Env, ctx: ExecutionContext) {
    if (!env.DB) return new Response("Development D1 binding missing", { status: 503, headers: { "Cache-Control": "no-store" } });

    // Never trust an internal-development marker supplied by a client. Every request is cleaned at
    // the outermost worker before any imported Phase 6/7 handler can see it.
    const cleanReq = stripDevParentInternalHeader(req);
    const u = new URL(cleanReq.url);
    const runtime = developmentRuntimeEnv(env);
    scheduleRequestDrivenMaintenance(env as Env & { DB: D1Database }, runtime, ctx);

    if (isParentPath(u.pathname)) {
      const parentAuthEnv = {
        DB: env.DB,
        PARENT_LOGIN_RATE: env.PARENT_LOGIN_RATE,
        DEV_PARENT_PIN_HASH: env.DEV_PARENT_PIN_HASH
      };
      const authRoute = await handleDevParentAuthRoute(cleanReq, parentAuthEnv);
      if (authRoute) return authRoute;

      const authorized = await authorizeDevParentRequest(cleanReq, parentAuthEnv);
      if (!authorized) return devParentUnauthorized(cleanReq);

      const response = await base.fetch!(authorized, runtime, ctx);
      if (cleanReq.method === "GET" && (u.pathname === "/parent" || u.pathname === "/parent/") && response.ok) {
        return developmentParentResponse(response, await response.text());
      }
      if (cleanReq.method === "GET" && isParentStatePath(u.pathname) && response.ok) {
        return augmentPhase7ParentStateResponse(response);
      }
      return response;
    }

    return base.fetch!(cleanReq, runtime, ctx);
  },
  async queue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) {
    // No Cloudflare Queue is bound in the card-free beta. Kept only for forward compatibility.
    if (base.queue) return base.queue(batch, developmentRuntimeEnv(env), ctx);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    // No cron binding is required by the card-free beta, but retaining this handler makes a future
    // optional trigger safe without changing production code.
    const runtime = developmentRuntimeEnv(env);
    if (base.scheduled) await base.scheduled(controller, runtime, ctx);
    if (env.DB) {
      ctx.waitUntil(cleanupDevelopmentObjectStore(env.DB));
      ctx.waitUntil(cleanupDevParentAuth({ DB: env.DB }));
    }
  }
} satisfies ExportedHandler<Env>;
