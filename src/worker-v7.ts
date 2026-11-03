import phase6, { BrickDevice } from "./worker-v6";
import { decodeEvidenceDevicePath, handleEvidenceRequest, type EvidenceRouteEnv } from "./evidence-route";
export { BrickDevice };

type RateLimit = { limit(input: { key: string }): Promise<{ success: boolean }> };
type Env = EvidenceRouteEnv & {
  MAPS: R2Bucket;
  EVENTS: Queue;
  BRICK_DEVICE: DurableObjectNamespace<BrickDevice>;
  PAIR_RATE: RateLimit;
  APP_ENV: string;
  CURRENT_APP_VERSION: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
};
const base = phase6 as ExportedHandler<Env>;

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export default {
  async fetch(req: Request<unknown, IncomingRequestCfProperties>, env: Env, ctx: ExecutionContext) {
    const u = new URL(req.url);
    const match = u.pathname.match(/^\/api\/device\/([^/]+)\/evidence$/);
    if (req.method === "POST" && match) {
      const deviceId = decodeEvidenceDevicePath(match[1]);
      if (!deviceId) return json({ error: "invalid device path" }, 400);
      return handleEvidenceRequest(req, env, deviceId);
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
