import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const moduleUrl = process.argv[2];
if (!moduleUrl) throw new Error('module URL required');
const { verifyAccessRequest } = await import(moduleUrl);

const pair = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' },
  true,
  ['sign','verify']
);
const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
Object.assign(publicJwk, { kid: 'brick-test-key', alg: 'RS256', use: 'sig' });

const enc = new TextEncoder();
const b64u = bytes => Buffer.from(bytes).toString('base64url');
const jsonPart = value => b64u(enc.encode(JSON.stringify(value)));
const team = 'https://brick-test.cloudflareaccess.com';
const aud = 'brick-aud-test';
const nowMs = Date.now();
const now = Math.floor(nowMs / 1000);

async function token(overrides = {}) {
  const h = jsonPart({ alg: 'RS256', typ: 'JWT', kid: 'brick-test-key' });
  const p = jsonPart({ type: 'app', aud: [aud], iss: team, iat: now, exp: now + 300, sub: 'parent', ...overrides });
  const input = `${h}.${p}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, enc.encode(input));
  return `${input}.${b64u(new Uint8Array(sig))}`;
}

globalThis.fetch = async url => {
  assert.equal(String(url), `${team}/cdn-cgi/access/certs`);
  return new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200, headers: { 'content-type': 'application/json' } });
};

const env = { APP_ENV: 'production', CF_ACCESS_TEAM_DOMAIN: team, CF_ACCESS_AUD: aud };
const valid = await token();
const request = jwt => new Request('https://brick.example/parent', { headers: { 'Cf-Access-Jwt-Assertion': jwt } });
assert.ok(await verifyAccessRequest(request(valid), env, nowMs), 'valid Access JWT must pass');
assert.equal(await verifyAccessRequest(request(valid.slice(0,-2)+'xx'), env, nowMs), null, 'tampered signature must fail');
assert.equal(await verifyAccessRequest(request(await token({ aud:['wrong'] })), env, nowMs), null, 'wrong audience must fail');
assert.equal(await verifyAccessRequest(request(await token({ iss:'https://evil.cloudflareaccess.com' })), env, nowMs), null, 'wrong issuer must fail');
assert.equal(await verifyAccessRequest(request(await token({ exp: now - 300 })), env, nowMs), null, 'expired token must fail');
assert.equal(await verifyAccessRequest(request(valid), { APP_ENV:'production' }, nowMs), null, 'missing Access config must fail closed');
assert.ok(await verifyAccessRequest(new Request('http://localhost/parent'), { APP_ENV:'development' }, nowMs), 'localhost may bypass only outside production');
assert.equal(await verifyAccessRequest(new Request('http://localhost/parent'), { APP_ENV:'production' }, nowMs), null, 'production localhost must not bypass');
console.log('Phase 6 Cloudflare Access JWT verification tests passed.');
