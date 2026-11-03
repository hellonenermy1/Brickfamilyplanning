import phase8, { BrickDevice } from "./worker-v8";
import { handleGroundReceiverRequest, type GroundReceiverEnv } from "./ground-receiver";
import { cleanupPhase5SemanticIndexes } from "./phase5-maintenance";
import { augmentHealthWithLearnedPlaces } from "./phase5-places";
import { augmentHealthWithCoarseNetwork } from "./phase5-coarse-network";
import { listCurrentExternalConstraints } from "./phase5-external-constraints";
import { refineCurrentState, type ParentCurrentState } from "./phase5-current-refinement";
import { cleanupPhase5RefinedHistory, listRefinedHistory, processRefinementsForDevice } from "./phase5-refined-history";
import { augmentPhase7ParentStateResponseV2 } from "./phase7-state-v2";
import { augmentPhase8ParentTruth } from "./phase8-parent-truth";
import { augmentPhase8HistoryProvenance } from "./phase8-history-provenance";
import { historicalIdentityPairingDenied } from "./phase8-device-identity";
import { parentV8Html } from "./parent-v8";
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

function productionParentResponse(baseResponse: Response, baseHtml: string) {
  const match = baseHtml.match(/<script\s+type=["']module["']\s+nonce=["']([^"']+)["']>/);
  if (!match) {
    return new Response("Parent dashboard security nonce missing", {
      status: 500,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
    });
  }
  const html = parentV8Html().replace('<script type="module">', `<script type="module" nonce="${match[1]}">`);
  const headers = new Headers(baseResponse.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Brick-Parent-Truth", "phase8-v1");
  return new Response(html, { status: baseResponse.status, statusText: baseResponse.statusText, headers });
}

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

async function augmentParentHistoryWithRefinedLayer(response: Response, env: Env, deviceId: string, fromMs: number, toMs: number) {
  if (!response.ok || !DEVICE_ID_RE.test(deviceId)) return response;
  const contentType = (response.headers.get("Content-Type") ?? "").toLowerCase();
  if (!contentType.includes("application/json")) return response;
  let body: unknown;
  try { body = await response.json(); } catch { return response; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return response;
  let refinedHistory;
  try { refinedHistory = await listRefinedHistory(env, deviceId, fromMs, toMs); }
  catch {
    // Refined history is optional extra information. It must never make trusted/raw history unreadable.
    return new Response(JSON.stringify(body), { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify({ ...(body as Record<string, unknown>), refinedHistory }), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(req: Request<unknown, IncomingRequestCfProperties>, env: Env, ctx: ExecutionContext) {
    const u = new URL(req.url);

    // Worker-v5b canonicalizes all new keys and schema 015 prevents canonical-key races. This outer
    // guard additionally compares against historical rows by cryptographic identity, closing the
    // upgrade edge where an older database stored the same DER SPKI using a different Base64 spelling.
    if (req.method === "POST" && u.pathname === "/api/pair/complete") {
      const denied = await historicalIdentityPairingDenied(req, env);
      if (denied) return denied;
    }

    // The normal Phase 6/7 production chain performs Cloudflare Access authorization and creates the
    // CSP nonce. Only after that succeeds do we swap in the Phase 8 production HTML, preserving the
    // authenticated response headers verbatim. No development auth/debug portal is promoted here.
    if (req.method === "GET" && (u.pathname === "/parent" || u.pathname === "/parent/")) {
      const response = await base.fetch!(req, env, ctx);
      if (!response.ok) return response;
      return productionParentResponse(response, await response.text());
    }

    const ground = u.pathname.match(/^\/api\/ground\/([^/]+)\/sighting$/);
    if (req.method === "POST" && ground) return handleGroundReceiverRequest(req, env, ground[1]);

    const health = u.pathname.match(/^\/api\/device\/([^/]+)\/health$/);
    if (req.method === "POST" && health) {
      const response = await base.fetch!(req, env, ctx);
      const withPlaces = await augmentHealthWithLearnedPlaces(response, env.DB, health[1]);
      return augmentHealthWithCoarseNetwork(withPlaces, req.cf as Record<string, unknown> | undefined);
    }

    const parentState = u.pathname.match(/^\/parent\/api\/device\/([^/]+)\/state$/);
    if (req.method === "GET" && parentState) {
      const response = await base.fetch!(req, env, ctx);
      let deviceId: string;
      try { deviceId = decodeURIComponent(parentState[1]); } catch { return response; }
      const refined = await augmentParentStateWithExternalRefinement(response, env, deviceId);
      const normalized = await augmentPhase7ParentStateResponseV2(refined);
      return augmentPhase8ParentTruth(normalized);
    }

    const parentHistory = u.pathname.match(/^\/parent\/api\/device\/([^/]+)\/history$/);
    if (req.method === "GET" && parentHistory) {
      const response = await base.fetch!(req, env, ctx);
      let deviceId: string;
      try { deviceId = decodeURIComponent(parentHistory[1]); } catch { return response; }
      const fromMs = Number(u.searchParams.get("from"));
      const toMs = Number(u.searchParams.get("to"));
      if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return response;
      const provenance = await augmentPhase8HistoryProvenance(response, env, deviceId, fromMs, toMs);
      return augmentParentHistoryWithRefinedLayer(provenance, env, deviceId, fromMs, toMs);
    }

    return base.fetch!(req, env, ctx);
  },
  async queue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) {
    if (base.queue) return base.queue(batch, env, ctx);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (base.scheduled) await base.scheduled(controller, env, ctx);
    try { await cleanupPhase5SemanticIndexes(env.DB); } catch { /* optional index cleanup retries next cron */ }

    // Refinement is eventually consistent: if an earlier R2 pass failed after the endpoint/frame was
    // durably indexed, maintenance retries a bounded set without touching live child state.
    try {
      const pending = await env.DB.prepare(
        "SELECT DISTINCT device_id FROM phase5_hypothesis_frames WHERE refined_run_id IS NULL ORDER BY device_id LIMIT 20"
      ).all<{ device_id: string }>();
      for (const row of pending.results) {
        try { await processRefinementsForDevice(env, row.device_id); } catch { /* retry next maintenance */ }
      }
      await cleanupPhase5RefinedHistory(env);
    } catch { /* Phase 5 refined layer is non-blocking for Core */ }
  }
} satisfies ExportedHandler<Env>;
