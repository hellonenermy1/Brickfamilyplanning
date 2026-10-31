import { PMTiles, type RangeResponse, type Source } from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import type { LivePacket } from "./protocol";

const MAP_KEY = "basemap/singapore.pmtiles";
const DETAIL_ZOOM = 15;
const ROUTE_SOURCE_CODE = 4;

type Coord = [number, number];
type Segment = { a: Coord; b: Coord };
type Nearest = { lon: number; lat: number; distanceM: number };

class R2PmtilesSource implements Source {
  constructor(private readonly bucket: R2Bucket, private readonly key = MAP_KEY) {}
  getKey() { return `brick-r2:${this.key}`; }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const object = await this.bucket.get(this.key, { range: { offset, length } });
    if (!object || !("body" in object)) throw new Error("private PMTiles range unavailable");
    return { data: await object.arrayBuffer(), etag: object.etag };
  }
}

const archives = new WeakMap<object, PMTiles>();
const roadCache = new Map<string, Promise<Segment[]>>();

function archiveFor(bucket: R2Bucket) {
  const key = bucket as unknown as object;
  let archive = archives.get(key);
  if (!archive) {
    archive = new PMTiles(new R2PmtilesSource(bucket));
    archives.set(key, archive);
  }
  return archive;
}

function clampLatitude(lat: number) { return Math.max(-85.05112878, Math.min(85.05112878, lat)); }
function tileFor(lon: number, lat: number, z: number) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = clampLatitude(lat) * Math.PI / 180;
  const y = Math.floor((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2 * n);
  return { z, x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}
function projectMeters(lon: number, lat: number, refLon: number, refLat: number) {
  return [(lon - refLon) * 111_320 * Math.cos(refLat * Math.PI / 180), (lat - refLat) * 110_540] as const;
}
function isCoord(value: unknown): value is Coord {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number";
}
function segmentsFromGeometry(geometry: { type?: string; coordinates?: unknown }): Segment[] {
  const out: Segment[] = [];
  const addLine = (value: unknown) => {
    if (!Array.isArray(value)) return;
    const coords = value.filter(isCoord);
    for (let i = 1; i < coords.length; i++) out.push({ a: coords[i - 1], b: coords[i] });
  };
  if (geometry.type === "LineString") addLine(geometry.coordinates);
  else if (geometry.type === "MultiLineString" && Array.isArray(geometry.coordinates)) for (const line of geometry.coordinates) addLine(line);
  return out;
}

export function nearestRoutePoint(lon: number, lat: number, segments: Segment[]): Nearest | null {
  let best: Nearest | null = null;
  for (const segment of segments) {
    const [ax, ay] = projectMeters(segment.a[0], segment.a[1], lon, lat);
    const [bx, by] = projectMeters(segment.b[0], segment.b[1], lon, lat);
    const dx = bx - ax, dy = by - ay;
    const denom = dx * dx + dy * dy;
    const t = denom <= 1e-9 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / denom));
    const x = ax + t * dx, y = ay + t * dy;
    const distanceM = Math.hypot(x, y);
    if (!best || distanceM < best.distanceM) {
      best = {
        lon: segment.a[0] + (segment.b[0] - segment.a[0]) * t,
        lat: segment.a[1] + (segment.b[1] - segment.a[1]) * t,
        distanceM
      };
    }
  }
  return best;
}

function trimCache() {
  while (roadCache.size > 64) {
    const first = roadCache.keys().next().value as string | undefined;
    if (!first) break;
    roadCache.delete(first);
  }
}

async function decodeRoadSegments(archive: PMTiles, z: number, x: number, y: number): Promise<Segment[]> {
  const key = `${z}/${x}/${y}`;
  const cached = roadCache.get(key);
  if (cached) return cached;
  const pending = (async () => {
    const response = await archive.getZxy(z, x, y);
    if (!response) return [];
    const tile = new VectorTile(new PbfReader(new Uint8Array(response.data)));
    const layer = tile.layers.roads;
    if (!layer) return [];
    const out: Segment[] = [];
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      const geo = feature.toGeoJSON(x, y, z) as unknown as { geometry?: { type?: string; coordinates?: unknown } };
      if (geo.geometry) out.push(...segmentsFromGeometry(geo.geometry));
    }
    return out;
  })().catch(error => { roadCache.delete(key); throw error; });
  roadCache.set(key, pending);
  trimCache();
  return pending;
}

async function nearbyRoads(bucket: R2Bucket, lon: number, lat: number) {
  const archive = archiveFor(bucket);
  const header = await archive.getHeader();
  const z = Math.min(DETAIL_ZOOM, header.maxZoom);
  const center = tileFor(lon, lat, z), n = 2 ** z;
  const jobs: Promise<Segment[]>[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = center.x + dx, y = center.y + dy;
    if (x >= 0 && y >= 0 && x < n && y < n) jobs.push(decodeRoadSegments(archive, z, x, y));
  }
  return (await Promise.all(jobs)).flat();
}

export async function constrainFallbackToRoute(packet: LivePacket, maps: R2Bucket): Promise<LivePacket> {
  // Source 2 is the child inertial estimate. Fused/last-known fixes are never map-snapped here.
  if (packet.version !== 2 || packet.positionSource !== 2 || packet.quality !== 4) return packet;
  if (packet.trustedLatE7 === null || packet.trustedLonE7 === null) return packet;
  if (![2, 3, 4, 5].includes(packet.activity)) return packet; // walking/running/bicycle/vehicle only
  const lat = packet.trustedLatE7 / 1e7, lon = packet.trustedLonE7 / 1e7;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return packet;

  try {
    const segments = await nearbyRoads(maps, lon, lat);
    const nearest = nearestRoutePoint(lon, lat, segments);
    if (!nearest) return packet;
    const maxByMode = packet.activity === 5 || packet.activity === 4 ? 60 : 35;
    const thresholdM = Math.min(maxByMode, Math.max(12, packet.uncertaintyM * 0.4));
    if (nearest.distanceM > thresholdM) return packet;
    return {
      ...packet,
      trustedLatE7: Math.round(nearest.lat * 1e7),
      trustedLonE7: Math.round(nearest.lon * 1e7),
      uncertaintyM: Math.max(packet.uncertaintyM, Math.round(nearest.distanceM + 8)),
      positionSource: ROUTE_SOURCE_CODE
    };
  } catch {
    // Private map absence/corruption must never invent a route or block location delivery.
    return packet;
  }
}
