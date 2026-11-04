import { persistActiveSafetyEvent, checkSafetyEventIdentity, validSafetyCoordinates } from "./safety-event-write";
import { readBoundedBody } from "./bounded-body";
import { validateSafetyReplayWindow } from "./device-json-security";
import type { BrickDevice, RealtimeSafetyEvent } from "./device-do";

export type FallEventEnv = {
  DB: D1Database;
  EVENTS: Queue;
  BRICK_DEVICE: DurableObjectNamespace<BrickDevice>;
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function maybeHandleFallEvent(req: Request, env: FallEventEnv, deviceId: string): Promise<Response | null> {
  // Bound even an unsigned request before parsing. A forged, chunked multi-MB fall
  // event cannot make the Worker buffer an arbitrary body ahead of signature checks.
  const bounded = await readBoundedBody(req.clone(), 8192);
  if (!bounded.ok) return json({ error: "fall event body too large or unreadable" }, bounded.reason === "too_large" ? 413 : 400);
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder().decode(bounded.body)); }
  catch { return json({ error: "invalid event JSON" }, 400); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ error: "invalid event JSON object" }, 400);
  const value = parsed as Record<string, unknown>;
  if (value.kind !== "fall_detected") return null;

  const denied = await validateSafetyReplayWindow(req, env, deviceId);
  if (denied) return denied;
  const eventId = value.eventId, sequence = value.eventSequence, createdAt = value.createdAtMs, detail = value.detail;
  if (typeof eventId !== "string" || typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence <= 0 ||
      typeof createdAt !== "number" || !Number.isSafeInteger(createdAt) || !detail || typeof detail !== "object" || Array.isArray(detail)) {
    return json({ error: "invalid fall event" }, 400);
  }
  const d = detail as Record<string, unknown>;
  const confidence = d.confidence;
  if (confidence !== "low" && confidence !== "medium" && confidence !== "high") return json({ error: "invalid fall confidence" }, 400);
  if (!validSafetyCoordinates(value)) return json({ error: "invalid fall coordinates" }, 400);
  const detailJson = JSON.stringify(d);
  if (detailJson.length > 4096) return json({ error: "fall evidence bundle too large" }, 400);

  const now = Date.now();
  const lat = typeof value.latitude === "number" ? value.latitude : null;
  const lon = typeof value.longitude === "number" ? value.longitude : null;
  const accuracy = typeof value.accuracyM === "number" ? value.accuracyM : null;
  const write = { id: eventId, deviceId, kind: "fall_detected", deviceCreatedAt: createdAt, serverCreatedAt: now,
    latitude: lat, longitude: lon, accuracyM: accuracy, detailJson };
  const identity = await checkSafetyEventIdentity(env.DB, write);
  if (identity === "revoked") return json({ error: "device unauthorized" }, 401);
  if (identity === "conflict") return json({ error: "safety event identity conflict" }, 409);
  if (identity === "duplicate") return json({ ok: true, eventId, duplicate: true });

  const stub = env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(deviceId));
  // SafetyOutbox sends by priority, not sequence. An unseen, correctly signed
  // older UUID inside the allowed window must not be discarded by a DO maximum.
  // UUID + immutable persisted event content is the retry identity; this counter
  // remains diagnostic and must not become a global arrival-order requirement.

  // Queue durability is required before ACK, exactly like other critical safety events. LOW/MEDIUM
  // also use the queue because the evidence bundle is small and safety-relevant.
  try { await env.EVENTS.send({ type: "safety_receipt", deviceId, eventId, kind: "fall_detected", createdAtMs: createdAt }); }
  catch { return json({ error: "safety durability queue unavailable" }, 503); }

  const outcome = await persistActiveSafetyEvent(env.DB, write);
  if (outcome === "revoked") return json({ error: "device unauthorized" }, 401);
  if (outcome === "conflict") return json({ error: "safety event identity conflict" }, 409);
  if (outcome === "duplicate") return json({ ok: true, eventId, duplicate: true });

  const realtime: RealtimeSafetyEvent = { id: eventId, kind: "fall_detected", deviceCreatedAt: createdAt, serverCreatedAt: now, latitude: lat, longitude: lon, accuracyM: accuracy, detail: d };
  await stub.pushSafetyEvent(realtime);
  await stub.commitSafetyHighWater(sequence);
  return json({ ok: true, eventId, confidence, duplicate: false });
}
