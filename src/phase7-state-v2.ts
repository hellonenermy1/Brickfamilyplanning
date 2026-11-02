import { augmentPhase7ParentStateResponse } from "./phase7-parent-presentation";

function token(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function reportsUnsupported(value: unknown) {
  const v = token(value);
  return Boolean(v && ["unsupported", "not_supported", "hardware_unsupported", "no_hardware"].some(x => v.includes(x)));
}

/**
 * Phase 7 read-model hardening. Some Android providers report UNSUPPORTED in the health field even
 * when capability is absent. Treat that as neutral unsupported rather than unknown. This wrapper
 * changes only the parent presentation; raw child health evidence is retained verbatim.
 */
export async function augmentPhase7ParentStateResponseV2(response: Response, now = Date.now()): Promise<Response> {
  const augmented = await augmentPhase7ParentStateResponse(response, now);
  if (!augmented.ok) return augmented;
  const type = (augmented.headers.get("Content-Type") ?? "").toLowerCase();
  if (!type.includes("application/json")) return augmented;

  let body: Record<string, unknown>;
  try { body = await augmented.json<Record<string, unknown>>(); }
  catch { return augmented; }

  const health = body.health && typeof body.health === "object" && !Array.isArray(body.health)
    ? body.health as Record<string, unknown> : null;
  const hp = body.healthPresentation && typeof body.healthPresentation === "object" && !Array.isArray(body.healthPresentation)
    ? body.healthPresentation as Record<string, unknown> : null;
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
