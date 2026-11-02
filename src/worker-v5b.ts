import core, { BrickDevice } from "./index";
import { readBoundedBody } from "./bounded-body";
import { canonicalDevicePublicKey } from "./crypto";
import { parentV5BHtml } from "./parent-v5b";
import { privateMapStatus, servePrivateBasemap } from "./private-map";
import { parentAuthorized, unauthorizedParent, type AccessAuthEnv } from "./access-auth";
import { reserveHealthReplay, validatePairingPublicKey, validateSafetyReplayWindow } from "./device-json-security";
import { ingestLocationBatchV6, ingestLocationV6, previewLatestLocationV6 } from "./location-ingest-v6";
import { cleanupPhase5C, ingestCrashReport, listAudit, listCrashReports, recordAudit, releaseStatus } from "./phase5c";
export { BrickDevice };

const MAX_GEOFENCES_PER_DEVICE = 8;
const MAX_PARENT_MUTATION_BYTES = 32 * 1024;

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
    "Content-Security-Policy": `default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self' 'nonce-${scriptNonce}'; connect-src 'self' wss:; img-src 'self' data: blob:; worker-src 'self' blob:; font-src 'self'; object-src 'none'; media-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`,
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
  headers.set("Cf-Access-Jwt-Assertion", "phase6-outer-wrapper-verified");
  return new Request(req, { headers }) as Request<unknown, IncomingRequestCfProperties>;
}

function sameOriginMutation(req: Request) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return true;
  const origin = req.headers.get("Origin");
  return origin !== null && origin === new URL(req.url).origin;
}

function sameOriginWebSocket(req: Request) {
  if (req.method !== "GET") return false;
  if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") return false;
  const origin = req.headers.get("Origin");
  return origin !== null && origin === new URL(req.url).origin;
}

function csrfDenied(message = "same-origin request required") {
  return Response.json({ error: message }, { status: 403, headers: { "Cache-Control": "no-store" } });
}

async function parentMutationBodyDenied(req: Request): Promise<Response | null> {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return null;
  const bounded = await readBoundedBody(req.clone(), MAX_PARENT_MUTATION_BYTES);
  if (bounded.ok) return null;
  return Response.json(
    { error: bounded.reason === "too_large" ? "parent mutation payload too large" : "invalid parent mutation body" },
    { status: bounded.reason === "too_large" ? 413 : 400, headers: { "Cache-Control": "no-store" } }
  );
}

async function pairingRateDenied(req: Request, env: RuntimeEnv): Promise<Response | null> {
  // CF-Connecting-IP is supplied by Cloudflare at the edge. Rate limiting only by the attacker-
  // controlled pairing token lets a scanner rotate random tokens and bypass the namespace limit.
  const ip = (req.headers.get("CF-Connecting-IP") ?? "unknown").slice(0, 128);
  const result = await env.PAIR_RATE.limit({ key: `pair-ip:${ip}` });
  return result.success ? null : Response.json({ error: "rate limited" }, { status: 429, headers: { "Cache-Control": "no-store" } });
}

/**
 * Device identity is the P-256 SPKI, not a replaceable server UUID. Canonicalize it before the core
 * pairing handler and reject any prior row regardless of revoked_at. Schema 015 supplies the race-
 * safe UNIQUE index; this pre-check gives a deterministic 409 instead of consuming a fresh token.
 */
async function canonicalPairingRequest(
  req: Request<unknown, IncomingRequestCfProperties>,
  env: RuntimeEnv
): Promise<Request<unknown, IncomingRequestCfProperties> | Response> {
  const bounded = await readBoundedBody(req.clone(), 4096);
  if (!bounded.ok || !bounded.body.byteLength) {
    return Response.json({ error: "invalid pairing body" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  let body: Record<string, unknown>;
  try { body = JSON.parse(new TextDecoder().decode(bounded.body)) as Record<string, unknown>; }
  catch { return Response.json({ error: "invalid pairing JSON" }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
  const supplied = body.publicKeySpkiB64;
  if (typeof supplied !== "string") {
    return Response.json({ error: "invalid P-256 device public key" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const canonical = await canonicalDevicePublicKey(supplied);
  if (!canonical) {
    return Response.json({ error: "invalid P-256 device public key" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const existing = await env.DB.prepare(
    "SELECT id,revoked_at FROM devices WHERE public_key_spki_b64=?1 LIMIT 1"
  ).bind(canonical).first<{ id: string; revoked_at: number | null }>();
  if (existing) {
    return Response.json(
      { error: "device identity already registered" },
      { status: 409, headers: { "Cache-Control": "no-store" } }
    );
  }
  const headers = new Headers(req.headers);
  headers.set("Content-Type", "application/json");
  headers.delete("Content-Length");
  return new Request(req, {
    headers,
    body: JSON.stringify({ ...body, publicKeySpkiB64: canonical })
  }) as Request<unknown, IncomingRequestCfProperties>;
}

async function localDurabilityEvidenceDenied(req: Request): Promise<Response | null> {
  const bounded = await readBoundedBody(req.clone(), 8192);
  if (!bounded.ok || !bounded.body.byteLength) return null;
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(bounded.body)); }
  catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const h = value as Record<string, unknown>;
  for (const field of ["journalWriteHealthy", "safetyOutboxWriteHealthy", "healthCounterWriteHealthy"]) {
    if (h[field] !== undefined && typeof h[field] !== "boolean") {
      return Response.json({ error: "invalid local durability health evidence" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
  }
  if (h.healthCounterWriteHealthy === false) {
    return Response.json({ error: "health replay counter could not be persisted" }, { status: 503, headers: { "Cache-Control": "no-store" } });
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
  const bodyDenied = await parentMutationBodyDenied(req);
  if (bodyDenied) return bodyDenied;
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

    if (req.method === "POST" && u.pathname === "/api/pair/complete") {
      const rateDenied = await pairingRateDenied(req, env);
      if (rateDenied) return rateDenied;
      const denied = await validatePairingPublicKey(req);
      if (denied) return denied;
      const canonical = await canonicalPairingRequest(req, env);
      if (canonical instanceof Response) return canonical;
      if (!coreHandler.fetch) return new Response("Worker fetch handler unavailable", { status: 500 });
      return coreHandler.fetch(canonical, coreEnv(env), ctx);
    }

    let m = u.pathname.match(/^\/api\/device\/([^/]+)\/location\/batch$/);
    if (req.method === "POST" && m) return ingestLocationBatchV6(req, env, decodeURIComponent(m[1]));
    m = u.pathname.match(/^\/api\/device\/([^/]+)\/location\/live$/);
    if (req.method === "POST" && m) return previewLatestLocationV6(req, env, decodeURIComponent(m[1]));
    m = u.pathname.match(/^\/api\/device\/([^/]+)\/location$/);
    if (req.method === "POST" && m) return ingestLocationV6(req, env, decodeURIComponent(m[1]));

    m = u.pathname.match(/^\/parent\/api\/device\/([^/]+)\/crashes$/);
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
      if (u.pathname.endsWith("/ws") && !sameOriginWebSocket(req)) return csrfDenied("same-origin WebSocket upgrade required");
      if (!sameOriginMutation(req)) return csrfDenied();
      const bodyDenied = await parentMutationBodyDenied(req);
      if (bodyDenied) return bodyDenied;
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
