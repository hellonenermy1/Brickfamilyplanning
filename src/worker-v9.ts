import phase8, { BrickDevice } from "./worker-v8";
import { handleGroundReceiverRequest, type GroundReceiverEnv } from "./ground-receiver";
import { cleanupPhase5SemanticIndexes } from "./phase5-maintenance";
import { runBackgroundWork } from './background-work';
import { nextRefinementCandidates } from './refinement-scheduler';
import {dispatchDerivedWork,type BackgroundDispatchEnv} from './derived-work-dispatch';
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
import { parentAuthorized, unauthorizedParent, type AccessAuthEnv } from "./access-auth";
import { handleFastLive, type FastLiveEnv } from "./fast-live";
import { handleCanary } from "./canary-route";
import {
  augmentHealthWithP8BControls,
  noteP8BHealth,
  parentGetLiveTrack,
  parentGetWifiSchedules,
  parentRenameDevice,
  parentSetLiveTrack,
  parentSetWifiSchedules
} from "./p8b-controls";
export { BrickDevice };

type RateLimit = { limit(input: { key: string }): Promise<{ success: boolean }> };
type Env = GroundReceiverEnv & FastLiveEnv & AccessAuthEnv & BackgroundDispatchEnv & {
  HISTORY: R2Bucket;
  MAPS: R2Bucket;
  EVENTS: Queue;
  BRICK_DEVICE: DurableObjectNamespace<BrickDevice>;
  DEVICE_RATE: RateLimit;
  PAIR_RATE: RateLimit;
  APP_ENV: string;
  CURRENT_APP_VERSION: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
};
const base = phase8 as ExportedHandler<Env>;
const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type DeviceLife = { revoked_at: number | null };

function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
function sameOriginMutation(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  const origin = req.headers.get("Origin");
  return origin !== null && origin === new URL(req.url).origin;
}
async function parentGuard(req: Request, env: Env): Promise<Response | null> {
  if (!(await parentAuthorized(req, env))) return unauthorizedParent(req);
  if (!sameOriginMutation(req)) return json({ error: "same-origin request required" }, 403);
  return null;
}

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
    lat: s.lat as number | null, lon: s.lon as number | null, uncertaintyM: s.uncertaintyM,
    quality: s.quality, source: typeof s.source === "string" ? s.source : undefined, receivedAt: s.receivedAt,
    wallTimeMs: typeof s.wallTimeMs === "number" && Number.isSafeInteger(s.wallTimeMs) ? s.wallTimeMs : undefined
  };
}

function productionParentResponse(baseResponse: Response, baseHtml: string) {
  const match = baseHtml.match(/<script\s+type=["']module["']\s+nonce=["']([^"']+)["']>/);
  if (!match) return new Response("Parent dashboard security nonce missing", { status: 500, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  const html = parentV8Html().replace('<script type="module">', `<script type="module" nonce="${match[1]}">`);
  const headers = new Headers(baseResponse.headers);
  headers.set("Cache-Control", "no-store"); headers.set("X-Content-Type-Options", "nosniff"); headers.set("X-Brick-Parent-Truth", "phase8-v1-p8b");
  return new Response(html, { status: baseResponse.status, statusText: baseResponse.statusText, headers });
}

async function augmentParentStateWithExternalRefinement(response: Response, env: Env, deviceId: string): Promise<Response> {
  if (!response.ok || !DEVICE_ID_RE.test(deviceId)) return response;
  const contentType = (response.headers.get("Content-Type") ?? "").toLowerCase();
  if (!contentType.includes("application/json")) return response;
  const life = await env.DB.prepare("SELECT revoked_at FROM devices WHERE id=?1 LIMIT 1").bind(deviceId).first<DeviceLife>();
  if (!life || life.revoked_at !== null) return response;
  let body: unknown; try { body = await response.json(); } catch { return response; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return response;
  const object = body as Record<string, unknown>;
  const current = asParentState(object.state);
  let external; try { external = await listCurrentExternalConstraints(env.DB, deviceId, Date.now()); }
  catch { return new Response(JSON.stringify(object), { status: response.status, statusText: response.statusText, headers: response.headers }); }
  const refinedState = refineCurrentState(current, external, Date.now());
  const headers = new Headers(response.headers); headers.set("Content-Type", "application/json; charset=utf-8"); headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify({ ...object, refinedState }), { status: response.status, statusText: response.statusText, headers });
}

async function augmentParentHistoryWithRefinedLayer(response: Response, env: Env, deviceId: string, fromMs: number, toMs: number) {
  if (!response.ok || !DEVICE_ID_RE.test(deviceId)) return response;
  const contentType = (response.headers.get("Content-Type") ?? "").toLowerCase();
  if (!contentType.includes("application/json")) return response;
  let body: unknown; try { body = await response.json(); } catch { return response; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return response;
  let refinedHistory; try { refinedHistory = await listRefinedHistory(env, deviceId, fromMs, toMs); }
  catch { return new Response(JSON.stringify(body), { status: response.status, statusText: response.statusText, headers: response.headers }); }
  const headers = new Headers(response.headers); headers.set("Content-Type", "application/json; charset=utf-8"); headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify({ ...(body as Record<string, unknown>), refinedHistory }), { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(req: Request<unknown, IncomingRequestCfProperties>, env: Env, ctx: ExecutionContext) {
    const u = new URL(req.url);

    if (req.method === "POST" && u.pathname === "/api/pair/complete") {
      const denied = await historicalIdentityPairingDenied(req, env); if (denied) return denied;
    }

    if (req.method === "GET" && (u.pathname === "/parent" || u.pathname === "/parent/")) {
      const response = await base.fetch!(req, env, ctx); if (!response.ok) return response;
      return productionParentResponse(response, await response.text());
    }

    const fastLive = u.pathname.match(/^\/api\/device\/([^/]+)\/location\/live$/);
    if (req.method === "POST" && fastLive) return handleFastLive(req, env, decodeURIComponent(fastLive[1]));

    const canary = u.pathname.match(/^\/api\/device\/([^/]+)\/canary$/);
    if (req.method === "POST" && canary) return handleCanary(req, env, decodeURIComponent(canary[1]));

    const ground = u.pathname.match(/^\/api\/ground\/([^/]+)\/sighting$/);
    if (req.method === "POST" && ground) return handleGroundReceiverRequest(req, env, ground[1]);

    const health = u.pathname.match(/^\/api\/device\/([^/]+)\/health$/);
    if (req.method === "POST" && health) {
      const deviceId = decodeURIComponent(health[1]);
      const copy = req.clone();
      const response = await base.fetch!(req, env, ctx);
      if (response.ok) ctx.waitUntil(noteP8BHealth(copy, env, deviceId));
      const withPlaces = await augmentHealthWithLearnedPlaces(response, env.DB, deviceId);
      const withCoarse = await augmentHealthWithCoarseNetwork(withPlaces, req.cf as Record<string, unknown> | undefined);
      return augmentHealthWithP8BControls(withCoarse, env, deviceId);
    }

    const control = u.pathname.match(/^\/parent\/api\/device\/([^/]+)\/(live-track|wifi-schedules|rename)$/);
    if (control) {
      const denied = await parentGuard(req, env); if (denied) return denied;
      const deviceId = decodeURIComponent(control[1]), action = control[2];
      if (action === "live-track" && req.method === "GET") return parentGetLiveTrack(env, deviceId);
      if (action === "live-track" && req.method === "POST") return parentSetLiveTrack(req, env, deviceId);
      if (action === "wifi-schedules" && req.method === "GET") return parentGetWifiSchedules(env, deviceId);
      if (action === "wifi-schedules" && req.method === "POST") return parentSetWifiSchedules(req, env, deviceId);
      if (action === "rename" && req.method === "POST") return parentRenameDevice(req, env, deviceId);
      return json({ error: "method not allowed" }, 405);
    }

    const parentState = u.pathname.match(/^\/parent\/api\/device\/([^/]+)\/state$/);
    if (req.method === "GET" && parentState) {
      const response = await base.fetch!(req, env, ctx);
      let deviceId: string; try { deviceId = decodeURIComponent(parentState[1]); } catch { return response; }
      const refined = await augmentParentStateWithExternalRefinement(response, env, deviceId);
      const normalized = await augmentPhase7ParentStateResponseV2(refined);
      return augmentPhase8ParentTruth(normalized);
    }

    const parentHistory = u.pathname.match(/^\/parent\/api\/device\/([^/]+)\/history$/);
    if (req.method === "GET" && parentHistory) {
      const response = await base.fetch!(req, env, ctx);
      let deviceId: string; try { deviceId = decodeURIComponent(parentHistory[1]); } catch { return response; }
      const fromMs = Number(u.searchParams.get("from")), toMs = Number(u.searchParams.get("to"));
      if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return response;
      const provenance = await augmentPhase8HistoryProvenance(response, env, deviceId, fromMs, toMs);
      return augmentParentHistoryWithRefinedLayer(provenance, env, deviceId, fromMs, toMs);
    }

    return base.fetch!(req, env, ctx);
  },
  async queue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) { if (base.queue) return base.queue(batch, env, ctx); },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    let failed = false;
    try { if (base.scheduled) await base.scheduled(controller, env, ctx); } catch { failed = true; }
    // Daily backup is independently leased. Do not make a successful backup
    // retry every minute because unrelated minute enrichment is failing.
    if (controller.cron === '17 3 * * *') {
      if (failed) throw Error('base daily maintenance failed');
      return;
    }
    try { await runBackgroundWork(env.DB, 'semantic-indexes', 'global', () => cleanupPhase5SemanticIndexes(env.DB)); } catch { failed = true; }
    try {
      let pending: string[] = [];
      await runBackgroundWork(env.DB, 'refinement-scan', 'global', async () => { pending = await nextRefinementCandidates(env.DB); });
      // A failed device backs off individually; it must not back off the cursor
      // scan and thereby delay every other pending device for the same interval.
      for (const deviceId of pending) {
        try { await dispatchDerivedWork(env, 'refinement', deviceId, () => processRefinementsForDevice(env, deviceId)); }
        catch { failed = true; }
      }
    } catch { failed = true; }
    try { await runBackgroundWork(env.DB, 'refined-retention', 'global', () => cleanupPhase5RefinedHistory(env)); } catch { failed = true; }
    if (failed) throw Error('derived maintenance failed');
  }
} satisfies ExportedHandler<Env>;
