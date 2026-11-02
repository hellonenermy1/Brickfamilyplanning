const COOKIE = "brick_parent_dev";
const INTERNAL_HEADER = "X-Brick-Dev-Parent-Verified";
const INTERNAL_VALUE = "session-v1";
const SESSION_MS = 30 * 86_400_000;
const MAX_TOKEN_CHARS = 128;
const MAX_SESSION_CHARS = 128;

export type DevParentAuthEnv = { DB: D1Database };

type SessionRow = { ok: number };
type ConsumedRow = { token_hash: string };

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

function loginPage(message = "") {
  const safe = message.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Brick Parent Beta Login</title><style>
  body{margin:0;background:#0b0d10;color:#f5f7fa;font:15px system-ui,-apple-system,sans-serif;display:grid;place-items:center;min-height:100vh}.box{width:min(440px,calc(100% - 32px));background:#15181d;border:1px solid #2b3038;border-radius:18px;padding:24px;box-sizing:border-box}h1{font-size:22px;margin:0 0 8px}.tag{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.08em;background:#5b3710;color:#ffd898;padding:5px 8px;border-radius:999px;margin-bottom:16px}.muted{color:#aeb6c2;line-height:1.5}.msg{margin:14px 0;padding:10px 12px;border-radius:10px;background:#2a1d13;color:#ffd4ad}label{display:block;margin:18px 0 7px;font-weight:650}input{width:100%;box-sizing:border-box;background:#0e1115;color:white;border:1px solid #39414d;border-radius:10px;padding:12px;font:inherit}button{margin-top:12px;width:100%;border:0;border-radius:10px;padding:12px;font-weight:750;background:#f4f6f8;color:#111;cursor:pointer}</style></head><body><main class="box"><div class="tag">DEVELOPMENT BETA</div><h1>Brick Parent</h1><p class="muted">Enter the one-time bootstrap code shown in the GitHub development deployment run. It is consumed after the first successful login.</p>${safe ? `<div class="msg">${safe}</div>` : ""}<form method="post" action="/parent/login"><label for="token">One-time code</label><input id="token" name="token" autocomplete="one-time-code" required maxlength="128"><button type="submit">Sign in to beta</button></form></main></body></html>`;
}

async function readFormToken(req: Request) {
  const type = (req.headers.get("Content-Type") ?? "").toLowerCase();
  if (!type.startsWith("application/x-www-form-urlencoded")) return null;
  const text = await req.text();
  if (text.length > 512) return null;
  const value = new URLSearchParams(text).get("token")?.trim() ?? "";
  return value.length >= 32 && value.length <= MAX_TOKEN_CHARS && /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
}

async function consumeBootstrapToken(env: DevParentAuthEnv, token: string, now: number) {
  const hash = await sha256Hex(token);
  return env.DB.prepare(
    "UPDATE dev_parent_login_tokens SET consumed_at=?1 WHERE token_hash=?2 AND consumed_at IS NULL AND expires_at>=?1 RETURNING token_hash"
  ).bind(now, hash).first<ConsumedRow>();
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
  if (url.pathname === "/parent/login" && req.method === "GET") {
    const queryToken = url.searchParams.get("token")?.trim() ?? "";
    if (!queryToken) return new Response(loginPage(), { status: 200, headers: baseHeaders() });
    if (queryToken.length < 32 || queryToken.length > MAX_TOKEN_CHARS || !/^[A-Za-z0-9_-]+$/.test(queryToken)) {
      return new Response(loginPage("That bootstrap link is invalid."), { status: 400, headers: baseHeaders() });
    }
    const now = Date.now();
    const consumed = await consumeBootstrapToken(env, queryToken, now);
    if (!consumed) return new Response(loginPage("That code is expired or has already been used."), { status: 401, headers: baseHeaders() });
    const session = await createSession(env, now);
    return new Response(null, { status: 303, headers: { Location: "/parent", "Set-Cookie": sessionCookie(session), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }

  if (url.pathname === "/parent/login" && req.method === "POST") {
    const token = await readFormToken(req);
    if (!token) return new Response(loginPage("Enter the complete one-time code."), { status: 400, headers: baseHeaders() });
    const now = Date.now();
    const consumed = await consumeBootstrapToken(env, token, now);
    if (!consumed) return new Response(loginPage("That code is expired or has already been used."), { status: 401, headers: baseHeaders() });
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
    env.DB.prepare("DELETE FROM dev_parent_login_tokens WHERE expires_at<?1 OR consumed_at IS NOT NULL").bind(now - 86_400_000),
    env.DB.prepare("DELETE FROM dev_parent_sessions WHERE expires_at<?1 OR (revoked_at IS NOT NULL AND revoked_at<?2)").bind(now, now - 7 * 86_400_000)
  ]);
}

export const DEV_PARENT_INTERNAL_HEADER = INTERNAL_HEADER;
export const DEV_PARENT_INTERNAL_VALUE = INTERNAL_VALUE;
