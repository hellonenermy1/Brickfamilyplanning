import { persistActiveSafetyEvent, validSafetyCoordinates } from "./safety-event-write";
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

  const existing = await env.DB.prepare("SELECT id,kind FROM safety_events WHERE id=?1 AND device_id=?2").bind(eventId, deviceId).first<{ id: string; kind: string }>();
  if (existing) {
    const life = await env.DB.prepare("SELECT revoked_at FROM devices WHERE id=?1").bind(deviceId).first<{ revoked_at: number | null }>();
    if (!life || life.revoked_at !== null) return json({ error: "device unauthorized" }, 401);
    if (existing.kind !== "fall_detected") return json({ error: "safety event identity conflict" }, 409);
    return json({ ok: true, eventId, duplicate: true });
  }

  const stub = env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(deviceId));
  const highWater = await stub.readSafetyHighWater();
  if (sequence <= highWater) return json({ error: "replayed or out-of-order safety event" }, 409);

  // Queue durability is required before ACK, exactly like other critical safety events. LOW/MEDIUM
  // also use the queue because the evidence bundle is small and safety-relevant.
  try { await env.EVENTS.send({ type: "safety_receipt", deviceId, eventId, kind: "fall_detected", createdAtMs: createdAt }); }
  catch { return json({ error: "safety durability queue unavailable" }, 503); }

  const lat = typeof value.latitude === "number" && Number.isFinite(value.latitude) && value.latitude >= -90 && value.latitude <= 90 ? value.latitude : null;
  const lon = typeof value.longitude === "number" && Number.isFinite(value.longitude) && value.longitude >= -180 && value.longitude <= 180 ? value.longitude : null;
  const accuracy = typeof value.accuracyM === "number" && Number.isFinite(value.accuracyM) && value.accuracyM >= 0 && value.accuracyM <= 100_000 ? value.accuracyM : null;
  const now = Date.now();
  const outcome = await persistActiveSafetyEvent(env.DB, {
    id: eventId, deviceId, kind: "fall_detected", deviceCreatedAt: createdAt, serverCreatedAt: now,
    latitude: lat, longitude: lon, accuracyM: accuracy, detailJson
  });
  if (outcome === "revoked") return json({ error: "device unauthorized" }, 401);
  if (outcome === "conflict") return json({ error: "safety event identity conflict" }, 409);
  if (outcome === "duplicate") return json({ ok: true, eventId, duplicate: true });

  const realtime: RealtimeSafetyEvent = { id: eventId, kind: "fall_detected", deviceCreatedAt: createdAt, serverCreatedAt: now, latitude: lat, longitude: lon, accuracyM: accuracy, detail: d };
  await stub.pushSafetyEvent(realtime);
  await stub.commitSafetyHighWater(sequence);
  return json({ ok: true, eventId, confidence, duplicate: false });
}
