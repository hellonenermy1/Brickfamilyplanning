import phase9, { BrickDevice } from "./worker-v9";
import { parentV6CHtml } from "./parent-v6c";
import { cleanupDevelopmentObjectStore, developmentRuntimeEnv } from "./dev-free-runtime";
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
  return new Response(html, { status: baseResponse.status, statusText: baseResponse.statusText, headers });
}

export default {
  async fetch(req: Request<unknown, IncomingRequestCfProperties>, env: Env, ctx: ExecutionContext) {
    const u = new URL(req.url);
    const runtime = developmentRuntimeEnv(env);
    const response = await base.fetch!(req, runtime, ctx);
    if (req.method === "GET" && (u.pathname === "/parent" || u.pathname === "/parent/") && response.ok) {
      return developmentParentResponse(response, await response.text());
    }
    return response;
  },
  async queue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) {
    // The Phase 6C free beta has no Cloudflare Queue binding. Keep this handler only so a future
    // explicit queue can still reuse the Phase 6 processors without changing production code.
    if (base.queue) return base.queue(batch, developmentRuntimeEnv(env), ctx);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const runtime = developmentRuntimeEnv(env);
    if (base.scheduled) await base.scheduled(controller, runtime, ctx);
    if (env.DB) ctx.waitUntil(cleanupDevelopmentObjectStore(env.DB));
  }
} satisfies ExportedHandler<Env>;
