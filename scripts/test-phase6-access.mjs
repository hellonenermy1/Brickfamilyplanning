import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const moduleUrl = process.argv[2];
if (!moduleUrl) throw new Error('module URL required');
const { verifyAccessRequest } = await import(moduleUrl);

async function signingPair(kid) {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' },
    true,
    ['sign','verify']
  );
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  Object.assign(publicJwk, { kid, alg: 'RS256', use: 'sig' });
  return { pair, publicJwk, kid };
}

const primary = await signingPair('brick-test-key');
const rotated = await signingPair('brick-rotated-key');
const enc = new TextEncoder();
const b64u = bytes => Buffer.from(bytes).toString('base64url');
const jsonPart = value => b64u(enc.encode(JSON.stringify(value)));
const team = 'https://brick-test.cloudflareaccess.com';
const aud = 'brick-aud-test';
const nowMs = Date.now();
const now = Math.floor(nowMs / 1000);

async function token(overrides = {}, signer = primary, headerOverrides = {}) {
  const h = jsonPart({ alg: 'RS256', typ: 'JWT', kid: signer.kid, ...headerOverrides });
  const p = jsonPart({ type: 'app', aud: [aud], iss: team, iat: now, exp: now + 300, sub: 'parent', ...overrides });
  const input = `${h}.${p}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signer.pair.privateKey, enc.encode(input));
  return `${input}.${b64u(new Uint8Array(sig))}`;
}

let certMode = 'primary';
let certFetches = 0;
globalThis.fetch = async url => {
  assert.equal(String(url), `${team}/cdn-cgi/access/certs`);
  certFetches += 1;
  const keys = certMode === 'rotating' ? [primary.publicJwk, rotated.publicJwk] : [primary.publicJwk];
  return new Response(JSON.stringify({ keys }), { status: 200, headers: { 'content-type': 'application/json' } });
};

const env = { APP_ENV: 'production', CF_ACCESS_TEAM_DOMAIN: team, CF_ACCESS_AUD: aud };
const valid = await token();
const request = jwt => new Request('https://brick.example/parent', { headers: jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {} });
assert.ok(await verifyAccessRequest(request(valid), env, nowMs), 'valid Access JWT must pass');
assert.equal(await verifyAccessRequest(request(), env, nowMs), null, 'missing Access JWT must fail');
assert.equal(await verifyAccessRequest(request(valid.slice(0,-2)+'xx'), env, nowMs), null, 'tampered signature must fail');
assert.equal(await verifyAccessRequest(request(await token({ aud:['wrong'] })), env, nowMs), null, 'wrong audience must fail');
assert.equal(await verifyAccessRequest(request(await token({ iss:'https://evil.cloudflareaccess.com' })), env, nowMs), null, 'wrong issuer must fail');
assert.equal(await verifyAccessRequest(request(await token({ exp: now - 300 })), env, nowMs), null, 'expired token must fail');
assert.equal(await verifyAccessRequest(request(await token({ iat: now + 300, exp: now + 600 })), env, nowMs), null, 'future-issued token must fail');
assert.equal(await verifyAccessRequest(request(await token({ nbf: now + 300 })), env, nowMs), null, 'future not-before token must fail');
assert.equal(await verifyAccessRequest(request(await token({ exp: now + 49 * 60 * 60 })), env, nowMs), null, 'overlong Access session token must fail');
assert.equal(await verifyAccessRequest(request(await token({ type: 'user' })), env, nowMs), null, 'non-app token must fail');
assert.equal(await verifyAccessRequest(request(await token({}, primary, { typ: 'NOT-JWT' })), env, nowMs), null, 'unexpected JWT type must fail');
assert.equal(await verifyAccessRequest(request(await token({}, primary, { alg: 'HS256' })), env, nowMs), null, 'unexpected JWT algorithm must fail before signature acceptance');
assert.equal(await verifyAccessRequest(request(valid), { APP_ENV:'production' }, nowMs), null, 'missing Access config must fail closed');
assert.ok(await verifyAccessRequest(new Request('http://localhost/parent'), { APP_ENV:'development' }, nowMs), 'localhost may bypass only outside production');
assert.equal(await verifyAccessRequest(new Request('http://localhost/parent'), { APP_ENV:'production' }, nowMs), null, 'production localhost must not bypass');

// The primary key set is cached from the first successful verification. An unseen rotated kid must
// therefore miss that cache, force exactly one trusted JWKS refresh, and pass only when the refreshed
// key set actually contains the new kid.
certMode = 'rotating';
certFetches = 0;
const rotatedJwt = await token({}, rotated);
assert.ok(await verifyAccessRequest(request(rotatedJwt), env, nowMs), 'trusted rotated Access signing key must be accepted after JWKS refresh');
assert.equal(certFetches, 1, 'rotated kid must trigger one forced JWKS refresh after cached-key miss');

console.log('Phase 8 Cloudflare Access fail-closed, expiry, claim-boundary and signing-key-rotation tests passed.');
