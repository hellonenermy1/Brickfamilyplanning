const COOKIE = "brick_parent_dev";
const INTERNAL_HEADER = "X-Brick-Dev-Parent-Verified";
const INTERNAL_VALUE = "session-v1";
const SESSION_MS = 30 * 86_400_000;
const MAX_SESSION_CHARS = 128;
const LOGIN_TOKEN_RE = /^[A-Za-z0-9_-]{43,128}$/;
const TOKEN_HASH_RE = /^[0-9a-f]{64}$/i;

type RateLimit = { limit(input: { key: string }): Promise<{ success: boolean }> };
export type DevParentAuthEnv = { DB: D1Database; PARENT_LOGIN_RATE?: RateLimit; DEV_PARENT_LOGIN_HASH?: string };

type SessionRow = { ok: number };

function randomToken(bytes = 32) {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const b of raw) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, b => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function cookieValue(req: Request) {
  const cookie = req.headers.get("Cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return rest.join("=");
  }
  return null;
}

function sessionCookie(value: string) {
  return `${COOKIE}=${value}; Path=/parent; Max-Age=${Math.floor(SESSION_MS / 1000)}; HttpOnly; Secure; SameSite=Strict`;
}

function clearCookie() {
  return `${COOKIE}=; Path=/parent; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

function baseHeaders(contentType = "text/html; charset=utf-8") {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
  };
}

/**
 * Phase 8 CSRF defense-in-depth. SameSite=Strict remains required, but every state-changing parent
 * request must independently prove that its Origin exactly matches the Brick origin.
 */
export function devParentOriginAllowed(req: Request) {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  const value = req.headers.get("Origin")?.trim();
  if (!value || value.length > 512) return false;
  try {
    return new URL(value).origin === new URL(req.url).origin;
  } catch {
    return false;
  }
}

function loginPage(message = "") {
  const safe = message.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Brick Parent Beta Login</title><style>
  body{margin:0;background:#0b0d10;color:#f5f7fa;font:15px system-ui,-apple-system,sans-serif;display:grid;place-items:center;min-height:100vh}.box{width:min(440px,calc(100% - 32px));background:#15181d;border:1px solid #2b3038;border-radius:18px;padding:24px;box-sizing:border-box}h1{font-size:22px;margin:0 0 8px}.tag{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.08em;background:#5b3710;color:#ffd898;padding:5px 8px;border-radius:999px;margin-bottom:16px}.muted{color:#aeb6c2;line-height:1.5}.msg{margin:14px 0;padding:10px 12px;border-radius:10px;background:#2a1d13;color:#ffd4ad}label{display:block;margin:18px 0 7px;font-weight:650}input{width:100%;box-sizing:border-box;background:#0e1115;color:white;border:1px solid #39414d;border-radius:10px;padding:12px;font:inherit;letter-spacing:.12em}button{margin-top:12px;width:100%;border:0;border-radius:10px;padding:12px;font-weight:750;background:#f4f6f8;color:#111;cursor:pointer}</style></head><body><main class="box"><div class="tag">DEVELOPMENT BETA</div><h1>Brick Parent</h1><p class="muted">Enter the private, randomly generated development access token. Keep it outside GitHub.</p>${safe ? `<div class="msg">${safe}</div>` : ""}<form method="post" action="/parent/login"><label for="token">Development access token</label><input id="token" name="token" type="password" autocomplete="current-password" pattern="[A-Za-z0-9_-]{43,128}" minlength="43" maxlength="128" required><button type="submit">Sign in to beta</button></form></main></body></html>`;
}

async function readFormToken(req: Request) {
  const type = (req.headers.get("Content-Type") ?? "").toLowerCase();
  if (!type.startsWith("application/x-www-form-urlencoded")) return null;
  const text = await req.text();
  if (text.length > 200) return null;
  const value = new URLSearchParams(text).get("token")?.trim() ?? "";
  return LOGIN_TOKEN_RE.test(value) ? value : null;
}

function loginRateKey(req: Request) {
  const ip = (req.headers.get("CF-Connecting-IP") ?? "unknown").slice(0, 96);
  return `parent-login:${ip}`;
}

async function loginRateAllowed(req: Request, env: DevParentAuthEnv) {
  if (!env.PARENT_LOGIN_RATE) return false;
  const result = await env.PARENT_LOGIN_RATE.limit({ key: loginRateKey(req) });
  return result.success;
}

async function loginTokenValid(env: DevParentAuthEnv, code: string) {
  const expected = env.DEV_PARENT_LOGIN_HASH?.trim().toLowerCase() ?? "";
  if (!TOKEN_HASH_RE.test(expected)) return false;
  const actual = await sha256Hex(code);
  return constantTimeEqual(actual, expected);
}

async function createSession(env: DevParentAuthEnv, now: number) {
  const value = randomToken();
  const hash = await sha256Hex(value);
  await env.DB.prepare(
    "INSERT INTO dev_parent_sessions(session_hash,created_at,expires_at,revoked_at) VALUES(?1,?2,?3,NULL)"
  ).bind(hash, now, now + SESSION_MS).run();
  return value;
}

export function stripDevParentInternalHeader(req: Request<unknown, IncomingRequestCfProperties>) {
  const headers = new Headers(req.headers);
  headers.delete(INTERNAL_HEADER);
  return new Request(req, { headers }) as Request<unknown, IncomingRequestCfProperties>;
}

export async function devParentSessionValid(req: Request, env: DevParentAuthEnv, now = Date.now()) {
  const value = cookieValue(req);
  if (!value || value.length > MAX_SESSION_CHARS || !/^[A-Za-z0-9_-]+$/.test(value)) return false;
  const hash = await sha256Hex(value);
  const row = await env.DB.prepare(
    "SELECT 1 AS ok FROM dev_parent_sessions WHERE session_hash=?1 AND revoked_at IS NULL AND expires_at>=?2 LIMIT 1"
  ).bind(hash, now).first<SessionRow>();
  return row?.ok === 1;
}

export async function authorizeDevParentRequest(req: Request<unknown, IncomingRequestCfProperties>, env: DevParentAuthEnv) {
  if (!devParentOriginAllowed(req)) return null;
  if (!(await devParentSessionValid(req, env))) return null;
  const headers = new Headers(req.headers);
  headers.set(INTERNAL_HEADER, INTERNAL_VALUE);
  return new Request(req, { headers }) as Request<unknown, IncomingRequestCfProperties>;
}

export function devParentUnauthorized(req: Request) {
  const url = new URL(req.url);
  if (req.method === "GET" && (url.pathname === "/parent" || url.pathname === "/parent/")) {
    return new Response(null, { status: 302, headers: { Location: "/parent/login", "Cache-Control": "no-store" } });
  }
  return Response.json({ error: "Brick development parent session required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
}

export async function handleDevParentAuthRoute(req: Request, env: DevParentAuthEnv): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname.startsWith("/parent") && !devParentOriginAllowed(req)) {
    return Response.json(
      { error: "Same-origin Brick parent request required" },
      { status: 403, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
    );
  }

  if (url.pathname === "/parent/login" && req.method === "GET") {
    return new Response(loginPage(), { status: 200, headers: baseHeaders() });
  }

  if (url.pathname === "/parent/login" && req.method === "POST") {
    if (!(await loginRateAllowed(req, env))) {
      return new Response(loginPage("Too many sign-in attempts. Try again in about a minute."), {
        status: 429,
        headers: { ...baseHeaders(), "Retry-After": "60" }
      });
    }
    const code = await readFormToken(req);
    if (!code) return new Response(loginPage("Enter your private development access token."), { status: 400, headers: baseHeaders() });
    if (!(await loginTokenValid(env, code))) return new Response(loginPage("That development token is incorrect."), { status: 401, headers: baseHeaders() });
    const now = Date.now();
    const session = await createSession(env, now);
    return new Response(null, { status: 303, headers: { Location: "/parent", "Set-Cookie": sessionCookie(session), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }

  if (url.pathname === "/parent/logout" && req.method === "POST") {
    const value = cookieValue(req);
    if (value && value.length <= MAX_SESSION_CHARS && /^[A-Za-z0-9_-]+$/.test(value)) {
      const hash = await sha256Hex(value);
      await env.DB.prepare("UPDATE dev_parent_sessions SET revoked_at=?1 WHERE session_hash=?2 AND revoked_at IS NULL").bind(Date.now(), hash).run();
    }
    return new Response(null, { status: 303, headers: { Location: "/parent/login", "Set-Cookie": clearCookie(), "Cache-Control": "no-store" } });
  }

  return null;
}

export async function cleanupDevParentAuth(env: DevParentAuthEnv, now = Date.now()) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM dev_parent_login_tokens"),
    env.DB.prepare("DELETE FROM dev_parent_sessions WHERE expires_at<?1 OR (revoked_at IS NOT NULL AND revoked_at<?2)").bind(now, now - 7 * 86_400_000)
  ]);
}

export const DEV_PARENT_INTERNAL_HEADER = INTERNAL_HEADER;
export const DEV_PARENT_INTERNAL_VALUE = INTERNAL_VALUE;
