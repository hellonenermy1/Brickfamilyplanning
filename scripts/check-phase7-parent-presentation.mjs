import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const outfile = "/tmp/brick-phase7-parent-presentation.mjs";
await build({
  entryPoints: ["src/phase7-parent-presentation.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  logLevel: "silent"
});
const { buildPhase7ParentPresentation } = await import(pathToFileURL(outfile).href + `?v=${Date.now()}`);

const NOW = 2_000_000_000_000;
const baseHealth = { trackingIntervalMs: 5_000 };

function present(snapshot) {
  return buildPhase7ParentPresentation({ health: baseHealth, ...snapshot }, NOW);
}

{
  const p = present({
    latest: { lat: 1.30, lon: 103.80, uncertaintyM: 8, quality: "precise", source: "fused", receivedAt: NOW - 4_000 }
  });
  assert.equal(p.positionClass, "precise");
  assert.equal(p.geometry.kind, "CIRCLE");
  assert.equal(p.confidence, "high");
  assert.equal(p.freshness, "fresh");
  assert.equal(p.source, "fused");
  assert.equal(p.hasConflict, false);
}

{
  const p = present({
    latest: {
      lat: 1.31,
      lon: 103.81,
      uncertaintyM: 170,
      quality: "estimated",
      source: "fusion",
      receivedAt: NOW - 12_000,
      routeCorridor: {
        radiusM: 140,
        candidates: [
          { a: [103.809, 1.309], b: [103.812, 1.312], score: 0.92 },
          { a: [103.808, 1.311], b: [103.813, 1.313], score: 0.77 }
        ]
      }
    }
  });
  assert.equal(p.positionClass, "estimated");
  assert.equal(p.geometry.kind, "CORRIDOR");
  assert.equal(p.geometry.corridorCandidates.length, 2);
  assert.equal(p.confidence, "low");
  assert.ok(p.evidence.some(e => e.kind === "route"));
}

{
  const p = present({
    latest: { lat: 1.32, lon: 103.82, uncertaintyM: 600, quality: "estimated", source: "fusion", receivedAt: NOW - 200_000 },
    refinedState: {
      latitude: 1.3205,
      longitude: 103.8204,
      uncertaintyM: 90,
      quality: "anchored",
      shape: "place_area",
      computedAt: NOW,
      evidenceUsed: [
        { id: "receiver-home", kind: "ground_receiver", ageMs: 8_000, radiusM: 80, explanation: "Fresh fixed receiver area." }
      ],
      conflicts: []
    }
  });
  assert.equal(p.positionClass, "anchored");
  assert.equal(p.geometry.kind, "ANCHORED_AREA");
  assert.equal(p.source, "external_refinement");
  assert.equal(p.evidenceAgeMs, 8_000);
  assert.equal(p.freshness, "fresh");
  assert.equal(p.confidence, "medium");
}

{
  // Regression: recomputing a refined state now must not make old evidence look fresh.
  const p = present({
    refinedState: {
      latitude: 1.33,
      longitude: 103.83,
      uncertaintyM: 350,
      quality: "estimated",
      shape: "possible_area",
      computedAt: NOW,
      evidenceUsed: [
        { id: "old-witness", kind: "witness", ageMs: 180_000, radiusM: 300, explanation: "Old witness region." }
      ],
      conflicts: []
    }
  });
  assert.equal(p.evidenceAgeMs, 180_000);
  assert.equal(p.freshness, "stale");
}

{
  const p = present({
    latest: { lat: 1.34, lon: 103.84, uncertaintyM: 800, quality: "coarse", source: "fusion", receivedAt: NOW - 40_000 },
    refinedState: {
      latitude: 1.341,
      longitude: 103.841,
      uncertaintyM: 2_800,
      quality: "coarse",
      shape: "possible_area",
      computedAt: NOW,
      evidenceUsed: [
        { id: "device-current", kind: "device", ageMs: 40_000, radiusM: 800, explanation: "Coarse phone state." },
        { id: "receiver-a", kind: "ground_receiver", ageMs: 10_000, radiusM: 120, explanation: "Receiver A." }
      ],
      conflicts: [
        { a: "device-current", b: "receiver-a", separationM: 2_500, allowedOverlapM: 945 }
      ]
    }
  });
  assert.equal(p.hasConflict, true);
  assert.equal(p.geometry.kind, "AREA");
  assert.match(p.explanation, /widened the uncertainty/i);
}

{
  const p = present({
    latest: { lat: 1.35, lon: 103.85, uncertaintyM: 450, quality: "last_known", source: "last_known", receivedAt: NOW - 300_000 },
    derived: { deviceStatus: "offline", positionStatus: "stale" }
  });
  assert.equal(p.positionClass, "last_known");
  assert.equal(p.geometry.kind, "LAST_KNOWN_AREA");
  assert.equal(p.confidence, "very_low");
  assert.equal(p.freshness, "stale");
  assert.equal(p.deviceOffline, true);
  assert.match(p.explanation, /historical/i);
}

{
  const p = present({ latest: null, refinedState: null });
  assert.equal(p.positionClass, "unknown");
  assert.equal(p.geometry.kind, "NONE");
  assert.equal(p.freshness, "unknown");
  assert.equal(p.confidence, "very_low");
}

console.log("Phase 7 parent presentation contract: PASS");
