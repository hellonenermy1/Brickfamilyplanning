import assert from 'node:assert/strict';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
import { pathToFileURL } from 'node:url';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const [modulePath] = process.argv.slice(2);
if (!modulePath) throw new Error('usage: test-phase8-historical-identity.mjs <bundled-phase8-device-identity>');
const identity = await import(pathToFileURL(modulePath).href + `?v=${Date.now()}`);

async function keySpellings() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
  const canonical = Buffer.from(spki).toString('base64');
  return { canonical, unpadded: canonical.replace(/=+$/, '') };
}

const first = await keySpellings();
const second = await keySpellings();
assert.notEqual(first.canonical, first.unpadded);
assert.notEqual(first.canonical, second.canonical);

function envWith(rows, expectedCanonical) {
  return {
    DB: {
      prepare(sql) {
        assert.match(sql, /^SELECT id,public_key_spki_b64 FROM devices WHERE /);
        assert.match(sql, /public_key_spki_b64=\?1/);
        assert.match(sql, /RTRIM\(public_key_spki_b64,'='\)=RTRIM\(\?1,'='\)/);
        assert.match(sql, /LIMIT 4$/);
        assert.doesNotMatch(sql, /ORDER BY|LIMIT \?1/);
        return {
          bind(value) {
            assert.equal(value, expectedCanonical);
            return { async all() { return { results: rows }; } };
          }
        };
      }
    }
  };
}

function pairingRequest(publicKeySpkiB64) {
  return new Request('https://brick.example/api/pair/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'pairing-token-placeholder-1234', publicKeySpkiB64, name: 'Child' })
  });
}

// Historical unpadded row and current canonical request are the same cryptographic identity. The
// Phase 8 outer guard must reject enrollment before the legacy exact-text lookup can miss it.
let denied = await identity.historicalIdentityPairingDenied(
  pairingRequest(first.canonical),
  envWith([{ id: 'old-revoked-device', public_key_spki_b64: first.unpadded }], first.canonical)
);
assert.ok(denied instanceof Response);
assert.equal(denied.status, 409);
assert.equal((await denied.json()).error, 'device identity already registered');

// The inverse spelling must also collapse to the same canonical query/identity.
denied = await identity.historicalIdentityPairingDenied(
  pairingRequest(first.unpadded),
  envWith([{ id: 'old-device', public_key_spki_b64: first.canonical }], first.canonical)
);
assert.equal(denied?.status, 409);

// A genuinely new valid key has no alias candidate and falls through to the normal pairing handler,
// where token validity, rate limiting and schema 015's race-safe UNIQUE constraint are enforced.
assert.equal(await identity.historicalIdentityPairingDenied(
  pairingRequest(second.canonical),
  envWith([], second.canonical)
), null);

// Malformed client input is rejected by canonicalization before any D1 lookup and falls through so
// the normal pairing validator owns the public error response.
let dbTouched = false;
assert.equal(await identity.historicalIdentityPairingDenied(
  pairingRequest('not-base64!'),
  { DB: { prepare() { dbTouched = true; throw new Error('D1 must not be queried for malformed key'); } } }
), null);
assert.equal(dbTouched, false);

// If the targeted alias lookup finds two device rows that canonicalize to one P-256 identity, the
// registry is already ambiguous and new pairing must fail closed until it is repaired.
denied = await identity.historicalIdentityPairingDenied(
  pairingRequest(first.canonical),
  envWith([
    { id: 'device-a', public_key_spki_b64: first.canonical },
    { id: 'device-b', public_key_spki_b64: first.unpadded }
  ], first.canonical)
);
assert.equal(denied?.status, 503);

await assert.rejects(
  () => identity.canonicalizeHistoricalDeviceRows([
    { id: 'device-a', public_key_spki_b64: first.canonical },
    { id: 'device-b', public_key_spki_b64: first.unpadded }
  ]),
  /semantic duplicate device identity/
);
await assert.rejects(
  () => identity.canonicalizeHistoricalDeviceRows([{ id: 'broken-device', public_key_spki_b64: 'not-base64!' }]),
  /invalid stored P-256 public key/
);

// Prevent a future refactor from leaving this well-tested helper disconnected from production.
const worker = fs.readFileSync('src/worker-v9.ts', 'utf8');
const route = worker.indexOf('if (req.method === "POST" && u.pathname === "/api/pair/complete")');
const guard = worker.indexOf('const denied = await historicalIdentityPairingDenied(req, env);', route);
const forward = worker.indexOf('return base.fetch!(req, env, ctx);', guard);
assert.ok(route >= 0 && guard > route && forward > guard, 'worker-v9 must run historical identity guard before base pairing can insert');

console.log('Phase 8 historical identity guard: padding aliases are one permanent identity, lookup cost is bounded, ambiguous aliases fail closed, and production pairing is wired to the guard.');
