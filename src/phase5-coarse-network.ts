export type CoarseNetworkArea = {
  latitude: number;
  longitude: number;
  radiusM: 50_000;
  country: string | null;
  region: string | null;
  city: string | null;
};

function finiteCoordinate(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

/**
 * Cloudflare derives these fields from the incoming device IP. Brick deliberately discards any
 * implied precision and turns the result into a fixed 50 km last-resort area. This is not a place,
 * building, or calibrated accuracy estimate.
 */
export function coarseNetworkFromCf(cf: Record<string, unknown> | null | undefined): CoarseNetworkArea | null {
  if (!cf) return null;
  const latitude = finiteCoordinate(cf.latitude, -90, 90);
  const longitude = finiteCoordinate(cf.longitude, -180, 180);
  if (latitude === null || longitude === null) return null;
  return {
    latitude,
    longitude,
    radiusM: 50_000,
    country: typeof cf.country === "string" ? cf.country.slice(0, 2) : null,
    region: typeof cf.region === "string" ? cf.region.slice(0, 96) : null,
    city: typeof cf.city === "string" ? cf.city.slice(0, 96) : null
  };
}

export async function augmentHealthWithCoarseNetwork(
  response: Response,
  cf: Record<string, unknown> | null | undefined
): Promise<Response> {
  if (!response.ok) return response;
  const area = coarseNetworkFromCf(cf);
  if (!area) return response;
  const contentType = (response.headers.get("Content-Type") ?? "").toLowerCase();
  if (!contentType.includes("application/json")) return response;
  let body: unknown;
  try { body = await response.json(); } catch { return response; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return response;
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify({ ...(body as Record<string, unknown>), coarseNetwork: area }), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
