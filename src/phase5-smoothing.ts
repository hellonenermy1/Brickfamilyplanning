export type SmoothingEndpoint = {
  latitude: number;
  longitude: number;
  uncertaintyM: number;
  wallTimeMs: number;
};

export type StoredHypothesis = {
  id: string;
  latitude: number;
  longitude: number;
  uncertaintyM: number;
  realtimeWeight: number;
  storedEvidenceWeight: number;
  source: string;
};

export type SmoothingFrame = {
  wallTimeMs: number;
  originalRealtimeHypothesisId: string | null;
  maxSpeedMps: number;
  hypotheses: StoredHypothesis[];
};

export type RefinedFrame = {
  wallTimeMs: number;
  originalRealtimeHypothesisId: string | null;
  refinedHypothesisId: string | null;
  latitude: number | null;
  longitude: number | null;
  uncertaintyM: number | null;
  source: string | null;
  changedFromRealtime: boolean;
  supportScore: number | null;
  reason: "selected_existing_hypothesis" | "no_compatible_hypothesis";
};

const ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const EARTH_RADIUS_M = 6_371_000;

function validCoordinate(lat: number, lon: number) {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lon) && lon >= -180 && lon <= 180;
}

function distanceM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
}

function validateEndpoint(endpoint: SmoothingEndpoint) {
  if (!validCoordinate(endpoint.latitude, endpoint.longitude)) throw new Error("invalid smoothing endpoint coordinate");
  if (!Number.isFinite(endpoint.uncertaintyM) || endpoint.uncertaintyM < 0 || endpoint.uncertaintyM > 5_000) throw new Error("invalid smoothing endpoint uncertainty");
  if (!Number.isSafeInteger(endpoint.wallTimeMs) || endpoint.wallTimeMs <= 0) throw new Error("invalid smoothing endpoint time");
}

function validateHypothesis(h: StoredHypothesis) {
  if (!ID_RE.test(h.id)) throw new Error("invalid smoothing hypothesis id");
  if (!validCoordinate(h.latitude, h.longitude)) throw new Error("invalid smoothing hypothesis coordinate");
  if (!Number.isFinite(h.uncertaintyM) || h.uncertaintyM < 1 || h.uncertaintyM > 50_000) throw new Error("invalid smoothing hypothesis uncertainty");
  if (!Number.isFinite(h.realtimeWeight) || h.realtimeWeight < 0 || h.realtimeWeight > 1) throw new Error("invalid smoothing realtime weight");
  if (!Number.isFinite(h.storedEvidenceWeight) || h.storedEvidenceWeight < 0 || h.storedEvidenceWeight > 1) throw new Error("invalid smoothing evidence weight");
  if (typeof h.source !== "string" || h.source.length < 1 || h.source.length > 64) throw new Error("invalid smoothing source");
}

// Shared validation lets one corrupt stored frame fail independently before a
// multi-frame interval is evaluated. Endpoint/order constraints stay below.
export function validateSmoothingFrame(frame: SmoothingFrame) {
  if (!Number.isSafeInteger(frame.wallTimeMs) || frame.wallTimeMs <= 0) throw Error('invalid smoothing frame time');
  if (!Number.isFinite(frame.maxSpeedMps) || frame.maxSpeedMps <= 0 || frame.maxSpeedMps > 120) throw Error('invalid smoothing speed envelope');
  if (frame.originalRealtimeHypothesisId !== null && (typeof frame.originalRealtimeHypothesisId !== 'string' || !ID_RE.test(frame.originalRealtimeHypothesisId))) throw Error('invalid original hypothesis id');
  if (!Array.isArray(frame.hypotheses) || frame.hypotheses.length > 128) throw Error('invalid smoothing hypothesis count');
  for (const h of frame.hypotheses) validateHypothesis(h);
}

/**
 * Endpoint compatibility is a reachability constraint, not a straight-line interpolation score.
 * A candidate inside the physically plausible envelope is not rewarded for lying on the geodesic
 * between endpoints; this avoids pulling a legitimate road/building route through obstacles.
 */
function endpointCompatibility(
  endpoint: SmoothingEndpoint,
  h: StoredHypothesis,
  travelSeconds: number,
  maxSpeedMps: number
) {
  const d = distanceM(endpoint.latitude, endpoint.longitude, h.latitude, h.longitude);
  const allowance = endpoint.uncertaintyM + h.uncertaintyM + 35;
  const reachable = maxSpeedMps * Math.max(0, travelSeconds) + allowance;
  if (d <= reachable) return 1;
  const excess = d - reachable;
  const scale = Math.max(25, allowance);
  return Math.exp(-excess / scale);
}

/**
 * Backward smoothing selects only among hypotheses that were stored for the degraded interval. It
 * never mutates raw observations or the original realtime selection and never invents an
 * interpolated coordinate when no candidate is compatible with the later precise endpoint.
 *
 * `storedEvidenceWeight` is deliberately a caller-provided re-evaluation of the evidence retained
 * for that frame. It is an internal ordering weight, not a calibrated probability.
 */
export function refineHypothesisInterval(
  start: SmoothingEndpoint,
  end: SmoothingEndpoint,
  frames: readonly SmoothingFrame[]
): RefinedFrame[] {
  validateEndpoint(start);
  validateEndpoint(end);
  if (end.wallTimeMs <= start.wallTimeMs) throw new Error("smoothing endpoints out of order");

  let previousTime = start.wallTimeMs;
  return frames.map(frame => {
    if (!Number.isSafeInteger(frame.wallTimeMs) || frame.wallTimeMs <= start.wallTimeMs || frame.wallTimeMs >= end.wallTimeMs) {
      throw new Error("smoothing frame outside endpoint interval");
    }
    if (frame.wallTimeMs <= previousTime) throw new Error("smoothing frames out of order");
    previousTime = frame.wallTimeMs;
    validateSmoothingFrame(frame);

    const fromStartSec = (frame.wallTimeMs - start.wallTimeMs) / 1000;
    const toEndSec = (end.wallTimeMs - frame.wallTimeMs) / 1000;
    let best: { h: StoredHypothesis; score: number } | null = null;
    for (const h of frame.hypotheses) {
      const startFit = endpointCompatibility(start, h, fromStartSec, frame.maxSpeedMps);
      const endFit = endpointCompatibility(end, h, toEndSec, frame.maxSpeedMps);
      // Both endpoints matter. A candidate physically impossible from either side is strongly
      // suppressed; stored evidence and the original realtime support decide among plausible paths.
      const compatibility = Math.min(startFit, endFit);
      if (compatibility < 0.05) continue;
      const evidence = Math.sqrt(Math.max(0, h.realtimeWeight) * Math.max(0, h.storedEvidenceWeight));
      const score = evidence * compatibility;
      if (!Number.isFinite(score) || score <= 0) continue;
      if (!best || score > best.score || (score === best.score && h.id < best.h.id)) best = { h, score };
    }

    if (!best) {
      return {
        wallTimeMs: frame.wallTimeMs,
        originalRealtimeHypothesisId: frame.originalRealtimeHypothesisId,
        refinedHypothesisId: null,
        latitude: null,
        longitude: null,
        uncertaintyM: null,
        source: null,
        changedFromRealtime: false,
        supportScore: null,
        reason: "no_compatible_hypothesis"
      };
    }

    return {
      wallTimeMs: frame.wallTimeMs,
      originalRealtimeHypothesisId: frame.originalRealtimeHypothesisId,
      refinedHypothesisId: best.h.id,
      latitude: best.h.latitude,
      longitude: best.h.longitude,
      // Smoothing selects an existing hypothesis; it may not report less uncertainty than that
      // hypothesis actually carried at the time without a separate calibrated uncertainty model.
      uncertaintyM: best.h.uncertaintyM,
      source: best.h.source,
      changedFromRealtime: frame.originalRealtimeHypothesisId !== null && best.h.id !== frame.originalRealtimeHypothesisId,
      supportScore: best.score,
      reason: "selected_existing_hypothesis"
    };
  });
}
