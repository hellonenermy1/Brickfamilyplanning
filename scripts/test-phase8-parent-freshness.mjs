import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const [truthPath, parentPath] = process.argv.slice(2);
if (!truthPath || !parentPath) {
  throw new Error('usage: test-phase8-parent-freshness.mjs <phase8-parent-truth> <parent-v8>');
}
const truth = await import(pathToFileURL(truthPath).href + `?truth=${Date.now()}`);
const parent = await import(pathToFileURL(parentPath).href + `?parent=${Date.now()}`);
const NOW = 2_000_000_000_000;

function response(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

async function augment(body) {
  const r = await truth.augmentPhase8ParentTruth(response(body), NOW);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('X-Brick-Parent-Truth'), 'phase8-v1');
  return r.json();
}

function baseLocation(overrides = {}) {
  return {
    epoch: 7,
    sequence: 55,
    lat: 1.3521,
    lon: 103.8198,
    uncertaintyM: 12,
    quality: 'precise',
    source: 'fused',
    wallTimeMs: NOW - 2_000,
    receivedAt: NOW - 1_000,
    speedKph: 14,
    activity: 'bicycle',
    ...overrides
  };
}

function phonePresentation(base, overrides = {}) {
  return {
    protocol: 1,
    basis: {
      epoch: base.epoch,
      sequence: base.sequence,
      receivedAt: base.receivedAt,
      wallTimeMs: base.wallTimeMs
    },
    positionClass: 'precise',
    geometry: {
      kind: 'CIRCLE', latitude: base.lat, longitude: base.lon, radiusM: base.uncertaintyM,
      corridorRadiusM: null, corridorCandidates: []
    },
    confidence: 'high',
    freshness: 'fresh',
    evidenceAgeMs: 1_000,
    source: 'fused',
    headline: 'Precise position',
    explanation: 'The phone currently has a trustworthy location fix.',
    evidence: [{ id: 'device-current', kind: 'device', label: 'Phone', explanation: 'Phone fix.', ageMs: 1_000, radiusM: 12 }],
    conflicts: [], hasConflict: false, deviceOffline: false,
    ...overrides
  };
}

// A two-hour-old offline fix arriving two seconds ago must remain stale. Server receipt time can
// never wash away the device capture time.
{
  const latest = baseLocation({ wallTimeMs: NOW - 2 * 60 * 60_000, receivedAt: NOW - 2_000 });
  const out = await augment({
    latest,
    state: latest,
    health: { receivedAt: NOW - 1_000, trackingIntervalMs: 5_000, operationalStatus: 'healthy' },
    presentation: phonePresentation(latest)
  });
  assert.equal(out.presentation.freshness, 'stale');
  assert.equal(out.presentation.evidenceAgeMs, 2 * 60 * 60_000);
  assert.equal(out.presentation.evidence[0].ageMs, 2 * 60 * 60_000);
  assert.equal(out.derived.positionStatus, 'stale');
  assert.equal(out.derived.deviceStatus, 'healthy');
  assert.equal(out.derived.captureAgeMs, 2 * 60 * 60_000);
  assert.equal(out.derived.eventAgeMs, 2 * 60 * 60_000);
  assert.equal(out.derived.receiveAgeMs, 2_000);
}

// Truly recent capture + recent receipt stays fresh.
{
  const latest = baseLocation();
  const out = await augment({
    latest,
    health: { receivedAt: NOW - 1_000, trackingIntervalMs: 5_000, operationalStatus: 'healthy' },
    presentation: phonePresentation(latest)
  });
  assert.equal(out.presentation.freshness, 'fresh');
  assert.equal(out.derived.positionStatus, 'fresh');
  assert.equal(out.derived.deviceStatus, 'healthy');
  assert.equal(out.derived.captureAgeMs, 2_000);
}

// A fresh coordinate with a dead heartbeat is historical until the phone proves it is online again.
{
  const latest = baseLocation();
  const out = await augment({
    latest,
    health: { receivedAt: NOW - 120_000, trackingIntervalMs: 5_000, operationalStatus: 'healthy' },
    presentation: phonePresentation(latest)
  });
  assert.equal(out.derived.deviceStatus, 'offline');
  assert.equal(out.derived.positionStatus, 'stale');
  assert.equal(out.presentation.deviceOffline, true);
  assert.match(out.presentation.explanation, /offline|historical/i);
}

// Independent current evidence is allowed to improve an old phone fix. Phase 8 must not force an
// external refinement stale merely because the underlying phone packet is old.
{
  const latest = baseLocation({ wallTimeMs: NOW - 2 * 60 * 60_000, receivedAt: NOW - 2_000, quality: 'coarse' });
  const refined = phonePresentation(latest, {
    positionClass: 'anchored',
    geometry: { kind: 'ANCHORED_AREA', latitude: 1.3522, longitude: 103.8199, radiusM: 70, corridorRadiusM: null, corridorCandidates: [] },
    confidence: 'medium',
    freshness: 'fresh',
    evidenceAgeMs: 3_000,
    source: 'external_refinement',
    evidence: [{ id: 'receiver-home', kind: 'ground_receiver', label: 'Fixed Brick receiver', explanation: 'Fresh receiver.', ageMs: 3_000, radiusM: 70 }]
  });
  const out = await augment({
    latest,
    health: { receivedAt: NOW - 1_000, trackingIntervalMs: 5_000, operationalStatus: 'healthy' },
    presentation: refined
  });
  assert.equal(out.presentation.source, 'external_refinement');
  assert.equal(out.presentation.freshness, 'fresh');
  assert.equal(out.presentation.evidenceAgeMs, 3_000);
  assert.equal(out.derived.positionStatus, 'fresh');
}

// The production dashboard must expose freshness/source, distinguish capture time from receipt time,
// and suppress stale speed instead of presenting an old speed as current.
{
  const html = parent.parentV8Html();
  for (const required of [
    '>Freshness<',
    '>Source<',
    'Captured ',
    'cloud received ',
    "text('#speed','—')",
    'Historical position',
    'This is not a live location.',
    'Position is aging and may no longer describe the phone’s current location.'
  ]) assert.ok(html.includes(required), `production parent truth UI missing: ${required}`);
  assert.ok(!/DEVELOPMENT BETA|PHASE 7 BETA/.test(html), 'production Phase 8 parent must not promote development portal labels');
}

console.log('Phase 8 parent freshness truth OK: event-time dominates delayed receipt, offline is historical, independent refinement remains usable');
