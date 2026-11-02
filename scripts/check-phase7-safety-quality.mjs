import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const outfile = "/tmp/brick-phase7-safety-quality.mjs";
await build({
  entryPoints: ["src/phase4.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  logLevel: "silent"
});
const { safetyPositionEligible, tripOverdueEligible, coordinateDwellState } = await import(pathToFileURL(outfile).href + `?v=${Date.now()}`);

const packet = (quality, uncertaintyM = 25) => ({
  trustedLatE7: 13_000_000,
  trustedLonE7: 1_038_000_000,
  uncertaintyCm: Math.round(uncertaintyM * 100),
  quality
});

assert.equal(safetyPositionEligible(packet(1)), true, "PRECISE must be eligible");
assert.equal(safetyPositionEligible(packet(2)), true, "ASSISTED must be eligible");
assert.equal(safetyPositionEligible(packet(3)), true, "ANCHORED must be eligible when uncertainty is bounded");
assert.equal(safetyPositionEligible(packet(4)), false, "ESTIMATED must not drive coordinate-dependent safety transitions");
assert.equal(safetyPositionEligible(packet(5)), false, "COARSE must not drive coordinate-dependent safety transitions");
assert.equal(safetyPositionEligible(packet(6)), false, "LAST_KNOWN must not drive coordinate-dependent safety transitions");
assert.equal(safetyPositionEligible(packet(7)), false, "UNKNOWN must not drive coordinate-dependent safety transitions");
assert.equal(safetyPositionEligible(packet(1, 251)), false, "uncertainty above 250m must be rejected");
assert.equal(safetyPositionEligible({ ...packet(1), trustedLatE7: null }), false, "missing coordinate must be rejected");

assert.deepEqual(
  coordinateDwellState(true, 1234, 2, 5678),
  { arrivalSince: 1234, arrivalCount: 2, stationarySince: 5678 },
  "continuous trusted positioning must retain a valid dwell candidate"
);
assert.deepEqual(
  coordinateDwellState(false, 1234, 2, 5678),
  { arrivalSince: null, arrivalCount: 0, stationarySince: null },
  "an untrusted positioning gap must break arrival and prolonged-stop dwell continuity"
);

const NOW = 2_000_000_000_000;
assert.equal(tripOverdueEligible(NOW - 600_001, null, NOW), true, "overdue must not depend on coordinate quality");
assert.equal(tripOverdueEligible(NOW - 600_001, NOW - 60_000, NOW), false, "overdue alert must retain its 30-minute repeat bound");
assert.equal(tripOverdueEligible(NOW + 60_000, null, NOW), false, "future ETA must not be overdue");
assert.equal(tripOverdueEligible(null, null, NOW), false, "trip without ETA must not create an overdue alert");

console.log("Phase 7 safety-position, dwell-continuity and time-alert fixtures: PASS");
