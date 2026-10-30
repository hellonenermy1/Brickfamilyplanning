import * as maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { layers, LIGHT } from "@protomaps/basemaps";

const SOURCE_ID = "brick-basemap";
let protocolInstalled = false;

function ensureProtocol() {
  if (protocolInstalled) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  maplibregl.setWorkerUrl("/parent-assets/maplibre-gl-worker.mjs?v=6.16.0");
  protocolInstalled = true;
}

export function createBrickMap(container: string | HTMLElement) {
  ensureProtocol();
  const origin = globalThis.location?.origin ?? "";
  const style: maplibregl.StyleSpecification = {
    version: 8,
    sources: {
      [SOURCE_ID]: {
        type: "vector",
        url: `pmtiles://${origin}/parent/map/basemap.pmtiles`,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · Protomaps'
      }
    },
    layers: layers(SOURCE_ID, LIGHT) as maplibregl.LayerSpecification[]
  };

  return new maplibregl.Map({
    container,
    style,
    center: [103.8198, 1.3521],
    zoom: 11,
    minZoom: 8,
    maxZoom: 19,
    attributionControl: true,
    cooperativeGestures: false
  });
}

function radians(x: number) { return x * Math.PI / 180; }
function distanceM(aLon: number, aLat: number, bLon: number, bLat: number) {
  const R = 6371000;
  const dLat = radians(bLat - aLat), dLon = radians(bLon - aLon);
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}

function visitCoordinates(value: unknown, cb: (lon: number, lat: number) => void) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    cb(value[0], value[1]);
    return;
  }
  for (const child of value) visitCoordinates(child, cb);
}

function featureDistance(feature: maplibregl.MapGeoJSONFeature, lon: number, lat: number) {
  let best = Number.POSITIVE_INFINITY;
  visitCoordinates((feature.geometry as GeoJSON.Geometry).coordinates, (x, y) => {
    best = Math.min(best, distanceM(lon, lat, x, y));
  });
  return best;
}

function featureName(feature: maplibregl.MapGeoJSONFeature) {
  const p = feature.properties ?? {};
  return String(p["name:en"] || p.name || "").trim();
}

type Candidate = { text: string; distanceM: number; rank: number };

export function resolveBrickPlace(map: maplibregl.Map, lon: number, lat: number): string | null {
  if (!map.isStyleLoaded() || !Number.isFinite(lon) || !Number.isFinite(lat)) return null;

  const candidates: Candidate[] = [];
  let road: Candidate | null = null;
  let houseNumber: Candidate | null = null;
  const specs = [
    ["pois", 0, 180],
    ["landuse", 10, 220],
    ["buildings", 20, 100],
    ["roads", 30, 140],
    ["places", 40, 2500]
  ] as const;

  for (const [sourceLayer, rank, maxDistance] of specs) {
    let features: maplibregl.MapGeoJSONFeature[] = [];
    try { features = map.querySourceFeatures(SOURCE_ID, { sourceLayer }); } catch { continue; }
    for (const feature of features) {
      const d = featureDistance(feature, lon, lat);
      if (!Number.isFinite(d) || d > maxDistance) continue;
      const name = featureName(feature);
      const props = feature.properties ?? {};
      if (sourceLayer === "roads" && name) {
        const c = { text: name, distanceM: d, rank };
        if (!road || c.distanceM < road.distanceM) road = c;
      }
      if (sourceLayer === "buildings" && props.addr_housenumber) {
        const c = { text: String(props.addr_housenumber), distanceM: d, rank };
        if (!houseNumber || c.distanceM < houseNumber.distanceM) houseNumber = c;
      }
      if (name) candidates.push({ text: name, distanceM: d, rank });
    }
  }

  candidates.sort((a, b) => (a.rank + Math.min(60, a.distanceM / 8)) - (b.rank + Math.min(60, b.distanceM / 8)));
  const best = candidates[0];
  if (best && best.rank <= 20) return best.text;
  if (houseNumber && road && road.distanceM <= 120) return `${houseNumber.text} ${road.text}`;
  if (road) return road.text;
  return best?.text ?? null;
}

export async function getPrivateMapStatus() {
  const response = await fetch("/parent/map/status", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) return { installed: false, error: `HTTP ${response.status}` };
  return response.json();
}

export { maplibregl };
