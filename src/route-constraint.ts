import { PMTiles, SharedPromiseCache, Compression, type RangeResponse, type Source } from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import type { LivePacket, RouteCorridorCandidate } from "./protocol";

const MAP_KEY = "basemap/singapore.pmtiles";
const DETAIL_ZOOM = 15;
const ROUTE_SOURCE_CODE = 5;
const MAX_CORRIDORS = 3;
export const ROUTE_LOOKUP_BUDGET_MS = 250;
const MAX_RANGE_BYTES = 2 * 1024 * 1024;
const MAX_FEATURES = 4096;
const MAX_SEGMENTS = 16384;

type Coord = [number, number];
export type RouteSegment = { a: Coord; b: Coord };
type SegmentMatch = {
  segment: RouteSegment;
  lon: number;
  lat: number;
  distanceM: number;
  headingDeltaDeg: number | null;
  score: number;
};

class R2PmtilesSource implements Source {
  constructor(private readonly bucket: R2Bucket, private readonly alive: () => boolean, private readonly key = MAP_KEY) {}
  getKey() { return `brick-r2:${this.key}`; }
  async getBytes(offset: number, length: number, signal?: AbortSignal, expectedEtag?: string): Promise<RangeResponse> {
    if (!this.alive() || signal?.aborted || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 1 || length > MAX_RANGE_BYTES) throw new Error('route range refused');
    const object = await this.bucket.get(this.key, { range: { offset, length } });
    if (!object || !("body" in object)) throw new Error("private PMTiles range unavailable");
    if (!this.alive() || signal?.aborted || (expectedEtag !== undefined && object.etag !== expectedEtag)) throw new Error('route generation changed');
    const data = await object.arrayBuffer();
    if (!this.alive() || signal?.aborted || data.byteLength > length || (data.byteLength !== length && !(offset === 0 && length === 16384 && data.byteLength >= 127))) throw new Error('route range invalid');
    return { data, etag: object.etag };
  }
}

type ArchiveState = { archive: PMTiles; roads: Map<string, Promise<RouteSegment[]>>; abandoned: boolean };
const archives = new WeakMap<object, ArchiveState>();

async function boundedDecompress(data: ArrayBuffer, compression: Compression, alive: () => boolean): Promise<ArrayBuffer> {
  if (!alive() || data.byteLength > MAX_RANGE_BYTES) throw new Error('route compressed envelope');
  if (compression === Compression.None || compression === Compression.Unknown) return data;
  if (compression !== Compression.Gzip) throw new Error('route compression unsupported');
  const reader = new Response(data).body!.pipeThrough(new DecompressionStream('gzip')).getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (!alive() || size > MAX_RANGE_BYTES) throw new Error('route decoded envelope');
      parts.push(item.value);
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { result.set(part, offset); offset += part.byteLength; }
    return result.buffer;
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally { reader.releaseLock(); }
}

function archiveFor(bucket: R2Bucket) {
  const key = bucket as unknown as object;
  let state = archives.get(key);
  if (!state) {
    const created = { roads: new Map<string, Promise<RouteSegment[]>>(), abandoned: false } as ArchiveState;
    const alive = () => !created.abandoned;
    const decompress = (data: ArrayBuffer, compression: Compression) => boundedDecompress(data, compression, alive);
    created.archive = new PMTiles(new R2PmtilesSource(bucket, alive), new SharedPromiseCache(100, false, decompress), decompress);
    state = created;
    archives.set(key, state);
  }
  return state;
}

function clampLatitude(lat: number) {
  return Math.max(-85.05112878, Math.min(85.05112878, lat));
}

function tileFor(lon: number, lat: number, z: number) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = clampLatitude(lat) * Math.PI / 180;
  const y = Math.floor((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2 * n);
  return {
    z,
    x: Math.max(0, Math.min(n - 1, x)),
    y: Math.max(0, Math.min(n - 1, y))
  };
}

function projectMeters(lon: number, lat: number, refLon: number, refLat: number) {
  return [
    (lon - refLon) * 111_320 * Math.cos(refLat * Math.PI / 180),
    (lat - refLat) * 110_540
  ] as const;
}

function isCoord(value: unknown): value is Coord {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number";
}

function segmentsFromGeometry(geometry: { type?: string; coordinates?: unknown }): RouteSegment[] {
  const out: RouteSegment[] = [];
  const addLine = (value: unknown) => {
    if (!Array.isArray(value)) return;
    const coords = value.filter(isCoord);
    if (coords.length + out.length > MAX_SEGMENTS + 1) throw new Error('route geometry limit');
    for (let i = 1; i < coords.length; i++) out.push({ a: coords[i - 1], b: coords[i] });
  };
  if (geometry.type === "LineString") addLine(geometry.coordinates);
  else if (geometry.type === "MultiLineString" && Array.isArray(geometry.coordinates)) {
    for (const line of geometry.coordinates) addLine(line);
  }
  return out;
}

export function angularDifference(a: number, b: number) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function segmentHeading(segment: RouteSegment) {
  const avgLat = (segment.a[1] + segment.b[1]) / 2;
  const [dx, dy] = projectMeters(segment.b[0], segment.b[1], segment.a[0], avgLat);
  return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
}

function matchSegment(lon: number, lat: number, segment: RouteSegment, bearingDeg: number | null): SegmentMatch {
  const [ax, ay] = projectMeters(segment.a[0], segment.a[1], lon, lat);
  const [bx, by] = projectMeters(segment.b[0], segment.b[1], lon, lat);
  const dx = bx - ax;
  const dy = by - ay;
  const denom = dx * dx + dy * dy;
  const t = denom <= 1e-9 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / denom));
  const x = ax + t * dx;
  const y = ay + t * dy;
  const distanceM = Math.hypot(x, y);
  const headingDeltaDeg = bearingDeg === null ? null : angularDifference(segmentHeading(segment), bearingDeg);
  // Distance dominates. Heading only ranks nearby alternatives and never eliminates a corridor.
  const score = distanceM + (headingDeltaDeg === null ? 0 : headingDeltaDeg * 0.35);
  return {
    segment,
    lon: segment.a[0] + (segment.b[0] - segment.a[0]) * t,
    lat: segment.a[1] + (segment.b[1] - segment.a[1]) * t,
    distanceM,
    headingDeltaDeg,
    score
  };
}

export function nearestRoutePoint(lon: number, lat: number, segments: RouteSegment[]) {
  if (!segments.length) return null;
  let best = matchSegment(lon, lat, segments[0], null);
  for (let i = 1; i < segments.length; i++) {
    const candidate = matchSegment(lon, lat, segments[i], null);
    if (candidate.distanceM < best.distanceM) best = candidate;
  }
  return { lon: best.lon, lat: best.lat, distanceM: best.distanceM };
}

function trimCache(roadCache: ArchiveState['roads']) {
  while (roadCache.size > 64) {
    const first = roadCache.keys().next().value as string | undefined;
    if (!first) break;
    roadCache.delete(first);
  }
}

async function decodeRoadSegments(state: ArchiveState, z: number, x: number, y: number): Promise<RouteSegment[]> {
  const roadCache = state.roads;
  const key = `${z}/${x}/${y}`;
  const cached = roadCache.get(key);
  if (cached) return cached;
  const pending = (async () => {
    const response = await state.archive.getZxy(z, x, y);
    if (state.abandoned) throw new Error('route generation abandoned');
    if (!response) return [];
    const tile = new VectorTile(new PbfReader(new Uint8Array(response.data)));
    const layer = tile.layers.roads;
    if (!layer) return [];
    if (layer.length > MAX_FEATURES) throw new Error('route feature limit');
    const out: RouteSegment[] = [];
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      const geo = feature.toGeoJSON(x, y, z) as unknown as { geometry?: { type?: string; coordinates?: unknown } };
      if (geo.geometry) out.push(...segmentsFromGeometry(geo.geometry));
      if (out.length > MAX_SEGMENTS) throw new Error('route segment limit');
    }
    return out;
  })().catch(error => {
    if (roadCache.get(key) === pending) roadCache.delete(key);
    throw error;
  });
  roadCache.set(key, pending);
  trimCache(roadCache);
  return pending;
}

async function nearbyRoads(state: ArchiveState, lon: number, lat: number) {
  const header = await state.archive.getHeader();
  if (state.abandoned) throw new Error('route generation abandoned');
  const z = Math.min(DETAIL_ZOOM, header.maxZoom);
  const center = tileFor(lon, lat, z);
  const n = 2 ** z;
  const jobs: Promise<RouteSegment[]>[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = center.x + dx;
      const y = center.y + dy;
      if (x >= 0 && y >= 0 && x < n && y < n) jobs.push(decodeRoadSegments(state, z, x, y));
    }
  }
  return (await Promise.all(jobs)).flat();
}

function distinctMatches(matches: SegmentMatch[], max: number) {
  const out: SegmentMatch[] = [];
  for (const candidate of matches) {
    const duplicate = out.some(existing => {
      const sameA = Math.hypot(candidate.segment.a[0] - existing.segment.a[0], candidate.segment.a[1] - existing.segment.a[1]) < 1e-6;
      const sameB = Math.hypot(candidate.segment.b[0] - existing.segment.b[0], candidate.segment.b[1] - existing.segment.b[1]) < 1e-6;
      const reversedA = Math.hypot(candidate.segment.a[0] - existing.segment.b[0], candidate.segment.a[1] - existing.segment.b[1]) < 1e-6;
      const reversedB = Math.hypot(candidate.segment.b[0] - existing.segment.a[0], candidate.segment.b[1] - existing.segment.a[1]) < 1e-6;
      return (sameA && sameB) || (reversedA && reversedB);
    });
    if (!duplicate) out.push(candidate);
    if (out.length >= max) break;
  }
  return out;
}

export async function constrainFallbackToRoute(packet: LivePacket, maps: R2Bucket): Promise<LivePacket> {
  // Source 2 is the child's short inertial estimate. Fresh fused or last-known fixes are never route-processed.
  // Source 5 means a server route-constrained estimate. The inertial center is preserved; nearby plausible
  // private-map corridors are attached as uncertainty evidence rather than snapping to one invented road.
  if (packet.version !== 2 || packet.source !== 2 || packet.quality !== 4) return packet;
  if (packet.trustedLatE7 === null || packet.trustedLonE7 === null) return packet;
  if (![2, 3, 4, 5].includes(packet.activity)) return packet;
  const lat = packet.trustedLatE7 / 1e7;
  const lon = packet.trustedLonE7 / 1e7;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return packet;

  const state = archiveFor(maps);
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abandon = () => {
    state.abandoned = true;
    state.roads.clear();
    // A late failure from an old generation must not evict a healthy replacement.
    if (archives.get(maps as unknown as object) === state) archives.delete(maps as unknown as object);
  };
  try {
    const segments = await Promise.race([nearbyRoads(state, lon, lat), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { abandon(); reject(new Error('route lookup deadline')); }, ROUTE_LOOKUP_BUDGET_MS);
    })]);
    if (state.abandoned || performance.now() - started >= ROUTE_LOOKUP_BUDGET_MS) { abandon(); return packet; }
    const bearingDeg = packet.bearingCdeg === null ? null : packet.bearingCdeg / 100;
    const maxByMode = packet.activity === 5 || packet.activity === 4 ? 60 : 35;
    const uncertaintyM = packet.uncertaintyCm / 100;
    const thresholdM = Math.min(maxByMode, Math.max(12, uncertaintyM * 0.4));
    const matches = distinctMatches(
      segments
        .map(segment => matchSegment(lon, lat, segment, bearingDeg))
        .filter(match => match.distanceM <= thresholdM)
        .sort((a, b) => a.score - b.score),
      MAX_CORRIDORS
    );
    if (!matches.length) return packet;

    const candidates: RouteCorridorCandidate[] = matches.map(match => ({
      a: match.segment.a,
      b: match.segment.b,
      distanceM: Math.round(match.distanceM * 10) / 10,
      headingDeltaDeg: match.headingDeltaDeg === null ? null : Math.round(match.headingDeltaDeg * 10) / 10,
      score: Math.round(match.score * 10) / 10
    }));
    const radiusM = Math.max(uncertaintyM, Math.max(...matches.map(match => match.distanceM)) + 12);
    if (performance.now() - started >= ROUTE_LOOKUP_BUDGET_MS) { abandon(); return packet; }
    return {
      ...packet,
      uncertaintyCm: Math.max(packet.uncertaintyCm, Math.round(radiusM * 100)),
      source: ROUTE_SOURCE_CODE,
      routeCorridor: { center: [lon, lat], radiusM, candidates }
    };
  } catch {
    abandon();
    // Private map absence/corruption must never invent a route or block location delivery.
    return packet;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
