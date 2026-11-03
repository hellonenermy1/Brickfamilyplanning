import { PMTiles, type RangeResponse, type Source } from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

const MAP_KEY = "basemap/singapore.pmtiles";
const DETAIL_ZOOM = 15;
export const ROUTE_GRAPH_RADIUS_M = 650;
export const ROUTE_GRAPH_MAX_SEGMENTS = 256;

const MODE_WALKING = 1 << 2;
const MODE_RUNNING = 1 << 3;
const MODE_BICYCLE = 1 << 4;
const MODE_VEHICLE = 1 << 5;
const HUMAN = MODE_WALKING | MODE_RUNNING;
const ACTIVE = HUMAN | MODE_BICYCLE;
const ALL_MOVING = ACTIVE | MODE_VEHICLE;

type Coord = [number, number];
export type PrivateRouteGraphSegment = {
  id: string;
  a: Coord;
  b: Coord;
  allowedModeMask: number;
  kind: string | null;
  kindDetail: string | null;
};

type CachedSegment = PrivateRouteGraphSegment & { tileKey: string };

class R2PmtilesSource implements Source {
  constructor(private readonly bucket: R2Bucket, private readonly key = MAP_KEY) {}
  getKey() { return `brick-p3-r2:${this.key}`; }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const object = await this.bucket.get(this.key, { range: { offset, length } });
    if (!object || !("body" in object)) throw new Error("private PMTiles range unavailable");
    return { data: await object.arrayBuffer(), etag: object.etag };
  }
}

const archives = new WeakMap<object, PMTiles>();
const tileCache = new Map<string, Promise<CachedSegment[]>>();

function archiveFor(bucket: R2Bucket) {
  const key = bucket as unknown as object;
  let archive = archives.get(key);
  if (!archive) {
    archive = new PMTiles(new R2PmtilesSource(bucket));
    archives.set(key, archive);
  }
  return archive;
}

function clampLatitude(lat: number) {
  return Math.max(-85.05112878, Math.min(85.05112878, lat));
}

function tileFor(lon: number, lat: number, z: number) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = clampLatitude(lat) * Math.PI / 180;
  const y = Math.floor((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2 * n);
  return { z, x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

function validCoord(value: unknown): value is Coord {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number" &&
    Number.isFinite(value[0]) && Number.isFinite(value[1]);
}

function projectMeters(lon: number, lat: number, refLon: number, refLat: number) {
  return [(lon - refLon) * 111_320 * Math.cos(refLat * Math.PI / 180), (lat - refLat) * 110_540] as const;
}

function distanceToSegmentM(lon: number, lat: number, a: Coord, b: Coord) {
  const [ax, ay] = projectMeters(a[0], a[1], lon, lat);
  const [bx, by] = projectMeters(b[0], b[1], lon, lat);
  const dx = bx - ax; const dy = by - ay;
  const denom = dx * dx + dy * dy;
  const t = denom <= 1e-9 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / denom));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

function modeMaskForValue(value: string): number {
  if (["motorway", "motorway_link", "trunk", "trunk_link", "raceway", "drive_through"].includes(value)) return MODE_VEHICLE;
  if (["steps", "corridor", "sidewalk", "crossing", "pedestrian", "footway"].includes(value)) return HUMAN;
  if (value === "cycleway") return ACTIVE;
  if (["path", "bridleway", "track"].includes(value)) return ACTIVE;
  if ([
    "primary", "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link",
    "residential", "service", "unclassified", "road", "living_street", "driveway",
    "parking_aisle", "alley", "emergency_access"
  ].includes(value)) return ALL_MOVING;
  return 0;
}

/** Broad movement plausibility only; this is not a legal routing/access decision. */
export function modeMaskForRoad(kindRaw: unknown, detailRaw: unknown): number {
  const kind = typeof kindRaw === "string" ? kindRaw.toLowerCase() : "";
  const detail = typeof detailRaw === "string" ? detailRaw.toLowerCase() : "";

  // A recognized detail is more specific. An unfamiliar detail must not erase a recognized broad
  // road class, otherwise harmless schema/detail additions in the basemap silently create holes in
  // Brick's local route graph. Unknown broad classes remain excluded rather than invented.
  return (detail ? modeMaskForValue(detail) : 0) || (kind ? modeMaskForValue(kind) : 0);
}

function geometryLines(geometry: { type?: string; coordinates?: unknown }): Coord[][] {
  const line = (value: unknown): Coord[] => Array.isArray(value) ? value.filter(validCoord) : [];
  if (geometry.type === "LineString") return [line(geometry.coordinates)];
  if (geometry.type === "MultiLineString" && Array.isArray(geometry.coordinates)) return geometry.coordinates.map(line);
  return [];
}

function trimCache() {
  while (tileCache.size > 64) {
    const first = tileCache.keys().next().value as string | undefined;
    if (!first) break;
    tileCache.delete(first);
  }
}

async function decodeTile(archive: PMTiles, z: number, x: number, y: number): Promise<CachedSegment[]> {
  const tileKey = `${z}/${x}/${y}`;
  const cached = tileCache.get(tileKey);
  if (cached) return cached;
  const pending = (async () => {
    const response = await archive.getZxy(z, x, y);
    if (!response) return [];
    const tile = new VectorTile(new PbfReader(new Uint8Array(response.data)));
    const layer = tile.layers.roads;
    if (!layer) return [];
    const out: CachedSegment[] = [];
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      const properties = feature.properties as Record<string, unknown>;
      const kind = typeof properties.kind === "string" ? properties.kind : null;
      const kindDetail = typeof properties.kind_detail === "string" ? properties.kind_detail : null;
      const allowedModeMask = modeMaskForRoad(kind, kindDetail);
      if (!allowedModeMask) continue;
      const geo = feature.toGeoJSON(x, y, z) as unknown as { geometry?: { type?: string; coordinates?: unknown } };
      if (!geo.geometry) continue;
      const featureIdRaw = (feature as unknown as { id?: unknown }).id;
      const featureId = typeof featureIdRaw === "number" || typeof featureIdRaw === "string" ? String(featureIdRaw) : `f${i}`;
      const lines = geometryLines(geo.geometry);
      lines.forEach((coords, lineIndex) => {
        for (let j = 1; j < coords.length; j++) {
          const a = coords[j - 1]; const b = coords[j];
          if (a[0] === b[0] && a[1] === b[1]) continue;
          out.push({ id: `map:${tileKey}:${featureId}:${lineIndex}:${j - 1}`, a, b, allowedModeMask, kind, kindDetail, tileKey });
        }
      });
    }
    return out;
  })().catch(error => {
    tileCache.delete(tileKey);
    throw error;
  });
  tileCache.set(tileKey, pending);
  trimCache();
  return pending;
}

function canonicalSegmentKey(segment: PrivateRouteGraphSegment) {
  const q = (v: number) => Math.round(v * 1e6);
  const a = `${q(segment.a[0])},${q(segment.a[1])}`;
  const b = `${q(segment.b[0])},${q(segment.b[1])}`;
  return a <= b ? `${a}|${b}|${segment.allowedModeMask}` : `${b}|${a}|${segment.allowedModeMask}`;
}

export async function nearbyPrivateRouteGraph(
  bucket: R2Bucket,
  lon: number,
  lat: number,
  radiusM = ROUTE_GRAPH_RADIUS_M,
  maxSegments = ROUTE_GRAPH_MAX_SEGMENTS
): Promise<PrivateRouteGraphSegment[]> {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) return [];
  const radius = Math.max(100, Math.min(ROUTE_GRAPH_RADIUS_M, radiusM));
  const limit = Math.max(1, Math.min(ROUTE_GRAPH_MAX_SEGMENTS, Math.trunc(maxSegments)));
  const archive = archiveFor(bucket);
  const header = await archive.getHeader();
  const z = Math.min(DETAIL_ZOOM, header.maxZoom);
  const center = tileFor(lon, lat, z);
  const n = 2 ** z;
  const jobs: Promise<CachedSegment[]>[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = center.x + dx; const y = center.y + dy;
    if (x >= 0 && y >= 0 && x < n && y < n) jobs.push(decodeTile(archive, z, x, y));
  }

  const seen = new Set<string>();
  return (await Promise.all(jobs)).flat()
    .map(segment => ({ segment, distanceM: distanceToSegmentM(lon, lat, segment.a, segment.b) }))
    .filter(x => x.distanceM <= radius)
    .sort((a, b) => a.distanceM - b.distanceM)
    .filter(({ segment }) => {
      const key = canonicalSegmentKey(segment);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map(({ segment }) => ({ id: segment.id, a: segment.a, b: segment.b, allowedModeMask: segment.allowedModeMask, kind: segment.kind, kindDetail: segment.kindDetail }));
}
