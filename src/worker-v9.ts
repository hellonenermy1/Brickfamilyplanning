import phase8, { BrickDevice } from "./worker-v8";
import { handleGroundReceiverRequest, type GroundReceiverEnv } from "./ground-receiver";
import { cleanupPhase5SemanticIndexes } from "./phase5-maintenance";
import { augmentHealthWithLearnedPlaces } from "./phase5-places";
import { listCurrentExternalConstraints } from "./phase5-external-constraints";
import { refineCurrentState, type ParentCurrentState } from "./phase5-current-refinement";
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
const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type DeviceLife = { revoked_at: number | null };

function asParentState(value: unknown): ParentCurrentState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const s = value as Record<string, unknown>;
  if (s.lat !== null && (typeof s.lat !== "number" || !Number.isFinite(s.lat))) return null;
  if (s.lon !== null && (typeof s.lon !== "number" || !Number.isFinite(s.lon))) return null;
  if (typeof s.uncertaintyM !== "number" || !Number.isFinite(s.uncertaintyM)) return null;
  if (typeof s.quality !== "string" || typeof s.receivedAt !== "number" || !Number.isSafeInteger(s.receivedAt)) return null;
  return {
    epoch: typeof s.epoch === "number" && Number.isSafeInteger(s.epoch) ? s.epoch : undefined,
    sequence: typeof s.sequence === "number" && Number.isSafeInteger(s.sequence) ? s.sequence : undefined,
    lat: s.lat as number | null,
    lon: s.lon as number | null,
    uncertaintyM: s.uncertaintyM,
    quality: s.quality,
    source: typeof s.source === "string" ? s.source : undefined,
    receivedAt: s.receivedAt,
    wallTimeMs: typeof s.wallTimeMs === "number" && Number.isSafeInteger(s.wallTimeMs) ? s.wallTimeMs : undefined
  };
}

/**
 * Add a parent-only Phase 5 refinement without replacing the Durable Object's child-reported state.
 * The inherited route has already enforced parent authentication/revocation semantics. A revoked
 * device remains archived and receives no fresh external refinement.
 */
async function augmentParentStateWithExternalRefinement(response: Response, env: Env, deviceId: string): Promise<Response> {
  if (!response.ok || !DEVICE_ID_RE.test(deviceId)) return response;
  const contentType = (response.headers.get("Content-Type") ?? "").toLowerCase();
  if (!contentType.includes("application/json")) return response;

  const life = await env.DB.prepare("SELECT revoked_at FROM devices WHERE id=?1 LIMIT 1").bind(deviceId).first<DeviceLife>();
  if (!life || life.revoked_at !== null) return response;

  let body: unknown;
  try { body = await response.json(); } catch { return response; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return response;
  const object = body as Record<string, unknown>;
  const current = asParentState(object.state);

  let external;
  try { external = await listCurrentExternalConstraints(env.DB, deviceId, Date.now()); }
  catch { return new Response(JSON.stringify(object), { status: response.status, statusText: response.statusText, headers: response.headers }); }

  const refinedState = refineCurrentState(current, external, Date.now());
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify({ ...object, refinedState }), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

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

    // Parent state remains the child-reported Durable Object snapshot plus a separate refinement.
    // Raw/current state is never overwritten by Witness/Ground evidence.
    const parentState = u.pathname.match(/^\/parent\/api\/device\/([^/]+)\/state$/);
    if (req.method === "GET" && parentState) {
      const response = await base.fetch!(req, env, ctx);
      let deviceId: string;
      try { deviceId = decodeURIComponent(parentState[1]); } catch { return response; }
      return augmentParentStateWithExternalRefinement(response, env, deviceId);
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
