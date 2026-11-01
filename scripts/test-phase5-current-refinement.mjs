import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const modulePath = process.argv[2];
if (!modulePath) throw new Error('usage: test-phase5-current-refinement.mjs <module>');
const p5 = await import(pathToFileURL(modulePath).href + `?v=${Date.now()}`);

const now = 1_800_000_000_000;
const base = {
  epoch: 2, sequence: 88,
  lat: 1.3000, lon: 103.8000, uncertaintyM: 12,
  quality: 'precise', source: 'fused', receivedAt: now - 2_000, wallTimeMs: now - 2_500
};
const witness = {
  id:'witness:r1', kind:'witness', independenceGroup:'witness:w1',
  latitude:1.3001, longitude:103.8001, radiusM:75, observedWallMs:now-5_000, ageMs:5_000,
  sourceId:'w1', explanation:'authorised Brick witness area'
};
const ground = {
  id:'ground:g1:s1', kind:'ground_receiver', independenceGroup:'ground:g1',
  latitude:1.30005, longitude:103.80005, radiusM:60, observedWallMs:now-3_000, ageMs:3_000,
  sourceId:'g1', explanation:'authorised fixed Brick receiver area'
};

// External evidence is never allowed to manufacture PRECISE/ASSISTED. A fresh precise child fix
// stays the center, while the separate refinement honestly includes the broader external area.
let r = p5.refineCurrentState(base, [witness], now);
assert.ok(r);
assert.equal(r.latitude, base.lat);
assert.equal(r.longitude, base.lon);
assert.notEqual(r.quality, 'precise');
assert.notEqual(r.quality, 'assisted');
assert.ok(r.uncertaintyM >= witness.radiusM);
assert.equal(r.baseSequence, 88);
assert.equal(r.evidenceUsed.length, 2);

// One fresh fixed receiver can provide an anchored area when the child has no usable current fix.
r = p5.refineCurrentState(null, [ground], now);
assert.ok(r);
assert.equal(r.quality, 'anchored');
assert.equal(r.shape, 'place_area');
assert.equal(r.latitude, ground.latitude);
assert.equal(r.longitude, ground.longitude);
assert.ok(r.uncertaintyM >= ground.radiusM);

// One authorised witness is also an area, never an exact coordinate.
r = p5.refineCurrentState(null, [witness], now);
assert.ok(r);
assert.equal(r.quality, 'anchored');
assert.ok(r.uncertaintyM >= 75);

// Contradictory independent evidence widens / downgrades instead of selecting the prettier answer.
const farGround = { ...ground, id:'ground:g2:s2', independenceGroup:'ground:g2', sourceId:'g2', latitude:1.3300, longitude:103.8300 };
r = p5.refineCurrentState(base, [farGround], now);
assert.ok(r);
assert.equal(r.latitude, base.lat, 'fresh precise device fix remains the center');
assert.ok(r.conflicts.length > 0);
assert.equal(r.quality, 'coarse');
assert.ok(r.uncertaintyM > 1_000);

// Without external observations there is no separate refinement; the existing child state is used.
assert.equal(p5.refineCurrentState(base, [], now), null);

// Stale child state cannot quietly dominate a fresh receiver.
const stale = { ...base, quality:'last known', receivedAt:now - 20*60_000 };
r = p5.refineCurrentState(stale, [ground], now);
assert.ok(r);
assert.equal(r.quality, 'anchored');
assert.equal(r.evidenceUsed.length, 1);

console.log('PHASE5_CURRENT_REFINEMENT_PASS');
