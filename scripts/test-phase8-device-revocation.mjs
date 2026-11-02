import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const [cryptoPath] = process.argv.slice(2);
if (!cryptoPath) throw new Error('usage: test-phase8-device-revocation.mjs <bundled-crypto-module>');
const brickCrypto = await import(pathToFileURL(cryptoPath).href + `?v=${Date.now()}`);

// The same P-256 SPKI must collapse to one stored text representation even if padding is omitted.
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
const canonical = Buffer.from(spki).toString('base64');
const unpadded = canonical.replace(/=+$/, '');
assert.equal(await brickCrypto.canonicalDevicePublicKey(canonical), canonical);
assert.equal(await brickCrypto.canonicalDevicePublicKey(unpadded), canonical);
assert.equal(await brickCrypto.validDevicePublicKey(unpadded), true);
assert.equal(await brickCrypto.canonicalDevicePublicKey('not-base64!'), null);

const worker = fs.readFileSync('src/worker-v5b.ts', 'utf8');
const schema = fs.readFileSync('schema/015_phase8_device_identity.sql', 'utf8');
const setup = fs.readFileSync('scripts/setup-v1-phase6-development-cardfree-v2.mjs', 'utf8');
const jsonSecurity = fs.readFileSync('src/device-json-security.ts', 'utf8');
const location = fs.readFileSync('src/location-ingest-v6.ts', 'utf8');
const crash = fs.readFileSync('src/phase5c.ts', 'utf8');
const worker6 = fs.readFileSync('src/worker-v6.ts', 'utf8');

assert.match(worker, /canonicalDevicePublicKey/);
assert.match(worker, /SELECT id,revoked_at FROM devices WHERE public_key_spki_b64=\?1 LIMIT 1/);
assert.doesNotMatch(worker, /SELECT id,revoked_at FROM devices WHERE public_key_spki_b64=\?1 AND revoked_at IS NULL/);
assert.match(worker, /device identity already registered/);
assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_public_key_spki_unique/);
assert.match(schema, /ON devices\(public_key_spki_b64\)/);
assert.match(setup, /schema\/015_phase8_device_identity\.sql/);

// Every child upload family must reject revoked device rows before accepting signed data.
assert.match(jsonSecurity, /SELECT public_key_spki_b64,revoked_at FROM devices WHERE id=\?1/);
assert.match(jsonSecurity, /if \(!row \|\| row\.revoked_at\) return jsonError\("device unauthorized", 401\)/);
assert.match(location, /row && row\.revoked_at === null \? row : null/);
assert.match(crash, /row && row\.revoked_at === null \? row : null/);

// Parent history stays readable after revocation while mutations are routed read-only.
const revokedGuard = worker6.indexOf('if (life.revoked_at !== null) return archivedRead(req, env, deviceId, suffix);');
const historyRead = worker6.indexOf('if (suffix === "/history" && req.method === "GET")');
const locationMutation = worker6.indexOf('if (suffix === "/location-control" && req.method === "POST")');
assert.ok(revokedGuard >= 0 && historyRead >= 0 && locationMutation > revokedGuard);
assert.match(worker6, /device is revoked and read-only/);

// A revoked row is the permanent tombstone; no cleanup path may delete device identity rows.
for (const dir of ['src', 'scripts']) {
  for (const name of fs.readdirSync(dir, { recursive: true })) {
    const path = `${dir}/${name}`;
    if (!fs.existsSync(path) || !fs.statSync(path).isFile()) continue;
    const text = fs.readFileSync(path, 'utf8');
    assert.doesNotMatch(text, /DELETE\s+FROM\s+devices\b/i, `device identity deletion forbidden: ${path}`);
  }
}

console.log('Phase 8 revoked-device upload/re-enrollment identity contract OK');
