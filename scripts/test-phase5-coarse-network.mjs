import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const modulePath = process.argv[2];
if (!modulePath) throw new Error('compiled coarse-network module path required');
const { coarseNetworkFromCf, augmentHealthWithCoarseNetwork } = await import(pathToFileURL(modulePath).href);

const area = coarseNetworkFromCf({
  latitude: '1.3521',
  longitude: '103.8198',
  country: 'SG',
  region: 'Singapore',
  city: 'Singapore'
});
assert.ok(area);
assert.equal(area.latitude, 1.3521);
assert.equal(area.longitude, 103.8198);
assert.equal(area.radiusM, 50_000, 'IP evidence must retain the fixed 50 km honesty floor');
assert.equal(area.country, 'SG');

assert.equal(coarseNetworkFromCf(undefined), null);
assert.equal(coarseNetworkFromCf({ latitude: 'NaN', longitude: '103.8' }), null);
assert.equal(coarseNetworkFromCf({ latitude: '91', longitude: '103.8' }), null);
assert.equal(coarseNetworkFromCf({ latitude: '1.3', longitude: '181' }), null);

const original = new Response(JSON.stringify({ ok: true }), {
  status: 200,
  headers: { 'content-type': 'application/json' }
});
const augmented = await augmentHealthWithCoarseNetwork(original, { latitude: '1.30', longitude: '103.80' });
const body = await augmented.json();
assert.equal(body.ok, true);
assert.equal(body.coarseNetwork.radiusM, 50_000);
assert.equal(body.coarseNetwork.latitude, 1.30);
assert.equal(body.coarseNetwork.longitude, 103.80);
assert.equal(augmented.headers.get('cache-control'), 'no-store');

const unavailable = new Response(JSON.stringify({ ok: true }), {
  status: 200,
  headers: { 'content-type': 'application/json' }
});
const unchanged = await augmentHealthWithCoarseNetwork(unavailable, { country: 'SG' });
assert.deepEqual(await unchanged.json(), { ok: true });

console.log('PHASE5_COARSE_NETWORK_PASS');
