import phase8, { BrickDevice } from "./worker-v8";
import { handleGroundReceiverRequest, type GroundReceiverEnv } from "./ground-receiver";
import { cleanupPhase5SemanticIndexes } from "./phase5-maintenance";
import { augmentHealthWithLearnedPlaces } from "./phase5-places";
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
    const ground = u.pathname.match(/^\/api\/ground\/([^/]+)\/sighting$/);
    if (req.method === "POST" && ground) return handleGroundReceiverRequest(req, env, ground[1]);

    // The inherited worker performs the normal signed/revocation/rate-limited device-health request
    // first. Phase 5 only augments a successful authenticated response; it never creates a second
    // device-config authentication path.
    const health = u.pathname.match(/^\/api\/device\/([^/]+)\/health$/);
    if (req.method === "POST" && health) {
      const response = await base.fetch!(req, env, ctx);
      return augmentHealthWithLearnedPlaces(response, env.DB, health[1]);
    }
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
