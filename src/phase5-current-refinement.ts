import type { ExternalConstraint } from "./phase5-external-constraints";

const EARTH_M = 6_371_000;
const MAX_RADIUS_M = 50_000;
const PRECISE_BASE_MAX_AGE_MS = 60_000;
const BASE_MAX_AGE_MS = 10 * 60_000;

export type ParentCurrentState = {
  epoch?: number;
  sequence?: number;
  lat: number | null;
  lon: number | null;
  uncertaintyM: number;
  quality: string;
  source?: string;
  receivedAt: number;
  wallTimeMs?: number;
};

export type RefinedEvidence = {
  id: string;
  kind: "device" | "witness" | "ground_receiver";
  ageMs: number;
  radiusM: number;
  explanation: string;
};

export type CurrentRefinedState = {
  latitude: number;
  longitude: number;
  uncertaintyM: number;
  quality: "anchored" | "estimated" | "coarse" | "last known";
  shape: "place_area" | "possible_area" | "last_known_area";
  computedAt: number;
  baseEpoch: number | null;
  baseSequence: number | null;
  evidenceUsed: RefinedEvidence[];
  conflicts: Array<{ a: string; b: string; separationM: number; allowedOverlapM: number }>;
};

type Area = {
  id: string;
  kind: RefinedEvidence["kind"];
  latitude: number;
  longitude: number;
  radiusM: number;
  ageMs: number;
  weight: number;
  explanation: string;
  authoritativeArea: boolean;
};

function validPoint(lat: unknown, lon: unknown, radius: unknown): lat is number {
  return typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    typeof lon === "number" && Number.isFinite(lon) && lon >= -180 && lon <= 180 &&
    typeof radius === "number" && Number.isFinite(radius) && radius >= 1 && radius <= MAX_RADIUS_M;
}

function distanceM(aLat: number, aLon: number, bLat: number, bLon: number) {
  const p1 = aLat * Math.PI / 180;
  const p2 = bLat * Math.PI / 180;
  const dp = (bLat - aLat) * Math.PI / 180;
  const dl = (bLon - aLon) * Math.PI / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return EARTH_M * 2 * Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)));
}

function weightedCenter(areas: Area[]): [number, number] {
  // Local equirectangular weighting is sufficient for Brick's bounded current-state areas and avoids
  // longitude wrap artifacts by unwrapping relative to the strongest/reference area.
  const ref = areas[0].longitude;
  let lat = 0, lon = 0, total = 0;
  for (const area of areas) {
    let x = area.longitude;
    while (x - ref > 180) x -= 360;
    while (x - ref < -180) x += 360;
    lat += area.latitude * area.weight;
    lon += x * area.weight;
    total += area.weight;
  }
  const outLon = ((lon / total + 540) % 360) - 180;
  return [lat / total, outLon];
}

function conflicts(areas: Area[]) {
  const out: CurrentRefinedState["conflicts"] = [];
  for (let i = 0; i < areas.length; i++) {
    for (let j = i + 1; j < areas.length; j++) {
      const a = areas[i], b = areas[j];
      const separation = distanceM(a.latitude, a.longitude, b.latitude, b.longitude);
      const overlap = a.radiusM + b.radiusM + 25;
      if (separation > overlap) out.push({ a: a.id, b: b.id, separationM: separation, allowedOverlapM: overlap });
    }
  }
  return out.slice(0, 16);
}

function baseArea(state: ParentCurrentState | null, now: number): Area | null {
  if (!state || !Number.isSafeInteger(state.receivedAt) || state.receivedAt <= 0 || state.receivedAt > now + 30_000) return null;
  const ageMs = Math.max(0, now - state.receivedAt);
  if (ageMs > BASE_MAX_AGE_MS || !validPoint(state.lat, state.lon, state.uncertaintyM)) return null;
  const quality = state.quality.toLowerCase();
  const precise = quality === "precise" || quality === "assisted";
  const anchored = quality === "anchored";
  const weight = precise && ageMs <= PRECISE_BASE_MAX_AGE_MS ? 5.0 : anchored ? 2.4 : quality === "estimated" ? 1.7 : quality === "coarse" ? 1.1 : 0.8;
  return {
    id: "device-current",
    kind: "device",
    latitude: state.lat!, longitude: state.lon!, radiusM: Math.max(15, state.uncertaintyM),
    ageMs, weight, explanation: `device ${quality || "unknown"} state`, authoritativeArea: precise || anchored
  };
}

function externalArea(c: ExternalConstraint): Area | null {
  if (!validPoint(c.latitude, c.longitude, c.radiusM) || !Number.isSafeInteger(c.ageMs) || c.ageMs < 0) return null;
  return {
    id: c.id,
    kind: c.kind,
    latitude: c.latitude,
    longitude: c.longitude,
    radiusM: c.radiusM,
    ageMs: c.ageMs,
    weight: c.kind === "ground_receiver" ? 2.8 : 1.8,
    explanation: c.explanation,
    authoritativeArea: c.kind === "ground_receiver"
  };
}

/**
 * Build a separate parent-facing refinement from the child current state + authorised external
 * areas. This never mutates the Durable Object's child state and never creates PRECISE/ASSISTED.
 * A fresh precise/assisted child fix remains the center; contradictory external evidence can only
 * widen the separate refined uncertainty. Degraded/absent child state may be anchored by a fresh
 * fixed receiver or authorised witness area.
 */
export function refineCurrentState(
  state: ParentCurrentState | null,
  external: ExternalConstraint[],
  now: number
): CurrentRefinedState | null {
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error("invalid refinement time");
  const base = baseArea(state, now);
  const ext = external.map(externalArea).filter((x): x is Area => x !== null).slice(0, 16);
  if (ext.length === 0) return null;

  const preciseBase = base !== null && (state!.quality.toLowerCase() === "precise" || state!.quality.toLowerCase() === "assisted") && base.ageMs <= PRECISE_BASE_MAX_AGE_MS;
  const areas = base ? [base, ...ext] : ext;
  const clash = conflicts(areas);

  let center: [number, number];
  if (preciseBase) center = [base!.latitude, base!.longitude];
  else center = weightedCenter(areas);

  // The refined area must contain every contributing uncertainty region. This deliberately does
  // not intersect circles into an unrealistically tiny point; external BLE evidence is area truth.
  let radius = 25;
  for (const area of areas) {
    radius = Math.max(radius, distanceM(center[0], center[1], area.latitude, area.longitude) + area.radiusM);
  }
  if (clash.length > 0) radius = Math.max(radius, ...clash.map(c => c.separationM + 50));
  radius = Math.min(MAX_RADIUS_M, radius);

  let quality: CurrentRefinedState["quality"];
  let shape: CurrentRefinedState["shape"];
  if (clash.length > 0 || radius >= 2_500) {
    quality = "coarse";
    shape = "possible_area";
  } else if (!base && ext.length === 1) {
    quality = "anchored";
    shape = "place_area";
  } else if (!preciseBase && areas.some(a => a.authoritativeArea) && radius <= 1_000) {
    quality = "anchored";
    shape = "place_area";
  } else if (base && state!.quality.toLowerCase() === "last known") {
    quality = "last known";
    shape = "last_known_area";
  } else {
    quality = "estimated";
    shape = "possible_area";
  }

  return {
    latitude: center[0], longitude: center[1], uncertaintyM: radius,
    quality, shape, computedAt: now,
    baseEpoch: state?.epoch ?? null,
    baseSequence: state?.sequence ?? null,
    evidenceUsed: areas.map(a => ({ id: a.id, kind: a.kind, ageMs: a.ageMs, radiusM: a.radiusM, explanation: a.explanation })),
    conflicts: clash
  };
}
