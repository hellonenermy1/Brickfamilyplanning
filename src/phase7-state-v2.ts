import { augmentPhase7ParentStateResponse, buildPhase7ParentPresentation } from "./phase7-parent-presentation";
import { buildPhase7HealthPresentation } from "./phase7-health-presentation";

function token(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function reportsUnsupported(value: unknown) {
  const v = token(value);
  return Boolean(v && ["unsupported", "not_supported", "hardware_unsupported", "no_hardware"].some(x => v.includes(x)));
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function knownPositionQuality(value: unknown) {
  const q = token(value);
  return q === "precise" || q === "assisted" || q === "anchored" || q === "estimated" || q === "coarse" || q === "last_known";
}

/**
 * Phase 7 read-model hardening. Some Android providers report UNSUPPORTED in the health field even
 * when capability is absent. Treat that as neutral unsupported rather than unknown. This wrapper
 * also keeps the parent conservative when an unexpected position-quality token reaches the read
 * model: UNKNOWN never renders as an exact current point, and an unknown-quality refinement may not
 * replace base coordinates while borrowing the base quality label. Raw child/refinement evidence is
 * retained verbatim; only the parent presentation is hardened.
 */
export async function augmentPhase7ParentStateResponseV2(response: Response, now = Date.now()): Promise<Response> {
  const augmented = await augmentPhase7ParentStateResponse(response, now);
  if (!augmented.ok) return augmented;
  const type = (augmented.headers.get("Content-Type") ?? "").toLowerCase();
  if (!type.includes("application/json")) return augmented;

  let body: Record<string, unknown>;
  try { body = await augmented.json<Record<string, unknown>>(); }
  catch { return augmented; }

  const refined = record(body.refinedState);
  let presentation = record(body.presentation);

  // Never let a refinement with an unknown/unrecognized quality replace base coordinates while the
  // parent continues to display the base quality label. Rebuild from the unchanged base evidence.
  if (refined && !knownPositionQuality(refined.quality) && presentation?.source === "external_refinement") {
    const conservativeSnapshot = { ...body, refinedState: null };
    const rebuilt = buildPhase7ParentPresentation(
      conservativeSnapshot as Parameters<typeof buildPhase7ParentPresentation>[0],
      now
    );
    body.presentation = rebuilt;
    body.healthPresentation = buildPhase7HealthPresentation(conservativeSnapshot, rebuilt);
    presentation = body.presentation as unknown as Record<string, unknown>;
  }

  // The underlying presentation builder is intentionally permissive for forward compatibility.
  // At the served V2 boundary, however, an unknown quality cannot justify an exact current point.
  if (presentation?.positionClass === "unknown") {
    const geometry = record(presentation.geometry);
    presentation.geometry = {
      ...(geometry ?? {}),
      kind: "NONE",
      latitude: null,
      longitude: null,
      radiusM: null,
      corridorRadiusM: null,
      corridorCandidates: []
    };
    presentation.confidence = "very_low";
    presentation.explanation = "Brick does not currently have a trustworthy position to show.";
    body.presentation = presentation;
    body.healthPresentation = buildPhase7HealthPresentation(body, presentation);
  }

  const health = record(body.health);
  const hp = record(body.healthPresentation);
  const providers = Array.isArray(hp?.providers) ? hp!.providers as Array<Record<string, unknown>> : null;
  if (health && providers) {
    const fields: Record<string, [string, string]> = {
      wifi: ["atlasWifiProviderCapability", "atlasWifiProviderHealth"],
      wifi_rtt: ["atlasRttProviderCapability", "atlasRttProviderHealth"],
      ble: ["atlasBleProviderCapability", "atlasBleProviderHealth"],
      cellular: ["atlasCellularProviderCapability", "atlasCellularProviderHealth"],
      lan: ["atlasLanProviderCapability", "atlasLanProviderHealth"],
      gnss: ["atlasGnssProviderCapability", "atlasGnssProviderHealth"],
      network: ["atlasNetworkProviderCapability", "atlasNetworkProviderHealth"],
      device_context: ["atlasDeviceContextProviderCapability", "atlasDeviceContextProviderHealth"]
    };
    hp!.providers = providers.map(provider => {
      const id = typeof provider.id === "string" ? provider.id : "";
      const pair = fields[id];
      if (!pair || provider.status !== "unknown") return provider;
      if (!reportsUnsupported(health[pair[0]]) && !reportsUnsupported(health[pair[1]])) return provider;
      const label = typeof provider.label === "string" ? provider.label : id.replaceAll("_", " ");
      return {
        ...provider,
        status: "unsupported",
        explanation: `${label} is not supported on this phone; Brick treats that as neutral.`
      };
    });
  }

  const headers = new Headers(augmented.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), {
    status: augmented.status,
    statusText: augmented.statusText,
    headers
  });
}
