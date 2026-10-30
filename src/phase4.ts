import { activityName, type LivePacket } from "./protocol";

export type Phase4Env = { DB: D1Database; HISTORY: R2Bucket };

export type RealtimeSafetyEvent = {
  id: string;
  kind: string;
  deviceCreatedAt: number;
  serverCreatedAt: number;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  detail: Record<string, unknown>;
};

type Geofence = { id: string; name: string; latitude: number; longitude: number; radius_m: number; enabled: number };
type GeoState = { stable_state: string; candidate_state: string | null; candidate_since: number | null; candidate_count: number };
type Trip = {
  id: string;
  destination_name: string | null;
  destination_latitude: number | null;
  destination_longitude: number | null;
  destination_radius_m: number;
  expected_arrival_at: number | null;
  arrival_candidate_since: number | null;
  arrival_candidate_count: number;
  last_alert_at: number | null;
};

type StoredHistoryPoint = {
  epoch: number;
  sequence: number;
  wallTimeMs: number;
  trustedLatE7: number | null;
  trustedLonE7: number | null;
  uncertaintyCm: number;
  speedCms: number | null;
  speedAccuracyCms: number | null;
  bearingCdeg: number | null;
  batteryPct: number;
  charging: boolean;
  activity: number;
  activityConfidence: number;
  quality: number;
  source: number;
  fallback: boolean;
  rawAccepted: boolean;
};

function radians(v: number) { return v * Math.PI / 180; }
function distanceM(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6_371_000;
  const dLat = radians(bLat - aLat), dLon = radians(bLon - aLon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { "cache-control": "no-store" } }); }

async function internalEvent(
  env: Phase4Env,
  deviceId: string,
  kind: string,
  lat: number | null,
  lon: number | null,
  accuracyM: number | null,
  detail: Record<string, unknown>
): Promise<RealtimeSafetyEvent> {
  const now = Date.now(), id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO safety_events(id,device_id,kind,device_created_at,server_created_at,latitude,longitude,accuracy_m,detail_json) VALUES(?1,?2,?3,?4,?4,?5,?6,?7,?8)"
  ).bind(id, deviceId, kind, now, lat, lon, accuracyM, JSON.stringify(detail)).run();
  return { id, kind, deviceCreatedAt: now, serverCreatedAt: now, latitude: lat, longitude: lon, accuracyM, detail };
}

export async function evaluateSafety(env: Phase4Env, deviceId: string, packet: LivePacket): Promise<RealtimeSafetyEvent[]> {
  const generated: RealtimeSafetyEvent[] = [];
  if (packet.trustedLatE7 === null || packet.trustedLonE7 === null) return generated;
  const lat = packet.trustedLatE7 / 1e7, lon = packet.trustedLonE7 / 1e7, accuracyM = packet.uncertaintyCm / 100;
  if (!Number.isFinite(accuracyM) || accuracyM > 250) return generated;
  const now = Date.now();

  const fences = await env.DB.prepare(
    "SELECT id,name,latitude,longitude,radius_m,enabled FROM geofences WHERE device_id=?1 AND enabled=1"
  ).bind(deviceId).all<Geofence>();

  for (const g of fences.results) {
    const d = distanceM(lat, lon, g.latitude, g.longitude);
    const current = await env.DB.prepare(
      "SELECT stable_state,candidate_state,candidate_since,candidate_count FROM geofence_state WHERE geofence_id=?1"
    ).bind(g.id).first<GeoState>();
    const stable = current?.stable_state ?? "unknown";
    const enterThreshold = Math.max(25, g.radius_m - Math.min(30, g.radius_m * 0.15));
    const exitThreshold = g.radius_m + Math.max(25, g.radius_m * 0.20);
    const desired = stable === "inside" ? (d >= exitThreshold ? "outside" : "inside") : (d <= enterThreshold ? "inside" : "outside");

    if (stable === "unknown") {
      await env.DB.prepare(
        "INSERT OR REPLACE INTO geofence_state(geofence_id,device_id,stable_state,candidate_state,candidate_since,candidate_count,last_distance_m,updated_at) VALUES(?1,?2,?3,NULL,NULL,0,?4,?5)"
      ).bind(g.id, deviceId, desired, d, now).run();
      continue;
    }
    if (desired === stable) {
      await env.DB.prepare(
        "UPDATE geofence_state SET candidate_state=NULL,candidate_since=NULL,candidate_count=0,last_distance_m=?1,updated_at=?2 WHERE geofence_id=?3"
      ).bind(d, now, g.id).run();
      continue;
    }

    const same = current?.candidate_state === desired;
    const since = same && current?.candidate_since ? current.candidate_since : now;
    const count = same ? (current?.candidate_count ?? 0) + 1 : 1;
    if (count >= 2 && now - since >= 10_000) {
      await env.DB.prepare(
        "UPDATE geofence_state SET stable_state=?1,candidate_state=NULL,candidate_since=NULL,candidate_count=0,last_distance_m=?2,updated_at=?3 WHERE geofence_id=?4"
      ).bind(desired, d, now, g.id).run();
      generated.push(await internalEvent(env, deviceId, desired === "inside" ? "geofence_enter" : "geofence_exit", lat, lon, accuracyM, {
        geofenceId: g.id, name: g.name, distanceM: Math.round(d)
      }));
    } else {
      await env.DB.prepare(
        "UPDATE geofence_state SET candidate_state=?1,candidate_since=?2,candidate_count=?3,last_distance_m=?4,updated_at=?5 WHERE geofence_id=?6"
      ).bind(desired, since, count, d, now, g.id).run();
    }
  }

  const trip = await env.DB.prepare(
    "SELECT id,destination_name,destination_latitude,destination_longitude,destination_radius_m,expected_arrival_at,arrival_candidate_since,arrival_candidate_count,last_alert_at FROM trips WHERE device_id=?1 AND state='active' ORDER BY started_at DESC LIMIT 1"
  ).bind(deviceId).first<Trip>();
  if (!trip) return generated;

  if (trip.destination_latitude !== null && trip.destination_longitude !== null) {
    const d = distanceM(lat, lon, trip.destination_latitude, trip.destination_longitude);
    if (d <= trip.destination_radius_m) {
      const since = trip.arrival_candidate_since ?? now, count = (trip.arrival_candidate_count ?? 0) + 1;
      if (count >= 2 && now - since >= 10_000) {
        await env.DB.prepare(
          "UPDATE trips SET state='arrived',ended_at=?1,arrival_candidate_since=NULL,arrival_candidate_count=0 WHERE id=?2 AND state='active'"
        ).bind(now, trip.id).run();
        generated.push(await internalEvent(env, deviceId, "trip_ended", lat, lon, accuracyM, {
          tripId: trip.id, reason: "arrived", destination: trip.destination_name, distanceM: Math.round(d)
        }));
      } else {
        await env.DB.prepare("UPDATE trips SET arrival_candidate_since=?1,arrival_candidate_count=?2 WHERE id=?3")
          .bind(since, count, trip.id).run();
      }
    } else if (trip.arrival_candidate_count > 0) {
      await env.DB.prepare("UPDATE trips SET arrival_candidate_since=NULL,arrival_candidate_count=0 WHERE id=?1").bind(trip.id).run();
    }
  }

  if (trip.expected_arrival_at && now > trip.expected_arrival_at + 10 * 60_000 && (!trip.last_alert_at || now - trip.last_alert_at > 30 * 60_000)) {
    await env.DB.prepare("UPDATE trips SET last_alert_at=?1 WHERE id=?2").bind(now, trip.id).run();
    generated.push(await internalEvent(env, deviceId, "trip_alert", lat, lon, accuracyM, {
      tripId: trip.id, reason: "overdue", destination: trip.destination_name
    }));
  }
  return generated;
}

export async function createGeofence(req: Request, env: Phase4Env, deviceId: string) {
  const b: Record<string, unknown> = await req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 64) : "";
  const lat = Number(b.latitude), lon = Number(b.longitude), radius = Number(b.radiusM);
  if (!name || !Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180 || !Number.isFinite(radius) || radius < 25 || radius > 5000) {
    return json({ error: "invalid geofence" }, 400);
  }
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO geofences(id,device_id,name,latitude,longitude,radius_m,enabled,created_at) VALUES(?1,?2,?3,?4,?5,?6,1,?7)"
  ).bind(id, deviceId, name, lat, lon, radius, Date.now()).run();
  return json({ id, name, latitude: lat, longitude: lon, radiusM: radius, enabled: true });
}

export async function listGeofences(env: Phase4Env, deviceId: string) {
  const r = await env.DB.prepare(
    "SELECT id,name,latitude,longitude,radius_m,enabled,created_at FROM geofences WHERE device_id=?1 ORDER BY created_at"
  ).bind(deviceId).all();
  return json({ geofences: r.results });
}

export async function updateGeofence(req: Request, env: Phase4Env, deviceId: string, geofenceId: string) {
  const current = await env.DB.prepare(
    "SELECT id,name,latitude,longitude,radius_m,enabled FROM geofences WHERE id=?1 AND device_id=?2"
  ).bind(geofenceId, deviceId).first<Geofence>();
  if (!current) return json({ error: "geofence not found" }, 404);
  const b: Record<string, unknown> = await req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 64) : current.name;
  const lat = b.latitude === undefined ? current.latitude : Number(b.latitude);
  const lon = b.longitude === undefined ? current.longitude : Number(b.longitude);
  const radius = b.radiusM === undefined ? current.radius_m : Number(b.radiusM);
  const enabled = b.enabled === undefined ? current.enabled : (b.enabled === true ? 1 : b.enabled === false ? 0 : -1);
  if (!name || !Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180 || !Number.isFinite(radius) || radius < 25 || radius > 5000 || enabled < 0) {
    return json({ error: "invalid geofence" }, 400);
  }
  await env.DB.batch([
    env.DB.prepare("UPDATE geofences SET name=?1,latitude=?2,longitude=?3,radius_m=?4,enabled=?5 WHERE id=?6 AND device_id=?7")
      .bind(name, lat, lon, radius, enabled, geofenceId, deviceId),
    env.DB.prepare("DELETE FROM geofence_state WHERE geofence_id=?1").bind(geofenceId)
  ]);
  return json({ id: geofenceId, name, latitude: lat, longitude: lon, radiusM: radius, enabled: enabled === 1 });
}

export async function deleteGeofence(env: Phase4Env, deviceId: string, geofenceId: string) {
  const r = await env.DB.prepare("DELETE FROM geofences WHERE id=?1 AND device_id=?2").bind(geofenceId, deviceId).run();
  if ((r.meta.changes ?? 0) === 0) return json({ error: "geofence not found" }, 404);
  await env.DB.prepare("DELETE FROM geofence_state WHERE geofence_id=?1").bind(geofenceId).run();
  return json({ ok: true });
}

export async function startTrip(req: Request, env: Phase4Env, deviceId: string): Promise<Response> {
  const existing = await env.DB.prepare("SELECT id FROM trips WHERE device_id=?1 AND state='active' LIMIT 1").bind(deviceId).first();
  if (existing) return json({ error: "an active trip already exists; end or cancel it first" }, 409);

  const b: Record<string, unknown> = await req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const name = typeof b.destinationName === "string" ? b.destinationName.trim().slice(0, 80) : "Destination";
  const lat = Number(b.latitude), lon = Number(b.longitude);
  const expected = b.expectedArrivalAt == null ? null : Number(b.expectedArrivalAt);
  const radius = b.radiusM == null ? 120 : Number(b.radiusM);
  const now = Date.now();
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180 || !Number.isFinite(radius) || radius < 50 || radius > 1000 ||
    (expected !== null && (!Number.isFinite(expected) || expected < now - 60_000 || expected > now + 30 * 86_400_000))) {
    return json({ error: "invalid trip" }, 400);
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO trips(id,device_id,state,destination_name,destination_latitude,destination_longitude,destination_radius_m,expected_arrival_at,started_at) VALUES(?1,?2,'active',?3,?4,?5,?6,?7,?8)"
  ).bind(id, deviceId, name || "Destination", lat, lon, radius, expected, now).run();
  const event = await internalEvent(env, deviceId, "trip_started", lat, lon, null, { tripId: id, destination: name || "Destination" });
  return json({ id, state: "active", event });
}

export async function finishTrip(env: Phase4Env, deviceId: string, tripId: string, reason: "cancelled" | "ended") {
  const trip = await env.DB.prepare(
    "SELECT id,destination_name FROM trips WHERE id=?1 AND device_id=?2 AND state='active'"
  ).bind(tripId, deviceId).first<{ id: string; destination_name: string | null }>();
  if (!trip) return json({ error: "active trip not found" }, 404);
  const now = Date.now(), state = reason === "cancelled" ? "cancelled" : "ended";
  await env.DB.prepare("UPDATE trips SET state=?1,ended_at=?2 WHERE id=?3 AND device_id=?4 AND state='active'")
    .bind(state, now, tripId, deviceId).run();
  const event = await internalEvent(env, deviceId, "trip_ended", null, null, null, {
    tripId, reason, destination: trip.destination_name
  });
  return json({ id: tripId, state, event });
}

export async function listTrips(env: Phase4Env, deviceId: string) {
  const r = await env.DB.prepare(
    "SELECT id,state,destination_name,destination_latitude,destination_longitude,destination_radius_m,expected_arrival_at,started_at,ended_at,last_alert_at FROM trips WHERE device_id=?1 ORDER BY started_at DESC LIMIT 100"
  ).bind(deviceId).all();
  return json({ trips: r.results });
}

async function readHistoryPrefix(env: Phase4Env, prefixRoot: string, days: string[], start: number, end: number, maxPoints: number): Promise<StoredHistoryPoint[]> {
  const points: StoredHistoryPoint[] = [];
  for (const day of days) {
    let cursor: string | undefined;
    do {
      const list = await env.HISTORY.list({ prefix: `${prefixRoot}/${day}/`, cursor, limit: 1000 });
      for (const o of list.objects) {
        const obj = await env.HISTORY.get(o.key); if (!obj) continue;
        const row = await obj.json<{ points?: StoredHistoryPoint[]; packet?: StoredHistoryPoint }>();
        const candidates = Array.isArray(row.points) ? row.points : row.packet ? [row.packet] : [];
        for (const p of candidates) {
          if (typeof p.wallTimeMs === "number" && p.wallTimeMs >= start && p.wallTimeMs <= end) points.push(p);
          if (points.length >= maxPoints) break;
        }
        if (points.length >= maxPoints) break;
      }
      cursor = list.truncated ? list.cursor : undefined;
    } while (cursor && points.length < maxPoints);
    if (points.length >= maxPoints) break;
  }
  return points;
}

function summarize(points: StoredHistoryPoint[]) {
  if (!points.length) return { distanceM: 0, durationMs: 0, movingTimeMs: 0, averageMovingKph: 0, maxTrustedKph: 0, modes: [] as string[], stops: [] as { start: number; end: number; durationMs: number }[] };
  let distance = 0, movingTime = 0, maxTrustedKph = 0;
  const modes: string[] = [], stops: { start: number; end: number; durationMs: number }[] = [];
  let stationaryStart: number | null = null;
  const addMode = (name: string) => { if (name !== "unknown" && modes[modes.length - 1] !== name) modes.push(name); };

  for (let i = 0; i < points.length; i++) {
    const p = points[i], mode = activityName(p.activity);
    addMode(mode);
    const kph = p.speedCms === null ? null : p.speedCms * 0.036;
    if (kph !== null && p.rawAccepted && !p.fallback) maxTrustedKph = Math.max(maxTrustedKph, kph);
    if (mode === "stationary") {
      stationaryStart ??= p.wallTimeMs;
    } else if (stationaryStart !== null) {
      const duration = p.wallTimeMs - stationaryStart;
      if (duration >= 5 * 60_000) stops.push({ start: stationaryStart, end: p.wallTimeMs, durationMs: duration });
      stationaryStart = null;
    }
    if (i === 0) continue;
    const prev = points[i - 1], dt = p.wallTimeMs - prev.wallTimeMs;
    if (dt <= 0 || dt > 15 * 60_000) continue;
    const moving = mode !== "stationary" || (kph !== null && kph >= 1);
    if (moving) movingTime += dt;
    if (prev.trustedLatE7 === null || prev.trustedLonE7 === null || p.trustedLatE7 === null || p.trustedLonE7 === null) continue;
    const segment = distanceM(prev.trustedLatE7 / 1e7, prev.trustedLonE7 / 1e7, p.trustedLatE7 / 1e7, p.trustedLonE7 / 1e7);
    const plausibleMax = Math.max(500, dt / 1000 * 100 + (prev.uncertaintyCm + p.uncertaintyCm) / 100);
    if (segment <= plausibleMax) distance += segment;
  }
  if (stationaryStart !== null) {
    const end = points[points.length - 1].wallTimeMs, duration = end - stationaryStart;
    if (duration >= 5 * 60_000) stops.push({ start: stationaryStart, end, durationMs: duration });
  }
  const durationMs = points[points.length - 1].wallTimeMs - points[0].wallTimeMs;
  const averageMovingKph = movingTime > 0 ? (distance / (movingTime / 1000)) * 3.6 : 0;
  return { distanceM: Math.round(distance), durationMs, movingTimeMs: movingTime, averageMovingKph, maxTrustedKph, modes, stops };
}

export async function history(env: Phase4Env, deviceId: string, fromMs: number, toMs: number) {
  const start = Math.max(0, fromMs), end = Math.min(Date.now() + 86_400_000, toMs);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 31 * 86_400_000) return json({ error: "invalid history range" }, 400);
  const safe = deviceId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const days: string[] = [];
  for (let t = new Date(start).setUTCHours(0, 0, 0, 0); t <= end; t += 86_400_000) days.push(new Date(t).toISOString().slice(0, 10));

  let points = await readHistoryPrefix(env, `history/trusted/${safe}`, days, start, end, 20_000);
  if (!points.length) points = await readHistoryPrefix(env, `history/${safe}`, days, start, end, 20_000);
  points.sort((a, b) => a.wallTimeMs - b.wallTimeMs || a.sequence - b.sequence);
  const deduped: StoredHistoryPoint[] = [];
  let previousKey = "";
  for (const p of points) {
    const key = `${p.epoch}:${p.sequence}`;
    if (key !== previousKey) deduped.push(p);
    previousKey = key;
  }
  return json({ points: deduped, truncated: deduped.length >= 20_000, summary: summarize(deduped) });
}

export async function runRetentionCleanup(env: Phase4Env) {
  const now = Date.now();
  await env.DB.prepare(
    "DELETE FROM safety_events WHERE server_created_at < (?1 - COALESCE((SELECT safety_event_days FROM retention_settings WHERE device_id=safety_events.device_id),180) * 86400000)"
  ).bind(now).run();
  await env.DB.prepare("DELETE FROM pairing_tokens WHERE expires_at < ?1").bind(now - 86_400_000).run();
  await env.DB.prepare("DELETE FROM device_events WHERE created_at < ?1").bind(now - 30 * 86_400_000).run();
}
