const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PLACE_ID_RE = /^[A-Za-z0-9._:-]{1,96}$/;
const MAX_PLACES = 32;

export type LearnedPlaceConfig = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
};

type PlaceRow = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
};

function validPlace(row: PlaceRow): LearnedPlaceConfig | null {
  if (typeof row.id !== "string" || !PLACE_ID_RE.test(row.id)) return null;
  if (typeof row.name !== "string") return null;
  const name = row.name.trim();
  if (!name || name.length > 64) return null;
  if (!Number.isFinite(row.latitude) || row.latitude < -90 || row.latitude > 90) return null;
  if (!Number.isFinite(row.longitude) || row.longitude < -180 || row.longitude > 180) return null;
  if (!Number.isFinite(row.radius_m) || row.radius_m < 25 || row.radius_m > 5_000) return null;
  return { id: row.id, name, latitude: row.latitude, longitude: row.longitude, radiusM: row.radius_m };
}

/**
 * Parent-configured Brick Places/geofences define only the named region. Phase 4 Atlas remains the
 * learned environmental fingerprint model; Phase 5 will only call a place ANCHORED when strong
 * fresh Atlas evidence maps uniquely inside one of these regions.
 */
export async function listLearnedPlaceConfigs(db: D1Database, deviceId: string): Promise<LearnedPlaceConfig[]> {
  if (!DEVICE_ID_RE.test(deviceId)) throw new Error("invalid learned-place device id");
  const result = await db.prepare(
    "SELECT id,name,latitude,longitude,radius_m FROM geofences WHERE device_id=?1 AND enabled=1 ORDER BY created_at,id LIMIT ?2"
  ).bind(deviceId, MAX_PLACES).all<PlaceRow>();
  const out: LearnedPlaceConfig[] = [];
  const seen = new Set<string>();
  for (const row of result.results ?? []) {
    const place = validPlace(row);
    if (!place || seen.has(place.id)) continue;
    seen.add(place.id);
    out.push(place);
    if (out.length >= MAX_PLACES) break;
  }
  return out;
}

/**
 * Add Phase 5 place configuration to an already-authenticated health response. Query failure is
 * fail-open for tracking/config retention: the original response is returned unchanged, so Android
 * keeps its previous encrypted place cache rather than interpreting an infrastructure error as an
 * intentional empty-place configuration.
 */
export async function augmentHealthWithLearnedPlaces(
  response: Response,
  db: D1Database,
  deviceId: string
): Promise<Response> {
  if (!response.ok) return response;
  const contentType = (response.headers.get("Content-Type") ?? "").toLowerCase();
  if (!contentType.includes("application/json")) return response;

  let places: LearnedPlaceConfig[];
  try { places = await listLearnedPlaceConfigs(db, deviceId); }
  catch { return response; }

  let body: unknown;
  try { body = await response.json(); }
  catch { return response; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return response;

  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify({ ...(body as Record<string, unknown>), learnedPlaces: places }), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
