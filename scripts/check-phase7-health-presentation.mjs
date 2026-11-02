import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const outfile = "/tmp/brick-phase7-health-presentation.mjs";
await build({
  entryPoints: ["src/phase7-health-presentation.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  logLevel: "silent"
});
const { buildPhase7HealthPresentation } = await import(pathToFileURL(outfile).href + `?v=${Date.now()}`);

{
  const h = buildPhase7HealthPresentation({
    derived: { deviceStatus: "healthy" },
    health: {
      healthSequence: 44,
      receivedAt: 2_000_000_000_000,
      operationalStatus: "healthy",
      operationalReason: "ok",
      serviceActive: true,
      journalWriteHealthy: true,
      safetyOutboxWriteHealthy: true,
      network: "wifi",
      networkValidated: true,
      backgroundRestricted: false,
      batteryOptimizationExempt: true,
      locationEnabled: true,
      locationSubscribed: true,
      fineLocationPermission: true,
      backgroundLocationPermission: true,
      locationAgeMs: 4_000,
      gnssUsedInFix: 8,
      gnssTotal: 15,
      atlasWifiProviderCapability: "supported",
      atlasWifiProviderHealth: "healthy",
      atlasRttProviderCapability: "unsupported",
      atlasRttProviderHealth: "unsupported"
    }
  }, {
    positionClass: "precise",
    confidence: "high",
    freshness: "fresh",
    geometry: { kind: "CIRCLE" }
  });
  assert.equal(h.device.status, "healthy");
  assert.equal(h.position.status, "fresh");
  assert.equal(h.providers.find(x => x.id === "wifi")?.status, "active");
  assert.equal(h.providers.find(x => x.id === "wifi_rtt")?.status, "unsupported");
  assert.equal(h.basis.healthSequence, 44);
}

{
  const h = buildPhase7HealthPresentation({
    derived: { deviceStatus: "healthy" },
    health: {
      operationalStatus: "healthy",
      serviceActive: true,
      journalWriteHealthy: true,
      safetyOutboxWriteHealthy: true,
      network: "wifi",
      locationEnabled: true,
      locationSubscribed: true,
      fineLocationPermission: true,
      backgroundLocationPermission: true,
      locationAgeMs: 180_000
    }
  }, {
    positionClass: "estimated",
    confidence: "low",
    freshness: "stale",
    geometry: { kind: "AREA" }
  });
  assert.equal(h.device.status, "healthy", "healthy phone must remain healthy when only position quality degrades");
  assert.equal(h.position.status, "degraded");
}

{
  const h = buildPhase7HealthPresentation({
    derived: { deviceStatus: "degraded" },
    health: {
      operationalStatus: "degraded",
      operationalReason: "location_disabled",
      serviceActive: true,
      journalWriteHealthy: true,
      safetyOutboxWriteHealthy: true,
      network: "wifi",
      locationEnabled: false,
      locationSubscribed: false,
      fineLocationPermission: true
    }
  }, {
    positionClass: "unknown",
    confidence: "very_low",
    freshness: "unknown",
    geometry: { kind: "NONE" }
  });
  assert.equal(h.position.status, "unavailable");
  assert.match(h.position.reason, /Location is off/i);
}

console.log("Phase 7 health presentation fixtures: PASS");
