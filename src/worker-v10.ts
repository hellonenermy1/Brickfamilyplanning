import phase9, { BrickDevice } from "./worker-v9";
import { parentV6CHtml } from "./parent-v6c";
export { BrickDevice };

type Env = Record<string, unknown>;
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
  return new Response(html, { status: baseResponse.status, statusText: baseResponse.statusText, headers });
}

export default {
  async fetch(req: Request<unknown, IncomingRequestCfProperties>, env: Env, ctx: ExecutionContext) {
    const u = new URL(req.url);
    const response = await base.fetch!(req, env, ctx);
    if (req.method === "GET" && (u.pathname === "/parent" || u.pathname === "/parent/") && response.ok) {
      return developmentParentResponse(response, await response.text());
    }
    return response;
  },
  async queue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) {
    if (base.queue) return base.queue(batch, env, ctx);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (base.scheduled) return base.scheduled(controller, env, ctx);
  }
} satisfies ExportedHandler<Env>;
