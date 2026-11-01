import phase8, { BrickDevice } from "./worker-v8";
import { handleGroundReceiverRequest, type GroundReceiverEnv } from "./ground-receiver";
import { cleanupPhase5SemanticIndexes } from "./phase5-maintenance";
export { BrickDevice };

type RateLimit = { limit(input: { key: string }): Promise<{ success: boolean }> };
type Env = GroundReceiverEnv & {
  HISTORY: R2Bucket;
  MAPS: R2Bucket;
  EVENTS: Queue;
  BRICK_DEVICE: DurableObjectNamespace<BrickDevice>;
  PAIR_RATE: RateLimit;
  APP_ENV: string;
  CURRENT_APP_VERSION: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
};
const base = phase8 as ExportedHandler<Env>;

export default {
  async fetch(req: Request<unknown, IncomingRequestCfProperties>, env: Env, ctx: ExecutionContext) {
    const u = new URL(req.url);
    const match = u.pathname.match(/^\/api\/ground\/([^/]+)\/sighting$/);
    if (req.method === "POST" && match) return handleGroundReceiverRequest(req, env, match[1]);
    return base.fetch!(req, env, ctx);
  },
  async queue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) {
    if (base.queue) return base.queue(batch, env, ctx);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (base.scheduled) await base.scheduled(controller, env, ctx);
    // Bounded privacy/operational indexes only. Raw evidence retains its existing independent R2 policy.
    try { await cleanupPhase5SemanticIndexes(env.DB); } catch { /* optional index cleanup retries next cron */ }
  }
} satisfies ExportedHandler<Env>;
