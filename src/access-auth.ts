export type AccessAuthEnv = {
  APP_ENV?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
};

type AccessJwtHeader = { alg?: unknown; kid?: unknown; typ?: unknown };
type AccessJwtPayload = {
  type?: unknown;
  aud?: unknown;
  iss?: unknown;
  exp?: unknown;
  iat?: unknown;
  nbf?: unknown;
  sub?: unknown;
  email?: unknown;
};
type AccessJwk = JsonWebKey & { kid?: string; alg?: string; use?: string };
type CertResponse = { keys?: AccessJwk[] };

const encoder = new TextEncoder();
const MAX_JWT_BYTES = 16 * 1024;
const CLOCK_SKEW_SECONDS = 60;
const JWKS_CACHE_MS = 5 * 60 * 1000;
let jwksCache: { teamDomain: string; loadedAt: number; keys: AccessJwk[] } | null = null;

function decodeBase64Url(part: string): Uint8Array | null {
  try {
    if (!part || !/^[A-Za-z0-9_-]+$/.test(part)) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((part.length + 3) % 4);
    const binary = atob(base64);
    return Uint8Array.from(binary, c => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function decodeJsonPart<T>(part: string): T | null {
  const bytes = decodeBase64Url(part);
  if (!bytes) return null;
  try { return JSON.parse(new TextDecoder().decode(bytes)) as T; }
  catch { return null; }
}

function normalizeTeamDomain(value: string | undefined): string | null {
  if (!value) return null;
  const raw = value.trim().replace(/\/$/, "");
  const withScheme = raw.startsWith("https://") ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "https:" || u.username || u.password || u.port || u.pathname !== "/" || u.search || u.hash) return null;
    if (!/^[a-z0-9.-]+\.cloudflareaccess\.com$/i.test(u.hostname)) return null;
    return `https://${u.hostname.toLowerCase()}`;
  } catch {
    return null;
  }
}

async function loadKeys(teamDomain: string, force = false): Promise<AccessJwk[]> {
  const now = Date.now();
  if (!force && jwksCache?.teamDomain === teamDomain && now - jwksCache.loadedAt < JWKS_CACHE_MS) return jwksCache.keys;
  const response = await fetch(`${teamDomain}/cdn-cgi/access/certs`, {
    headers: { Accept: "application/json" },
    cf: { cacheTtl: 300, cacheEverything: true }
  });
  if (!response.ok) throw new Error("Access signing keys unavailable");
  const body = await response.json<CertResponse>();
  const keys = Array.isArray(body.keys) ? body.keys.filter(k => k && k.kty === "RSA" && typeof k.kid === "string") : [];
  if (!keys.length) throw new Error("Access signing keys empty");
  jwksCache = { teamDomain, loadedAt: now, keys };
  return keys;
}

function audienceMatches(claim: unknown, expected: string): boolean {
  if (typeof claim === "string") return claim === expected;
  return Array.isArray(claim) && claim.some(v => v === expected);
}

function finiteInteger(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v);
}

async function verifyWithJwk(jwk: AccessJwk, signingInput: string, signature: Uint8Array): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sig = new ArrayBuffer(signature.byteLength);
    new Uint8Array(sig).set(signature);
    return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, encoder.encode(signingInput));
  } catch {
    return false;
  }
}

export async function verifyAccessRequest(req: Request, env: AccessAuthEnv, nowMs = Date.now()): Promise<AccessJwtPayload | null> {
  const url = new URL(req.url);
  if (env.APP_ENV !== "production" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
    return { type: "app", aud: ["local-development"], iss: "local-development", exp: Math.floor(nowMs / 1000) + 60, iat: Math.floor(nowMs / 1000) };
  }

  const teamDomain = normalizeTeamDomain(env.CF_ACCESS_TEAM_DOMAIN);
  const expectedAud = env.CF_ACCESS_AUD?.trim();
  if (!teamDomain || !expectedAud || expectedAud.length > 128) return null;

  const token = req.headers.get("Cf-Access-Jwt-Assertion")?.trim();
  if (!token || token.length > MAX_JWT_BYTES) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const header = decodeJsonPart<AccessJwtHeader>(parts[0]);
  const payload = decodeJsonPart<AccessJwtPayload>(parts[1]);
  const signature = decodeBase64Url(parts[2]);
  if (!header || !payload || !signature) return null;
  if (header.alg !== "RS256" || typeof header.kid !== "string" || header.kid.length > 256) return null;
  if (header.typ !== undefined && header.typ !== "JWT") return null;
  if (payload.type !== "app") return null;
  if (!audienceMatches(payload.aud, expectedAud)) return null;
  if (payload.iss !== teamDomain) return null;

  const now = Math.floor(nowMs / 1000);
  if (!finiteInteger(payload.exp) || payload.exp <= now - CLOCK_SKEW_SECONDS) return null;
  if (!finiteInteger(payload.iat) || payload.iat > now + CLOCK_SKEW_SECONDS) return null;
  if (payload.nbf !== undefined && !finiteInteger(payload.nbf)) return null;
  if (finiteInteger(payload.nbf) && payload.nbf > now + CLOCK_SKEW_SECONDS) return null;
  if (payload.exp <= payload.iat || payload.exp - payload.iat > 48 * 60 * 60) return null;

  let keys: AccessJwk[];
  try { keys = await loadKeys(teamDomain); } catch { return null; }
  let jwk = keys.find(k => k.kid === header.kid && (!k.alg || k.alg === "RS256") && (!k.use || k.use === "sig"));
  if (!jwk) {
    try { keys = await loadKeys(teamDomain, true); } catch { return null; }
    jwk = keys.find(k => k.kid === header.kid && (!k.alg || k.alg === "RS256") && (!k.use || k.use === "sig"));
  }
  if (!jwk) return null;
  return (await verifyWithJwk(jwk, `${parts[0]}.${parts[1]}`, signature)) ? payload : null;
}

export async function parentAuthorized(req: Request, env: AccessAuthEnv): Promise<boolean> {
  return (await verifyAccessRequest(req, env)) !== null;
}

export function unauthorizedParent(req: Request): Response {
  const url = new URL(req.url);
  const html = req.method === "GET" && (url.pathname === "/parent" || url.pathname === "/parent/");
  if (html) {
    return new Response("Cloudflare Access authentication required", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
    });
  }
  return Response.json({ error: "Cloudflare Access authentication required" }, { status: 403, headers: { "Cache-Control": "no-store" } });
}
