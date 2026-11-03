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
  let value: Record<string, unknown>;
  try { value = await req.clone().json<Record<string, unknown>>(); } catch { return null; }
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
  const detailJson = JSON.stringify(d);
  if (detailJson.length > 4096) return json({ error: "fall evidence bundle too large" }, 400);

  const existing = await env.DB.prepare("SELECT id FROM safety_events WHERE id=?1 AND device_id=?2").bind(eventId, deviceId).first();
  if (existing) return json({ ok: true, eventId, duplicate: true });

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
  const inserted = await env.DB.prepare(
    "INSERT OR IGNORE INTO safety_events(id,device_id,kind,device_created_at,server_created_at,latitude,longitude,accuracy_m,detail_json) VALUES(?1,?2,'fall_detected',?3,?4,?5,?6,?7,?8)"
  ).bind(eventId, deviceId, createdAt, now, lat, lon, accuracy, detailJson).run();
  if ((inserted.meta.changes ?? 0) !== 1) return json({ ok: true, eventId, duplicate: true });

  const realtime: RealtimeSafetyEvent = { id: eventId, kind: "fall_detected", deviceCreatedAt: createdAt, serverCreatedAt: now, latitude: lat, longitude: lon, accuracyM: accuracy, detail: d };
  await stub.pushSafetyEvent(realtime);
  await stub.commitSafetyHighWater(sequence);
  return json({ ok: true, eventId, confidence, duplicate: false });
}
