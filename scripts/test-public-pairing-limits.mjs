import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const [modulePath] = process.argv.slice(2);
if (!modulePath) throw new Error('usage: test-public-pairing-limits.mjs <device-json-security-module>');
const security = await import(pathToFileURL(modulePath).href + `?v=${Date.now()}`);

// Deliberately omit Content-Length. The actual received body exceeds Brick's 4 KiB public pairing
// limit and must be rejected before JSON parsing or any public-key work.
const oversized = new Request('https://brick.example/api/pair/complete', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ token: 'x'.repeat(32), publicKeySpkiB64: 'A'.repeat(5000) })
});
const oversizedResponse = await security.validatePairingPublicKey(oversized);
assert.ok(oversizedResponse instanceof Response);
assert.equal(oversizedResponse.status, 400);
assert.match((await oversizedResponse.json()).error, /too large/);

const empty = new Request('https://brick.example/api/pair/complete', { method: 'POST', body: '' });
const emptyResponse = await security.validatePairingPublicKey(empty);
assert.ok(emptyResponse instanceof Response);
assert.equal(emptyResponse.status, 400);

console.log('Phase 6 public pairing actual-byte limit OK');
