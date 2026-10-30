import * as maplibregl from "maplibre-gl";
import { PMTiles, Protocol } from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { layers, LIGHT } from "@protomaps/basemaps";

const SOURCE_ID = "brick-basemap";
const DETAIL_ZOOM = 15;
const PLACE_ZOOM = 13;
let protocolInstalled = false;
let privateArchive: PMTiles | null = null;

type GeoGeometry = {
  type: string;
  coordinates?: unknown;
  geometries?: GeoGeometry[];
};
type DecodedFeature = {
  layer: string;
  properties: Record<string, unknown>;
  geometry: GeoGeometry;
};
type Candidate = { text: string; distanceM: number; rank: number };

const tileCache = new Map<string, Promise<DecodedFeature[]>>();

function privateMapUrl() {
  const origin = globalThis.location?.origin ?? "";
  return `${origin}/parent/map/basemap.pmtiles`;
}

function ensureProtocol() {
  if (protocolInstalled) return;
  const protocol = new Protocol();
  privateArchive = new PMTiles(privateMapUrl());
  protocol.add(privateArchive);
  maplibregl.addProtocol("pmtiles", protocol.tile);
  maplibregl.setWorkerUrl("/parent-assets/maplibre-gl-worker.mjs?v=6.16.0");
  protocolInstalled = true;
}

export function createBrickMap(container: string | HTMLElement) {
  ensureProtocol();
  const baseLayers = (layers(SOURCE_ID, LIGHT) as maplibregl.LayerSpecification[])
    .filter(layer => layer.type !== "symbol");
  const style: maplibregl.StyleSpecification = {
    version: 8,
    sources: {
      [SOURCE_ID]: {
        type: "vector",
        url: `pmtiles://${privateMapUrl()}`,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · Protomaps'
      }
    },
    layers: baseLayers
  };

  return new maplibregl.Map({
    container,
    style,
    center: [103.8198, 1.3521],
    zoom: 11,
    minZoom: 8,
    maxZoom: 19,
    cooperativeGestures: false
  });
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

function projectMeters(lon: number, lat: number, refLon: number, refLat: number) {
  const x = (lon - refLon) * 111_320 * Math.cos(refLat * Math.PI / 180);
  const y = (lat - refLat) * 110_540;
  return [x, y] as const;
}

function pointSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function isCoordinate(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number";
}

function lineDistance(coords: unknown, refLon: number, refLat: number) {
  if (!Array.isArray(coords)) return Number.POSITIVE_INFINITY;
  const points = coords.filter(isCoordinate);
  if (!points.length) return Number.POSITIVE_INFINITY;
  if (points.length === 1) {
    const [x, y] = projectMeters(points[0][0], points[0][1], refLon, refLat);
    return Math.hypot(x, y);
  }
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = projectMeters(points[i - 1][0], points[i - 1][1], refLon, refLat);
    const [bx, by] = projectMeters(points[i][0], points[i][1], refLon, refLat);
    best = Math.min(best, pointSegmentDistance(0, 0, ax, ay, bx, by));
  }
  return best;
}

function pointInRing(coords: unknown, refLon: number, refLat: number) {
  if (!Array.isArray(coords)) return false;
  const points = coords.filter(isCoordinate);
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    const intersects = ((a[1] > refLat) !== (b[1] > refLat)) &&
      (refLon < (b[0] - a[0]) * (refLat - a[1]) / ((b[1] - a[1]) || Number.EPSILON) + a[0]);
    if (intersects) inside = !inside;
  }
  return inside;
}

function polygonDistance(rings: unknown, refLon: number, refLat: number) {
  if (!Array.isArray(rings) || !rings.length) return Number.POSITIVE_INFINITY;
  const outer = rings[0];
  const insideOuter = pointInRing(outer, refLon, refLat);
  const insideHole = insideOuter && rings.slice(1).some(ring => pointInRing(ring, refLon, refLat));
  if (insideOuter && !insideHole) return 0;
  let best = Number.POSITIVE_INFINITY;
  for (const ring of rings) best = Math.min(best, lineDistance(ring, refLon, refLat));
  return best;
}

function geometryDistance(geometry: GeoGeometry, refLon: number, refLat: number): number {
  const c = geometry.coordinates;
  switch (geometry.type) {
    case "Point": {
      if (!isCoordinate(c)) return Number.POSITIVE_INFINITY;
      const [x, y] = projectMeters(c[0], c[1], refLon, refLat);
      return Math.hypot(x, y);
    }
    case "MultiPoint":
    case "LineString":
      return lineDistance(c, refLon, refLat);
    case "MultiLineString":
      return Array.isArray(c) ? Math.min(...c.map(line => lineDistance(line, refLon, refLat))) : Number.POSITIVE_INFINITY;
    case "Polygon":
      return polygonDistance(c, refLon, refLat);
    case "MultiPolygon":
      return Array.isArray(c) ? Math.min(...c.map(poly => polygonDistance(poly, refLon, refLat))) : Number.POSITIVE_INFINITY;
    case "GeometryCollection":
      return Math.min(...(geometry.geometries ?? []).map(g => geometryDistance(g, refLon, refLat)), Number.POSITIVE_INFINITY);
    default:
      return Number.POSITIVE_INFINITY;
  }
}

function featureName(properties: Record<string, unknown>) {
  return String(properties["name:en"] || properties.name || properties.name2 || "").trim();
}

function trimTileCache() {
  while (tileCache.size > 48) {
    const first = tileCache.keys().next().value as string | undefined;
    if (!first) break;
    tileCache.delete(first);
  }
}

async function decodeTile(z: number, x: number, y: number): Promise<DecodedFeature[]> {
  ensureProtocol();
  if (!privateArchive) return [];
  const key = `${z}/${x}/${y}`;
  const cached = tileCache.get(key);
  if (cached) return cached;

  const pending = (async () => {
    const response = await privateArchive!.getZxy(z, x, y);
    if (!response) return [];
    const tile = new VectorTile(new PbfReader(new Uint8Array(response.data)));
    const result: DecodedFeature[] = [];
    for (const layerName of ["pois", "landuse", "buildings", "roads", "places"]) {
      const layer = tile.layers[layerName];
      if (!layer) continue;
      for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i);
        const geo = feature.toGeoJSON(x, y, z) as unknown as { geometry: GeoGeometry };
        result.push({ layer: layerName, properties: feature.properties as Record<string, unknown>, geometry: geo.geometry });
      }
    }
    return result;
  })().catch(error => {
    tileCache.delete(key);
    throw error;
  });

  tileCache.set(key, pending);
  trimTileCache();
  return pending;
}

async function nearbyTiles(lon: number, lat: number, z: number) {
  const center = tileFor(lon, lat, z), n = 2 ** z;
  const jobs: Array<Promise<DecodedFeature[]>> = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = center.x + dx, y = center.y + dy;
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      jobs.push(decodeTile(z, x, y));
    }
  }
  return (await Promise.all(jobs)).flat();
}

export async function resolveBrickPlace(lon: number, lat: number): Promise<string | null> {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  ensureProtocol();
  if (!privateArchive) return null;
  const header = await privateArchive.getHeader();
  const detailZoom = Math.min(DETAIL_ZOOM, header.maxZoom);
  const detail = await nearbyTiles(lon, lat, detailZoom);

  const candidates: Candidate[] = [];
  let road: Candidate | null = null;
  let houseNumber: Candidate | null = null;
  const limits: Record<string, { rank: number; maxDistance: number }> = {
    pois: { rank: 0, maxDistance: 180 },
    landuse: { rank: 10, maxDistance: 220 },
    buildings: { rank: 18, maxDistance: 100 },
    roads: { rank: 30, maxDistance: 160 },
    places: { rank: 45, maxDistance: 1800 }
  };

  for (const feature of detail) {
    const spec = limits[feature.layer];
    if (!spec) continue;
    const d = geometryDistance(feature.geometry, lon, lat);
    if (!Number.isFinite(d) || d > spec.maxDistance) continue;
    const name = featureName(feature.properties);
    if (feature.layer === "roads" && name) {
      const c = { text: name, distanceM: d, rank: spec.rank };
      if (!road || c.distanceM < road.distanceM) road = c;
    }
    if (feature.layer === "buildings" && feature.properties.addr_housenumber) {
      const c = { text: String(feature.properties.addr_housenumber), distanceM: d, rank: spec.rank };
      if (!houseNumber || c.distanceM < houseNumber.distanceM) houseNumber = c;
    }
    if (name) candidates.push({ text: name, distanceM: d, rank: spec.rank });
  }

  candidates.sort((a, b) => (a.rank + Math.min(60, a.distanceM / 8)) - (b.rank + Math.min(60, b.distanceM / 8)));
  const best = candidates[0];
  if (best && best.rank <= 18) return best.text;
  if (houseNumber && road && road.distanceM <= 160) return `${houseNumber.text} ${road.text}`;
  if (road) return road.text;
  if (best) return best.text;

  const placeZoom = Math.min(PLACE_ZOOM, header.maxZoom);
  const broad = placeZoom === detailZoom ? detail : await nearbyTiles(lon, lat, placeZoom);
  let locality: Candidate | null = null;
  for (const feature of broad) {
    if (feature.layer !== "places") continue;
    const name = featureName(feature.properties);
    if (!name) continue;
    const d = geometryDistance(feature.geometry, lon, lat);
    if (!Number.isFinite(d) || d > 5000) continue;
    if (!locality || d < locality.distanceM) locality = { text: name, distanceM: d, rank: 50 };
  }
  return locality?.text ?? null;
}

export async function getPrivateMapStatus() {
  const response = await fetch("/parent/map/status", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) return { installed: false, error: `HTTP ${response.status}` };
  return response.json();
}

export { maplibregl };
