type ParentRateLimit = { limit(input: { key: string }): Promise<{ success: boolean }> };
export type ParentAuthEnv = { BRICK_PARENT_PASSWORD?: string; PAIR_RATE: ParentRateLimit };

export const PARENT_COOKIE = "__Secure-brick_parent";
const SESSION_MS = 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, c => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function passwordMatches(candidate: string, expected: string): Promise<boolean> {
  if (!candidate || !expected || candidate.length > 256) return false;
  const [a, b] = await Promise.all([sha256(candidate), sha256(expected)]);
  return equalBytes(a, b);
}

async function sessionKey(secret: string): Promise<CryptoKey> {
  const keyBytes = await sha256(`brick-parent-session-v1\u0000${secret}`);
  return crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function signPayload(payload: string, secret: string): Promise<string> {
  const signature = await crypto.subtle.sign("HMAC", await sessionKey(secret), encoder.encode(payload));
  return base64Url(new Uint8Array(signature));
}

function cookieValue(req: Request, name: string): string | null {
  const raw = req.headers.get("Cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

export async function createParentSession(secret: string, now = Date.now()): Promise<string> {
  if (!secret) throw new Error("parent password secret unavailable");
  const random = crypto.getRandomValues(new Uint8Array(18));
  const payload = `1.${now}.${now + SESSION_MS}.${base64Url(random)}`;
  return `${payload}.${await signPayload(payload, secret)}`;
}

export async function parentSessionValid(req: Request, secret: string | undefined, now = Date.now()): Promise<boolean> {
  if (!secret) return false;
  const token = cookieValue(req, PARENT_COOKIE);
  if (!token || token.length > 512) return false;
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "1") return false;
  const issued = Number(parts[1]), expires = Number(parts[2]);
  if (!Number.isSafeInteger(issued) || !Number.isSafeInteger(expires)) return false;
  if (issued > now + 60_000 || expires <= now || expires - issued !== SESSION_MS) return false;
  const payload = parts.slice(0, 4).join(".");
  const provided = fromBase64Url(parts[4]);
  if (!provided) return false;
  const expected = fromBase64Url(await signPayload(payload, secret));
  return expected !== null && equalBytes(provided, expected);
}

export async function parentAuthorized(req: Request, env: ParentAuthEnv): Promise<boolean> {
  const u = new URL(req.url);
  if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
  return parentSessionValid(req, env.BRICK_PARENT_PASSWORD);
}

function headers(extra: Record<string, string> = {}): Headers {
  return new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    "X-Frame-Options": "DENY",
    ...extra
  });
}

function loginHtml(error = ""): string {
  const message = error ? `<div class="error">${error}</div>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Brick Parent Login</title><style>:root{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#111827;background:#eef1f5}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(390px,100%);background:#fff;border:1px solid #dfe3e8;border-radius:16px;padding:26px;box-shadow:0 14px 40px #0002}.brand{font-weight:900;letter-spacing:.12em;font-size:22px}.muted{color:#667085;font-size:13px;margin:8px 0 20px}.field{width:100%;border:1px solid #cfd5dc;border-radius:10px;padding:12px;font:inherit}.btn{width:100%;margin-top:12px;border:0;border-radius:10px;padding:12px;background:#171a1d;color:#fff;font:inherit;font-weight:800;cursor:pointer}.error{background:#fff0ef;color:#a71916;border-radius:9px;padding:9px 11px;margin:0 0 12px;font-size:13px}</style></head><body><main class="card"><div class="brand">BRICK</div><div class="muted">Parent dashboard · private session</div>${message}<form method="post" action="/parent/login"><input class="field" type="password" name="password" autocomplete="current-password" autofocus required maxlength="256" placeholder="Parent password"><button class="btn" type="submit">Sign in</button></form></main></body></html>`;
}

export function loginPage(error = "", status = 200): Response {
  return new Response(loginHtml(error), { status, headers: headers() });
}

export async function handleParentLogin(req: Request, env: ParentAuthEnv): Promise<Response> {
  if (req.method === "GET") {
    if (await parentAuthorized(req, env)) return new Response(null, { status: 303, headers: { Location: "/parent", "Cache-Control": "no-store" } });
    return loginPage();
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST", "Cache-Control": "no-store" } });
  if (!env.BRICK_PARENT_PASSWORD) return loginPage("Parent authentication is not configured.", 503);
  const length = Number(req.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(length) && length > 4096) return loginPage("Invalid login request.", 400);
  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  const rate = await env.PAIR_RATE.limit({ key: `parent-login:${ip}` });
  if (!rate.success) return loginPage("Too many attempts. Try again shortly.", 429);
  const form = await req.formData().catch(() => null);
  const password = form ? String(form.get("password") ?? "") : "";
  if (!(await passwordMatches(password, env.BRICK_PARENT_PASSWORD))) return loginPage("Incorrect password.", 401);
  const session = await createParentSession(env.BRICK_PARENT_PASSWORD);
  const cookie = `${PARENT_COOKIE}=${session}; Path=/parent; Max-Age=${SESSION_MS / 1000}; HttpOnly; Secure; SameSite=Strict`;
  return new Response(null, { status: 303, headers: { Location: "/parent", "Set-Cookie": cookie, "Cache-Control": "no-store" } });
}

export function handleParentLogout(): Response {
  return new Response(null, { status: 303, headers: { Location: "/parent/login", "Set-Cookie": `${PARENT_COOKIE}=; Path=/parent; Max-Age=0; HttpOnly; Secure; SameSite=Strict`, "Cache-Control": "no-store" } });
}

export function unauthorizedParent(req: Request): Response {
  const u = new URL(req.url);
  const wantsHtml = req.method === "GET" && (u.pathname === "/parent" || u.pathname === "/parent/");
  if (wantsHtml) return new Response(null, { status: 303, headers: { Location: "/parent/login", "Cache-Control": "no-store" } });
  return Response.json({ error: "Parent authentication required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
}
