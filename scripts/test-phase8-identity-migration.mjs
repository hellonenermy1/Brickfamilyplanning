import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { pathToFileURL } from 'node:url';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const modulePath = process.argv[2];
if (!modulePath) throw new Error('usage: test-phase8-identity-migration.mjs <identity-migration-module>');
const migration = await import(pathToFileURL(modulePath).href + `?v=${Date.now()}`);

async function p256Spki() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
  return Buffer.from(spki).toString('base64');
}

const keyA = await p256Spki();
const keyB = await p256Spki();
const unpaddedA = keyA.replace(/=+$/, '');
assert.notEqual(unpaddedA, keyA, 'fixture must exercise legacy unpadded Base64');

assert.equal(await migration.canonicalStoredP256Spki(keyA), keyA);
assert.equal(await migration.canonicalStoredP256Spki(unpaddedA), keyA);

const updates = await migration.planDeviceIdentityCanonicalization([
  { id: 'device-a', public_key_spki_b64: unpaddedA },
  { id: 'device-b', public_key_spki_b64: keyB }
]);
assert.deepEqual(updates, [{ id: 'device-a', from: unpaddedA, to: keyA }]);

assert.deepEqual(await migration.planDeviceIdentityCanonicalization([
  { id: 'device-a', public_key_spki_b64: keyA },
  { id: 'device-b', public_key_spki_b64: keyB }
]), []);

await assert.rejects(
  () => migration.planDeviceIdentityCanonicalization([
    { id: 'device-a', public_key_spki_b64: keyA },
    { id: 'device-b', public_key_spki_b64: unpaddedA }
  ]),
  /semantic duplicate device identity/
);
await assert.rejects(
  () => migration.planDeviceIdentityCanonicalization([{ id: 'bad', public_key_spki_b64: 'not a p256 key' }]),
  /missing or unreasonably sized|Base64|P-256/
);
await assert.rejects(
  () => migration.planDeviceIdentityCanonicalization([{ id: '', public_key_spki_b64: keyA }]),
  /missing id\/public key/
);

console.log('Phase 8 live identity migration canonicalizes legacy aliases and fails closed on ambiguous/invalid historical keys.');
