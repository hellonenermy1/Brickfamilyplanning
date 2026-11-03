import * as maplibregl from "maplibre-gl";
import { PMTiles, Protocol } from "pmtiles";
import { layers, LIGHT } from "@protomaps/basemaps";
import { resolveBrickPlace as resolvePrivatePlace, getPrivateMapStatus } from "./brick-map";

const PRIVATE_SOURCE = "brick-private-basemap";
const ONE_SOURCE = "brick-onemap";
const REVERSE_MIN_INTERVAL_MS = 15_000;
const REVERSE_NEARBY_REUSE_MS = 60_000;
const REVERSE_NEARBY_REUSE_M = 120;
let privateProtocolInstalled = false;
const providerState = new WeakMap<maplibregl.Map, "onemap" | "private">();
const modeState = new WeakMap<maplibregl.Map, "detailed" | "clean">();

type ReverseState = { lon: number; lat: number; label: string; at: number };
type ReverseInflight = { lon: number; lat: number; generation: number; promise: Promise<string | null> };
let lastReverse: ReverseState | null = null;
let reverseInflight: ReverseInflight | null = null;
let reverseGeneration = 0;
let lastReverseRequestAt = 0;

function privateMapUrl() {
  const origin = globalThis.location?.origin ?? "";
  return `${origin}/parent/map/basemap.pmtiles`;
}

function ensurePrivateProtocol() {
  if (privateProtocolInstalled) return;
  const protocol = new Protocol();
  protocol.add(new PMTiles(privateMapUrl()));
  maplibregl.addProtocol("brickpmtiles", protocol.tile);
  maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs?v=6.16.0");
  privateProtocolInstalled = true;
}

function oneMapStyle(mode: "detailed" | "clean"): maplibregl.StyleSpecification {
  const style = mode === "clean" ? "Grey" : "Default_HD";
  return {
    version: 8,
    sources: {
      [ONE_SOURCE]: {
        type: "raster",
        tiles: [`https://www.onemap.gov.sg/maps/tiles/${style}/{z}/{x}/{y}.png`],
        tileSize: 256,
        minzoom: 11,
        maxzoom: 19,
        attribution: '<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a> © contributors | <a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>'
      }
    },
    layers: [{ id: "onemap-raster", type: "raster", source: ONE_SOURCE }]
  };
}

function privateStyle(): maplibregl.StyleSpecification {
  ensurePrivateProtocol();
  const baseLayers = (layers(PRIVATE_SOURCE, LIGHT) as maplibregl.LayerSpecification[]).filter(layer => layer.type !== "symbol");
  return {
    version: 8,
    sources: {
      [PRIVATE_SOURCE]: {
        type: "vector",
        url: `brickpmtiles://${privateMapUrl()}`,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · Protomaps'
      }
    },
    layers: baseLayers
  };
}

export function createBrickMap(container: string | HTMLElement) {
  maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs?v=6.16.0");
  const map = new maplibregl.Map({
    container,
    style: oneMapStyle("detailed"),
    center: [103.8198, 1.3521],
    zoom: 11,
    minZoom: 8,
    maxZoom: 19,
    cooperativeGestures: false
  });
  providerState.set(map, "onemap");
  modeState.set(map, "detailed");
  map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true }), "top-right");

  // A transient single tile error should not destroy the primary map. Three errors within a short
  // window trigger the provider-independent private PMTiles fallback.
  const errors: number[] = [];
  map.on("error", () => {
    if (providerState.get(map) !== "onemap") return;
    const now = Date.now();
    errors.push(now);
    while (errors.length && now - errors[0] > 15_000) errors.shift();
    if (errors.length >= 3) switchToPrivateFallback(map);
  });
  return map;
}

export function switchToPrivateFallback(map: maplibregl.Map) {
  if (providerState.get(map) === "private") return;
  providerState.set(map, "private");
  map.setStyle(privateStyle());
}

export function setBrickMapMode(map: maplibregl.Map, mode: "detailed" | "clean") {
  modeState.set(map, mode);
  if (providerState.get(map) === "onemap") map.setStyle(oneMapStyle(mode));
}

export function brickMapProvider(map: maplibregl.Map) {
  return { provider: providerState.get(map) ?? "onemap", mode: modeState.get(map) ?? "detailed" };
}

function distanceM(aLon: number, aLat: number, bLon: number, bLat: number) {
  const rad = Math.PI / 180;
  const meanLat = (aLat + bLat) * 0.5 * rad;
  const dx = (aLon - bLon) * 111_320 * Math.cos(meanLat);
  const dy = (aLat - bLat) * 110_540;
  return Math.hypot(dx, dy);
}

/**
 * Reverse geocoding is enrichment, never the Fast Live path. A 2-second location stream can call
 * this function on every render, but network enrichment is temporally/spatially coalesced here.
 */
export async function resolveBrickPlace(lon: number, lat: number): Promise<string | null> {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const now = Date.now();

  if (lastReverse) {
    const age = now - lastReverse.at;
    const distance = distanceM(lon, lat, lastReverse.lon, lastReverse.lat);
    if (age < REVERSE_MIN_INTERVAL_MS || (age < REVERSE_NEARBY_REUSE_MS && distance <= REVERSE_NEARBY_REUSE_M)) {
      return lastReverse.label;
    }
  }

  // Even if the device is moving quickly, provider calls cannot track the ~2s Live Track cadence.
  // During the minimum interval prefer a recent label; if none exists use the private resolver.
  if (now - lastReverseRequestAt < REVERSE_MIN_INTERVAL_MS) {
    if (lastReverse) return lastReverse.label;
    if (reverseInflight) return reverseInflight.promise;
    return resolvePrivatePlace(lon, lat);
  }

  if (reverseInflight) {
    const distance = distanceM(lon, lat, reverseInflight.lon, reverseInflight.lat);
    if (distance <= REVERSE_NEARBY_REUSE_M) return reverseInflight.promise;
  }

  lastReverseRequestAt = now;
  const generation = ++reverseGeneration;
  const requestId = `${now}-${generation}-${Math.round(lat * 1e4)}-${Math.round(lon * 1e4)}`;
  const promise = (async (): Promise<string | null> => {
    try {
      const response = await fetch(`/parent/api/onemap/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&requestId=${encodeURIComponent(requestId)}`, {
        credentials: "same-origin", cache: "no-store"
      });
      if (response.ok) {
        const body = await response.json() as { label?: unknown };
        if (typeof body.label === "string" && body.label.trim()) {
          const label = body.label.trim();
          // A slower response for an older request may resolve its own promise, but may never replace
          // the shared enrichment state for a newer point.
          if (generation === reverseGeneration) lastReverse = { lon, lat, label, at: Date.now() };
          return label;
        }
      }
    } catch { /* provider fallback below */ }
    return resolvePrivatePlace(lon, lat);
  })();

  reverseInflight = { lon, lat, generation, promise };
  try {
    return await promise;
  } finally {
    if (reverseInflight?.generation === generation) reverseInflight = null;
  }
}

export { getPrivateMapStatus, maplibregl };
