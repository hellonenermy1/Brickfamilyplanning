import core, { BrickDevice } from "./index";
import { parentV5BHtml } from "./parent-v5b";
import { privateMapStatus, servePrivateBasemap } from "./private-map";
import { parentAuthorized, unauthorizedParent, type AccessAuthEnv } from "./access-auth";
import { reserveHealthReplay, validateSafetyReplayWindow } from "./device-json-security";
import { cleanupPhase5C, ingestCrashReport, listAudit, listCrashReports, recordAudit, releaseStatus } from "./phase5c";
export { BrickDevice };

const MAX_GEOFENCES_PER_DEVICE = 8;

type RuntimeEnv = AccessAuthEnv & {
  DB: D1Database;
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

type CoreEnv = RuntimeEnv;

function nonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function parentHeaders(scriptNonce: string) {
  return new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()",
    "Content-Security-Policy": `default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'nonce-${scriptNonce}'; connect-src 'self' wss:; img-src 'self' data: blob:; worker-src 'self' blob:; font-src 'self'; object-src 'none'; media-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`,
    "X-Frame-Options": "DENY",
    "Strict-Transport-Security": "max-age=31536000",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": "no-store"
  });
}

function parentHtmlResponse() {
  const scriptNonce = nonce();
  const html = parentV5BHtml().replace('<script type="module">', `<script type="module" nonce="${scriptNonce}">`);
  return new Response(html, { headers: parentHeaders(scriptNonce) });
}

function coreEnv(env: RuntimeEnv): CoreEnv { return env; }
function mapEnv(env: RuntimeEnv) { return { MAPS: env.MAPS }; }

function authorizeForCore(req: Request<unknown, IncomingRequestCfProperties>): Request<unknown, IncomingRequestCfProperties> {
  const headers = new Headers(req.headers);
  headers.set("X-Brick-Internal-Parent", "verified");
  return new Request(req, { headers }) as Request<unknown, IncomingRequestCfProperties>;
}

function sameOriginMutation(req: Request) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return true;
  const origin = req.headers.get("Origin");
  return origin !== null && origin === new URL(req.url).origin;
}

function csrfDenied() {
  return Response.json({ error: "same-origin request required" }, { status: 403, headers: { "Cache-Control": "no-store" } });
}

async function localDurabilityEvidenceDenied(req: Request): Promise<Response | null> {
  let value: unknown;
  try {
    const body = await req.clone().arrayBuffer();
    if (!body.byteLength || body.byteLength > 8192) return null;
    value = JSON.parse(new TextDecoder().decode(body));
  } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const h = value as Record<string, unknown>;
  for (const field of ["journalWriteHealthy", "safetyOutboxWriteHealthy", "healthCounterWriteHealthy"]) {
    if (h[field] !== undefined && typeof h[field] !== "boolean") {
      return Response.json({ error: "invalid local durability health evidence" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
  }
  for (const field of ["lastJournalWriteFailureAgeMs", "lastSafetyOutboxWriteFailureAgeMs"]) {
    const v = h[field];
    if (v !== undefined && v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0)) {
      return Response.json({ error: "invalid local durability health evidence" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
  }
  return null;
}

async function requireParent(req: Request, env: RuntimeEnv) {
  return (await parentAuthorized(req, env)) ? null : unauthorizedParent(req);
}

async function forwardParentMutation(req: Request<unknown, IncomingRequestCfProperties>, env: RuntimeEnv, ctx: ExecutionContext) {
  const denied = await requireParent(req, env);
  if (denied) return denied;
  if (!sameOriginMutation(req)) return csrfDenied();
  if (!coreHandler.fetch) return new Response("Worker fetch handler unavailable", { status: 500 });
  const response = await coreHandler.fetch(authorizeForCore(req), coreEnv(env), ctx);
  ctx.waitUntil(recordAudit(env, "parent_mutation", req, response.status));
  return response;
}

const coreHandler = core as ExportedHandler<CoreEnv>;

export default {
  async fetch(req: Request<unknown, IncomingRequestCfProperties>, env: RuntimeEnv, ctx: ExecutionContext) {
    const u = new URL(req.url);

    if (u.pathname === "/parent" || u.pathname === "/parent/") {
      const denied = await requireParent(req, env); if (denied) return denied;
      return parentHtmlResponse();
    }
    if (u.pathname === "/parent/map/status") {
      const denied = await requireParent(req, env); if (denied) return denied;
      return privateMapStatus(mapEnv(env));
    }
    if (u.pathname === "/parent/map/basemap.pmtiles") {
      const denied = await requireParent(req, env); if (denied) return denied;
      try { return await servePrivateBasemap(req, mapEnv(env)); }
      catch { return new Response("Private basemap unavailable", { status: 503, headers: { "Cache-Control": "no-store" } }); }
    }
    if (u.pathname === "/parent/api/release") {
      const denied = await requireParent(req, env); if (denied) return denied;
      return releaseStatus(env);
    }
    if (u.pathname === "/parent/api/audit") {
      const denied = await requireParent(req, env); if (denied) return denied;
      const limit = Number(u.searchParams.get("limit") ?? "100");
      return listAudit(env, Number.isFinite(limit) ? limit : 100);
    }

    let m = u.pathname.match(/^\/parent\/api\/device\/([^/]+)\/crashes$/);
    if (req.method === "GET" && m) {
      const denied = await requireParent(req, env); if (denied) return denied;
      const limit = Number(u.searchParams.get("limit") ?? "50");
      return listCrashReports(env, decodeURIComponent(m[1]), Number.isFinite(limit) ? limit : 50);
    }

    m = u.pathname.match(/^\/api\/device\/([^/]+)\/crash$/);
    if (req.method === "POST" && m) return ingestCrashReport(req, env, decodeURIComponent(m[1]));

    m = u.pathname.match(/^\/api\/device\/([^/]+)\/event$/);
    if (req.method === "POST" && m) {
      const denied = await validateSafetyReplayWindow(req, env, decodeURIComponent(m[1]));
      if (denied) return denied;
    }

    m = u.pathname.match(/^\/api\/device\/([^/]+)\/health$/);
    if (req.method === "POST" && m) {
      const durabilityDenied = await localDurabilityEvidenceDenied(req);
      if (durabilityDenied) return durabilityDenied;
      const replayDenied = await reserveHealthReplay(req, env, decodeURIComponent(m[1]));
      if (replayDenied) return replayDenied;
    }

    if (!coreHandler.fetch) return new Response("Worker fetch handler unavailable", { status: 500 });

    m = u.pathname.match(/^\/parent\/api\/device\/([^/]+)\/geofences$/);
    if (req.method === "POST" && m) {
      const denied = await requireParent(req, env); if (denied) return denied;
      if (!sameOriginMutation(req)) return csrfDenied();
      const deviceId = decodeURIComponent(m[1]);
      const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM geofences WHERE device_id=?1").bind(deviceId).first<{ n: number }>();
      if (Number(row?.n ?? 0) >= MAX_GEOFENCES_PER_DEVICE) {
        const response = Response.json({ error: `Brick supports up to ${MAX_GEOFENCES_PER_DEVICE} geofences per device in V1` }, { status: 409, headers: { "Cache-Control": "no-store" } });
        ctx.waitUntil(recordAudit(env, "parent_mutation", req, response.status, { reason: "geofence_limit" }));
        return response;
      }
      return forwardParentMutation(req, env, ctx);
    }

    if (u.pathname.startsWith("/parent/")) {
      const denied = await requireParent(req, env); if (denied) return denied;
      if (!sameOriginMutation(req)) return csrfDenied();
      const response = await coreHandler.fetch(authorizeForCore(req), coreEnv(env), ctx);
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) ctx.waitUntil(recordAudit(env, "parent_mutation", req, response.status));
      return response;
    }

    return coreHandler.fetch(req, coreEnv(env), ctx);
  },

  async queue(batch: MessageBatch<unknown>, env: RuntimeEnv, ctx: ExecutionContext) {
    if (coreHandler.queue) return coreHandler.queue(batch, coreEnv(env), ctx);
  },

  async scheduled(controller: ScheduledController, env: RuntimeEnv, ctx: ExecutionContext) {
    if (coreHandler.scheduled) await coreHandler.scheduled(controller, coreEnv(env), ctx);
    if (controller.cron === "17 3 * * *") ctx.waitUntil(cleanupPhase5C(env));
  }
} satisfies ExportedHandler<RuntimeEnv>;
