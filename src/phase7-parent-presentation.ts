export type Phase7PositionClass =
  | "precise"
  | "assisted"
  | "anchored"
  | "estimated"
  | "coarse"
  | "last_known"
  | "unknown";

export type Phase7GeometryKind =
  | "CIRCLE"
  | "CORRIDOR"
  | "AREA"
  | "ANCHORED_AREA"
  | "LAST_KNOWN_AREA"
  | "NONE";

export type Phase7Freshness = "fresh" | "aging" | "stale" | "unknown";
export type Phase7Confidence = "high" | "medium" | "low" | "very_low";

export type Phase7EvidenceItem = {
  id: string;
  kind: string;
  label: string;
  explanation: string;
  ageMs: number | null;
  radiusM: number | null;
};

export type Phase7CorridorCandidate = {
  a: [number, number];
  b: [number, number];
  score: number;
};

export type Phase7PositionPresentation = {
  protocol: 1;
  positionClass: Phase7PositionClass;
  geometry: {
    kind: Phase7GeometryKind;
    latitude: number | null;
    longitude: number | null;
    radiusM: number | null;
    corridorRadiusM: number | null;
    corridorCandidates: Phase7CorridorCandidate[];
  };
  confidence: Phase7Confidence;
  freshness: Phase7Freshness;
  evidenceAgeMs: number | null;
  source: string;
  headline: string;
  explanation: string;
  evidence: Phase7EvidenceItem[];
  conflicts: Array<{
    a: string;
    b: string;
    separationM: number;
    allowedOverlapM: number;
  }>;
  hasConflict: boolean;
  deviceOffline: boolean;
};

type RouteCorridor = {
  radiusM?: unknown;
  candidates?: unknown;
};

type BasePosition = {
  lat?: unknown;
  lon?: unknown;
  uncertaintyM?: unknown;
  quality?: unknown;
  source?: unknown;
  receivedAt?: unknown;
  routeCorridor?: RouteCorridor | null;
};

type RefinedEvidence = {
  id?: unknown;
  kind?: unknown;
  ageMs?: unknown;
  radiusM?: unknown;
  explanation?: unknown;
};

type RefinedState = {
  latitude?: unknown;
  longitude?: unknown;
  uncertaintyM?: unknown;
  quality?: unknown;
  shape?: unknown;
  computedAt?: unknown;
  evidenceUsed?: unknown;
  conflicts?: unknown;
};

type Snapshot = {
  latest?: BasePosition | null;
  state?: BasePosition | null;
  refinedState?: RefinedState | null;
  health?: {
    trackingIntervalMs?: unknown;
  } | null;
  derived?: {
    deviceStatus?: unknown;
    positionStatus?: unknown;
  } | null;
};

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeText(value: unknown, fallback = "unknown") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function validLatLon(lat: unknown, lon: unknown): lat is number {
  return typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    typeof lon === "number" && Number.isFinite(lon) && lon >= -180 && lon <= 180;
}

function normalizeClass(value: unknown): Phase7PositionClass {
  const q = safeText(value).toLowerCase().replaceAll(" ", "_");
  return q === "precise" || q === "assisted" || q === "anchored" || q === "estimated" ||
    q === "coarse" || q === "last_known" ? q : "unknown";
}

function displayClass(value: Phase7PositionClass) {
  return value === "last_known" ? "Last known" : value.charAt(0).toUpperCase() + value.slice(1);
}

function evidenceLabel(kind: string, source = "unknown") {
  if (kind === "ground_receiver") return "Fixed Brick receiver";
  if (kind === "witness") return "Brick witness";
  if (kind === "device") {
    if (source === "fused") return "Phone fused location";
    if (source === "inertial") return "Short inertial estimate";
    if (source === "last_known") return "Last verified phone position";
    if (source === "ble_anchor") return "BLE place anchor";
    if (source === "fusion") return "Phone fusion estimate";
    return "Phone position";
  }
  if (kind === "route") return "Route geometry";
  return kind.replaceAll("_", " ");
}

function baseEvidence(base: BasePosition, now: number): Phase7EvidenceItem | null {
  const receivedAt = finiteNumber(base.receivedAt);
  const radiusM = finiteNumber(base.uncertaintyM);
  const source = safeText(base.source);
  if (receivedAt === null && radiusM === null) return null;
  return {
    id: "device-current",
    kind: "device",
    label: evidenceLabel("device", source),
    explanation: `${displayClass(normalizeClass(base.quality))} phone state from ${source.replaceAll("_", " ")}.`,
    ageMs: receivedAt === null ? null : Math.max(0, now - receivedAt),
    radiusM: radiusM === null ? null : Math.max(0, radiusM)
  };
}

function refinedEvidenceItems(refined: RefinedState, source: string): Phase7EvidenceItem[] {
  if (!Array.isArray(refined.evidenceUsed)) return [];
  const out: Phase7EvidenceItem[] = [];
  for (const raw of refined.evidenceUsed.slice(0, 16)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as RefinedEvidence;
    const kind = safeText(item.kind, "evidence");
    const id = safeText(item.id, `${kind}-${out.length + 1}`).slice(0, 128);
    const explanation = safeText(item.explanation, `${evidenceLabel(kind, source)} contributed to this region.`).slice(0, 240);
    const age = finiteNumber(item.ageMs);
    const radius = finiteNumber(item.radiusM);
    out.push({
      id,
      kind,
      label: evidenceLabel(kind, source),
      explanation,
      ageMs: age === null ? null : Math.max(0, age),
      radiusM: radius === null ? null : Math.max(0, radius)
    });
  }
  return out;
}

function parseConflicts(value: unknown): Phase7PositionPresentation["conflicts"] {
  if (!Array.isArray(value)) return [];
  const out: Phase7PositionPresentation["conflicts"] = [];
  for (const raw of value.slice(0, 16)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const x = raw as Record<string, unknown>;
    const a = safeText(x.a, "evidence-a").slice(0, 128);
    const b = safeText(x.b, "evidence-b").slice(0, 128);
    const separationM = finiteNumber(x.separationM);
    const allowedOverlapM = finiteNumber(x.allowedOverlapM);
    if (separationM === null || allowedOverlapM === null) continue;
    out.push({ a, b, separationM: Math.max(0, separationM), allowedOverlapM: Math.max(0, allowedOverlapM) });
  }
  return out;
}

function parseCorridor(value: RouteCorridor | null | undefined): { radiusM: number | null; candidates: Phase7CorridorCandidate[] } {
  const radius = finiteNumber(value?.radiusM);
  const rawCandidates = Array.isArray(value?.candidates) ? value!.candidates as unknown[] : [];
  const candidates: Phase7CorridorCandidate[] = [];
  for (const raw of rawCandidates.slice(0, 8)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const x = raw as Record<string, unknown>;
    if (!Array.isArray(x.a) || !Array.isArray(x.b) || x.a.length < 2 || x.b.length < 2) continue;
    const aLon = finiteNumber(x.a[0]), aLat = finiteNumber(x.a[1]);
    const bLon = finiteNumber(x.b[0]), bLat = finiteNumber(x.b[1]);
    const score = finiteNumber(x.score);
    if (aLon === null || aLat === null || bLon === null || bLat === null || score === null) continue;
    if (!validLatLon(aLat, aLon) || !validLatLon(bLat, bLon)) continue;
    candidates.push({ a: [aLon, aLat], b: [bLon, bLat], score });
  }
  return { radiusM: radius === null ? null : Math.max(0, radius), candidates };
}

function confidenceFor(positionClass: Phase7PositionClass, uncertaintyM: number | null): Phase7Confidence {
  if (positionClass === "precise") return uncertaintyM !== null && uncertaintyM > 75 ? "medium" : "high";
  if (positionClass === "assisted") return uncertaintyM !== null && uncertaintyM <= 60 ? "high" : "medium";
  if (positionClass === "anchored") return "medium";
  if (positionClass === "estimated") return "low";
  return "very_low";
}

function freshestAge(evidence: Phase7EvidenceItem[], base: BasePosition | null, now: number): number | null {
  const ages = evidence.map(e => e.ageMs).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const baseReceivedAt = finiteNumber(base?.receivedAt);
  if (baseReceivedAt !== null) ages.push(Math.max(0, now - baseReceivedAt));
  return ages.length ? Math.min(...ages) : null;
}

function freshnessFor(ageMs: number | null, trackingIntervalMs: unknown): Phase7Freshness {
  if (ageMs === null) return "unknown";
  const interval = Math.max(1_000, Math.min(300_000, finiteNumber(trackingIntervalMs) ?? 5_000));
  const staleAt = Math.max(60_000, interval * 3 + 30_000);
  const freshAt = Math.max(15_000, Math.min(staleAt / 2, interval * 1.5 + 5_000));
  if (ageMs <= freshAt) return "fresh";
  if (ageMs <= staleAt) return "aging";
  return "stale";
}

function geometryFor(
  positionClass: Phase7PositionClass,
  latitude: number | null,
  longitude: number | null,
  uncertaintyM: number | null,
  refinedShape: string | null,
  corridor: ReturnType<typeof parseCorridor>,
  usingRefined: boolean
): Phase7PositionPresentation["geometry"] {
  let kind: Phase7GeometryKind = "NONE";
  if (latitude !== null && longitude !== null) {
    if (usingRefined) {
      kind = refinedShape === "place_area" ? "ANCHORED_AREA" :
        refinedShape === "last_known_area" ? "LAST_KNOWN_AREA" : "AREA";
    } else if (positionClass === "estimated" && corridor.candidates.length) {
      kind = "CORRIDOR";
    } else if (positionClass === "anchored") {
      kind = "ANCHORED_AREA";
    } else if (positionClass === "last_known") {
      kind = "LAST_KNOWN_AREA";
    } else if (positionClass === "estimated" || positionClass === "coarse") {
      kind = "AREA";
    } else {
      kind = "CIRCLE";
    }
  }
  return {
    kind,
    latitude,
    longitude,
    radiusM: uncertaintyM,
    corridorRadiusM: kind === "CORRIDOR" ? corridor.radiusM : null,
    corridorCandidates: kind === "CORRIDOR" ? corridor.candidates : []
  };
}

function explanationFor(
  positionClass: Phase7PositionClass,
  geometry: Phase7GeometryKind,
  usingRefined: boolean,
  conflict: boolean,
  deviceOffline: boolean
) {
  let explanation: string;
  if (positionClass === "unknown" || geometry === "NONE") {
    explanation = "Brick does not currently have a trustworthy position to show.";
  } else if (conflict) {
    explanation = "Available evidence disagrees, so Brick widened the uncertainty instead of pretending the position is precise.";
  } else if (geometry === "CORRIDOR") {
    explanation = "Exact position confidence is degraded. Brick is showing plausible route corridors and their uncertainty.";
  } else if (usingRefined && geometry === "ANCHORED_AREA") {
    explanation = "A degraded phone position is being bounded by independent evidence. Brick shows the verified area, not an exact point.";
  } else if (usingRefined) {
    explanation = "Brick combined current evidence into a conservative possible area without upgrading it to precise GPS.";
  } else if (positionClass === "last_known") {
    explanation = "No current trustworthy fix is available. This is the last verified area and may no longer represent the phone's current position.";
  } else if (positionClass === "coarse") {
    explanation = "Only coarse position evidence is trustworthy, so the displayed area is intentionally broad.";
  } else if (positionClass === "estimated" || positionClass === "anchored") {
    explanation = "Brick is using fallback evidence and shows the uncertainty explicitly.";
  } else {
    explanation = "The phone currently has a trustworthy location fix; the uncertainty region is shown around it.";
  }
  if (deviceOffline) explanation += " The phone heartbeat is offline, so treat this as historical until new data arrives.";
  return explanation;
}

export function buildPhase7ParentPresentation(snapshot: Snapshot, now = Date.now()): Phase7PositionPresentation {
  const base = (snapshot.latest ?? snapshot.state ?? null) as BasePosition | null;
  const refined = snapshot.refinedState ?? null;
  const baseClass = normalizeClass(base?.quality);
  const refinedClass = normalizeClass(refined?.quality);
  const refinedLat = finiteNumber(refined?.latitude), refinedLon = finiteNumber(refined?.longitude);
  const canUseRefined = refinedLat !== null && refinedLon !== null && validLatLon(refinedLat, refinedLon) &&
    Boolean(refined) && (!base || (baseClass !== "precise" && baseClass !== "assisted"));

  const selectedClass = canUseRefined && refinedClass !== "unknown" ? refinedClass : baseClass;
  const latitude = canUseRefined ? refinedLat : (validLatLon(base?.lat, base?.lon) ? base!.lat as number : null);
  const longitude = canUseRefined ? refinedLon : (validLatLon(base?.lat, base?.lon) ? base!.lon as number : null);
  const selectedUncertainty = canUseRefined ? finiteNumber(refined?.uncertaintyM) : finiteNumber(base?.uncertaintyM);
  const uncertaintyM = selectedUncertainty === null ? null : Math.max(0, selectedUncertainty);
  const source = canUseRefined ? "external_refinement" : safeText(base?.source, base ? "phone" : "none");
  const corridor = parseCorridor(base?.routeCorridor);
  const refinedShape = canUseRefined ? safeText(refined?.shape, "possible_area") : null;
  const evidence = canUseRefined ? refinedEvidenceItems(refined!, source) : [];
  const fallbackEvidence = base ? baseEvidence(base, now) : null;
  if (!evidence.length && fallbackEvidence) evidence.push(fallbackEvidence);
  if (!canUseRefined && selectedClass === "estimated" && corridor.candidates.length) {
    evidence.push({
      id: "route-corridor",
      kind: "route",
      label: evidenceLabel("route"),
      explanation: `${corridor.candidates.length} plausible route corridor${corridor.candidates.length === 1 ? "" : "s"} constrain the estimate.`,
      ageMs: fallbackEvidence?.ageMs ?? null,
      radiusM: corridor.radiusM
    });
  }

  const conflicts = canUseRefined ? parseConflicts(refined?.conflicts) : [];
  const deviceOffline = safeText(snapshot.derived?.deviceStatus, "unknown").toLowerCase() === "offline";
  const geometry = geometryFor(selectedClass, latitude, longitude, uncertaintyM, refinedShape, corridor, canUseRefined);
  const evidenceAgeMs = freshestAge(evidence, canUseRefined ? null : base, now);
  const freshness = freshnessFor(evidenceAgeMs, snapshot.health?.trackingIntervalMs);
  const confidence = confidenceFor(selectedClass, uncertaintyM);
  const hasConflict = conflicts.length > 0;

  return {
    protocol: 1,
    positionClass: selectedClass,
    geometry,
    confidence,
    freshness,
    evidenceAgeMs,
    source,
    headline: `${displayClass(selectedClass)} position`,
    explanation: explanationFor(selectedClass, geometry.kind, canUseRefined, hasConflict, deviceOffline),
    evidence,
    conflicts,
    hasConflict,
    deviceOffline
  };
}

export async function augmentPhase7ParentStateResponse(response: Response, now = Date.now()): Promise<Response> {
  if (!response.ok) return response;
  const contentType = (response.headers.get("Content-Type") ?? "").toLowerCase();
  if (!contentType.includes("application/json")) return response;

  let body: unknown;
  try { body = await response.json(); } catch { return response; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return response;

  const object = body as Snapshot & Record<string, unknown>;
  const presentation = buildPhase7ParentPresentation(object, now);
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Brick-Position-Presentation", "phase7-v1");
  return new Response(JSON.stringify({ ...object, presentation }), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
