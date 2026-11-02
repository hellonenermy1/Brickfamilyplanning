import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const [securityPath] = process.argv.slice(2);
if (!securityPath) throw new Error('usage: test-phase8-device-isolation.mjs <bundled-device-json-security>');
const security = await import(pathToFileURL(securityPath).href + `?v=${Date.now()}`);

async function identity() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
  return { pair, publicKey: Buffer.from(spki).toString('base64') };
}

async function signedRequest(body, privateKey) {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, bytes));
  return new Request('https://brick.test/api/device/target/event', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-brick-signature': Buffer.from(signature).toString('base64')
    },
    body: bytes
  });
}

function fakeDb(rows) {
  return {
    prepare(sql) {
      assert.match(sql, /SELECT public_key_spki_b64,revoked_at FROM devices WHERE id=\?1/);
      return {
        bind(deviceId) {
          return {
            async first() { return rows.get(deviceId) ?? null; }
          };
        }
      };
    }
  };
}

const a = await identity();
const b = await identity();
const rows = new Map([
  ['device-a', { public_key_spki_b64: a.publicKey, revoked_at: null }],
  ['device-b', { public_key_spki_b64: b.publicKey, revoked_at: null }],
  ['device-revoked', { public_key_spki_b64: b.publicKey, revoked_at: Date.now() - 1_000 }]
]);
const env = { DB: fakeDb(rows) };
const now = Date.now();
const payload = {
  eventId: '11111111-1111-4111-8111-111111111111',
  eventSequence: 9,
  createdAtMs: now,
  kind: 'sos_started'
};

// Correct device identity succeeds.
assert.equal(await security.validateSafetyReplayWindow(await signedRequest(payload, a.pair.privateKey), env, 'device-a', now), null);

// A valid signature from device A cannot authorize a request addressed to device B.
const crossDevice = await security.validateSafetyReplayWindow(await signedRequest(payload, a.pair.privateKey), env, 'device-b', now);
assert.ok(crossDevice instanceof Response);
assert.equal(crossDevice.status, 401);
assert.match((await crossDevice.json()).error, /bad signature/);

// Revocation is checked before payload acceptance, even with the matching private key.
const revoked = await security.validateSafetyReplayWindow(await signedRequest(payload, b.pair.privateKey), env, 'device-revoked', now);
assert.ok(revoked instanceof Response);
assert.equal(revoked.status, 401);
assert.match((await revoked.json()).error, /device unauthorized/);

// Unknown device identifiers fail exactly like an unauthorized identity.
const unknown = await security.validateSafetyReplayWindow(await signedRequest(payload, a.pair.privateKey), env, 'device-unknown', now);
assert.ok(unknown instanceof Response);
assert.equal(unknown.status, 401);
assert.match((await unknown.json()).error, /device unauthorized/);

console.log('Phase 8 cross-device signature binding and revoked identity isolation OK');
