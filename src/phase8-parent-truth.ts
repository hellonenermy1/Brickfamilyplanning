type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function age(now: number, timestamp: unknown): number | null {
  const value = finite(timestamp);
  return value === null ? null : Math.max(0, now - value);
}

/**
 * A packet can be received now even though it was captured hours/days earlier while the phone was
 * offline. Freshness must therefore be conservative across BOTH clocks. The older of event-time and
 * receive-time wins; a newly delivered backlog record can never become "fresh" merely because the
 * server saw it a moment ago.
 */
export function conservativePositionAgeMs(state: unknown, now = Date.now()): number | null {
  const s = object(state);
  if (!s) return null;
  const ages = [age(now, s.wallTimeMs), age(now, s.receivedAt)].filter((v): v is number => v !== null);
  return ages.length ? Math.max(...ages) : null;
}

export function classifyPositionFreshness(ageMs: number | null, trackingIntervalMs: unknown) {
  if (ageMs === null) return "unknown" as const;
  const rawInterval = finite(trackingIntervalMs) ?? 5_000;
  const interval = Math.max(1_000, Math.min(300_000, rawInterval));
  const staleAt = Math.max(60_000, interval * 3 + 30_000);
  const freshAt = Math.max(15_000, Math.min(staleAt / 2, interval * 1.5 + 5_000));
  if (ageMs <= freshAt) return "fresh" as const;
  if (ageMs <= staleAt) return "aging" as const;
  return "stale" as const;
}

function presentationMatchesBase(presentation: JsonObject, base: JsonObject | null) {
  if (!base) return true;
  const basis = object(presentation.basis);
  if (!basis) return false;
  const pEpoch = finite(basis.epoch), pSequence = finite(basis.sequence);
  const bEpoch = finite(base.epoch), bSequence = finite(base.sequence);
  if (pEpoch !== null && pSequence !== null && bEpoch !== null && bSequence !== null) {
    return pEpoch === bEpoch && pSequence === bSequence;
  }
  const pReceived = finite(basis.receivedAt), bReceived = finite(base.receivedAt);
  return pReceived !== null && bReceived !== null && pReceived === bReceived;
}

function ensureOfflineExplanation(explanation: unknown) {
  const text = typeof explanation === "string" && explanation.trim()
    ? explanation.trim()
    : "Brick is showing the latest trustworthy position evidence available.";
  return /offline|historical/i.test(text)
    ? text
    : `${text} The phone heartbeat is offline, so treat this as historical until new data arrives.`;
}

/**
 * Final Phase 8 parent truth layer. It consumes the normalized Phase 7 presentation and makes the
 * production read model conservative about delayed backlog, heartbeat loss and stale coordinates.
 * Raw latest/state evidence is left untouched for diagnostics/history; only the claims presented to
 * a parent are tightened.
 */
export async function augmentPhase8ParentTruth(response: Response, now = Date.now()): Promise<Response> {
  if (!response.ok) return response;
  const contentType = (response.headers.get("Content-Type") ?? "").toLowerCase();
  if (!contentType.includes("application/json")) return response;

  let body: JsonObject;
  try { body = await response.json<JsonObject>(); }
  catch { return response; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return response;

  const base = object(body.latest) ?? object(body.state);
  const health = object(body.health);
  const presentation = object(body.presentation);
  const derivedExisting = object(body.derived) ?? {};

  const captureAgeMs = conservativePositionAgeMs(base, now);
  const receiveAgeMs = base ? age(now, base.receivedAt) : null;
  const eventAgeMs = base ? age(now, base.wallTimeMs) : null;
  const trackingIntervalMs = health?.trackingIntervalMs;
  const baseFreshness = classifyPositionFreshness(captureAgeMs, trackingIntervalMs);

  // External refinements have their own evidence ages. For a phone-derived presentation, however,
  // event-time must dominate freshness so delayed offline history cannot masquerade as current.
  if (presentation && presentationMatchesBase(presentation, base) && presentation.source !== "external_refinement") {
    presentation.evidenceAgeMs = captureAgeMs;
    presentation.freshness = baseFreshness;
    const evidence = Array.isArray(presentation.evidence) ? presentation.evidence as unknown[] : [];
    presentation.evidence = evidence.map(item => {
      const e = object(item);
      return e && e.kind === "device" ? { ...e, ageMs: captureAgeMs } : item;
    });
  }

  const healthAgeMs = health ? age(now, health.receivedAt) : null;
  const explicitOffline = String(derivedExisting.deviceStatus ?? "").toLowerCase() === "offline";
  const deviceOffline = explicitOffline || (healthAgeMs !== null && healthAgeMs > 75_000);
  if (presentation && deviceOffline) {
    presentation.deviceOffline = true;
    presentation.explanation = ensureOfflineExplanation(presentation.explanation);
  }

  const geometry = object(presentation?.geometry);
  const presentationFreshness = typeof presentation?.freshness === "string"
    ? presentation.freshness
    : baseFreshness;
  const noPosition = !presentation || presentation.positionClass === "unknown" || geometry?.kind === "NONE";
  const positionStatus = noPosition || presentationFreshness === "unknown"
    ? "unavailable"
    : deviceOffline || presentationFreshness !== "fresh"
      ? "stale"
      : "fresh";

  const operationalStatus = String(health?.operationalStatus ?? "").toLowerCase();
  const deviceStatus = deviceOffline
    ? "offline"
    : healthAgeMs === null
      ? String(derivedExisting.deviceStatus ?? "unknown")
      : operationalStatus === "degraded"
        ? "degraded"
        : "healthy";

  const derived = {
    ...derivedExisting,
    deviceStatus,
    positionStatus,
    captureAgeMs,
    eventAgeMs,
    receiveAgeMs,
    healthAgeMs,
    freshness: presentationFreshness
  };

  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Brick-Parent-Truth", "phase8-v1");
  return new Response(JSON.stringify({ ...body, presentation, derived }), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
