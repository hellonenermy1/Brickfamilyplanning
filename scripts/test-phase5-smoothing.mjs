import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const modulePath = process.argv[2];
if (!modulePath) throw new Error('usage: test-phase5-smoothing.mjs <phase5-smoothing-module>');
const smoothing = await import(pathToFileURL(modulePath).href + `?v=${Date.now()}`);

const start = { latitude:1.3000, longitude:103.8000, uncertaintyM:10, wallTimeMs:1_000_000 };
const end = { latitude:1.3100, longitude:103.8100, uncertaintyM:10, wallTimeMs:1_120_000 };

// Realtime chose a physically impossible branch. The later precise endpoint plus retained evidence
// should select an existing alternative; no new interpolated coordinate is invented.
const frames = [{
  wallTimeMs:1_060_000,
  originalRealtimeHypothesisId:'wrong-route',
  maxSpeedMps:20,
  hypotheses:[
    { id:'wrong-route', latitude:1.3400, longitude:103.8400, uncertaintyM:80, realtimeWeight:0.90, storedEvidenceWeight:0.80, source:'route-a' },
    { id:'right-route', latitude:1.3050, longitude:103.8050, uncertaintyM:90, realtimeWeight:0.70, storedEvidenceWeight:0.95, source:'route-b' }
  ]
}];
const original = JSON.stringify(frames);
let refined = smoothing.refineHypothesisInterval(start,end,frames);
assert.equal(refined.length,1);
assert.equal(refined[0].refinedHypothesisId,'right-route');
assert.equal(refined[0].originalRealtimeHypothesisId,'wrong-route');
assert.equal(refined[0].changedFromRealtime,true);
assert.equal(refined[0].latitude,1.3050);
assert.equal(refined[0].longitude,103.8050);
assert.equal(refined[0].uncertaintyM,90, 'smoothing must not invent tighter uncertainty than the stored hypothesis');
assert.equal(JSON.stringify(frames),original,'input/raw realtime candidates must remain immutable');

// Both alternatives can be reachable; stored evidence may rerank them without a geodesic/straight-
// line bonus. This is an ordering operation over existing hypotheses, not path interpolation.
refined = smoothing.refineHypothesisInterval(start,end,[{
  wallTimeMs:1_060_000,
  originalRealtimeHypothesisId:'a',
  maxSpeedMps:30,
  hypotheses:[
    { id:'a', latitude:1.3045, longitude:103.8040, uncertaintyM:120, realtimeWeight:0.80, storedEvidenceWeight:0.35, source:'a' },
    { id:'b', latitude:1.3040, longitude:103.8045, uncertaintyM:120, realtimeWeight:0.65, storedEvidenceWeight:0.95, source:'b' }
  ]
}]);
assert.equal(refined[0].refinedHypothesisId,'b');

// No compatible stored hypothesis means no refined coordinate. The smoother must not draw a line
// between endpoints and pretend that line is historical truth.
refined = smoothing.refineHypothesisInterval(start,end,[{
  wallTimeMs:1_060_000,
  originalRealtimeHypothesisId:'far',
  maxSpeedMps:2,
  hypotheses:[
    { id:'far', latitude:1.5000, longitude:104.0000, uncertaintyM:20, realtimeWeight:1, storedEvidenceWeight:1, source:'far' }
  ]
}]);
assert.equal(refined[0].refinedHypothesisId,null);
assert.equal(refined[0].latitude,null);
assert.equal(refined[0].longitude,null);
assert.equal(refined[0].reason,'no_compatible_hypothesis');

// A later endpoint on the opposite side must matter; a candidate reachable from the start but not
// the endpoint is rejected/suppressed.
const tightEnd = { latitude:1.3002, longitude:103.8002, uncertaintyM:5, wallTimeMs:1_020_000 };
refined = smoothing.refineHypothesisInterval(start,tightEnd,[{
  wallTimeMs:1_010_000,
  originalRealtimeHypothesisId:'near-start-far-end',
  maxSpeedMps:3,
  hypotheses:[
    { id:'near-start-far-end', latitude:1.3050, longitude:103.8050, uncertaintyM:10, realtimeWeight:1, storedEvidenceWeight:1, source:'bad' },
    { id:'compatible', latitude:1.3001, longitude:103.8001, uncertaintyM:15, realtimeWeight:0.6, storedEvidenceWeight:0.8, source:'good' }
  ]
}]);
assert.equal(refined[0].refinedHypothesisId,'compatible');

// Invalid chronology and oversized/bad frame data fail closed rather than emitting a plausible-
// looking refined history.
assert.throws(() => smoothing.refineHypothesisInterval(end,start,[]), /out of order/);
assert.throws(() => smoothing.refineHypothesisInterval(start,end,[{
  wallTimeMs:start.wallTimeMs,
  originalRealtimeHypothesisId:null,
  maxSpeedMps:10,
  hypotheses:[]
}]), /outside endpoint interval/);

console.log('PHASE5_BACKWARD_SMOOTHING_PASS');
