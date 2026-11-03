import baseWorker, { BrickDevice } from "./worker-v9";
import { maybeHandleFallEvent, type FallEventEnv } from "./fall-event-route";
import { ingestScreenTime, parentScreenTime, type ScreenTimeEnv } from "./screen-time-route";
import { parentAuthorized, unauthorizedParent, type AccessAuthEnv } from "./access-auth";
export { BrickDevice };

type Env = FallEventEnv & ScreenTimeEnv & AccessAuthEnv & {
  HISTORY: R2Bucket;
  MAPS: R2Bucket;
  EVENTS: Queue;
  BRICK_DEVICE: DurableObjectNamespace<BrickDevice>;
  DEVICE_RATE: { limit(input: { key: string }): Promise<{ success: boolean }> };
  PAIR_RATE: { limit(input: { key: string }): Promise<{ success: boolean }> };
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

    return base.fetch!(req, env, ctx);
  },
  async queue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) {
    if (base.queue) return base.queue(batch, env, ctx);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (base.scheduled) return base.scheduled(controller, env, ctx);
  }
} satisfies ExportedHandler<Env>;
