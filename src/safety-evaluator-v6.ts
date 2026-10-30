import type { BrickDevice } from "./device-do";
import type { LivePacket } from "./protocol";

export type SafetyEvalEnv = {
  DB: D1Database;
  BRICK_DEVICE: DurableObjectNamespace<BrickDevice>;
};

export type GeneratedSafetyEvent = {
  id: string;
  kind: string;
  deviceCreatedAt: number;
  serverCreatedAt: number;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  detail: Record<string, unknown>;
};

type DeviceHighWater = { last_epoch: number; last_sequence: number };
type Geofence = { id: string; name: string; latitude: number; longitude: number; radius_m: number; enabled: number };
type GeoState = {
  stable_state: string;
  candidate_state: string | null;
  candidate_since: number | null;
  candidate_count: number;
  last_epoch: number;
  last_sequence: number;
};
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
  stationary_since: number | null;
  last_stop_alert_at: number | null;
  last_eval_epoch: number;
  last_eval_sequence: number;
  last_distance_to_destination_m: number | null;
  last_location_at: number | null;
};

type EventRecord = { event: GeneratedSafetyEvent; statement: D1PreparedStatement };

const TRIP_IDLE_CHECKPOINT_MS = 60_000;

function radians(v: number) { return v * Math.PI / 180; }
function distanceM(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6_371_000;
  const dLat = radians(bLat - aLat), dLon = radians(bLon - aLon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function orderAtLeast(epoch: number, sequence: number, otherEpoch: number, otherSequence: number) {
  return epoch > otherEpoch || (epoch === otherEpoch && sequence >= otherSequence);
}
async function deterministicId(key: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)));
  return "srv_" + Array.from(digest.slice(0, 16), b => b.toString(16).padStart(2, "0")).join("");
}
async function eventRecord(
  env: SafetyEvalEnv,
  deviceId: string,
  kind: string,
  lat: number | null,
  lon: number | null,
  accuracyM: number | null,
  detail: Record<string, unknown>,
  dedupeKey: string
): Promise<EventRecord> {
  const now = Date.now();
  const id = await deterministicId(dedupeKey);
  return {
    event: { id, kind, deviceCreatedAt: now, serverCreatedAt: now, latitude: lat, longitude: lon, accuracyM, detail },
    statement: env.DB.prepare(
      "INSERT OR IGNORE INTO safety_events(id,device_id,kind,device_created_at,server_created_at,latitude,longitude,accuracy_m,detail_json) " +
      "VALUES(?1,?2,?3,?4,?4,?5,?6,?7,?8)"
    ).bind(id, deviceId, kind, now, lat, lon, accuracyM, JSON.stringify(detail))
  };
}

async function isNewestReceived(env: SafetyEvalEnv, deviceId: string, packet: LivePacket) {
  const row = await env.DB.prepare("SELECT last_epoch,last_sequence FROM devices WHERE id=?1 AND revoked_at IS NULL")
    .bind(deviceId).first<DeviceHighWater>();
  if (!row) return false;
  return packet.epoch === row.last_epoch && packet.sequence === row.last_sequence;
}

export async function evaluateSafetyV6(env: SafetyEvalEnv, deviceId: string, packet: LivePacket): Promise<GeneratedSafetyEvent[]> {
  const generated: GeneratedSafetyEvent[] = [];
  if (packet.trustedLatE7 === null || packet.trustedLonE7 === null) return generated;
  const accuracyM = packet.uncertaintyCm / 100;
  if (!Number.isFinite(accuracyM) || accuracyM > 250) return generated;
  if (!(await isNewestReceived(env, deviceId, packet))) return generated;

  const lat = packet.trustedLatE7 / 1e7;
  const lon = packet.trustedLonE7 / 1e7;
  const now = Date.now();

  const fences = await env.DB.prepare(
    "SELECT id,name,latitude,longitude,radius_m,enabled FROM geofences WHERE device_id=?1 AND enabled=1"
  ).bind(deviceId).all<Geofence>();

  for (const g of fences.results) {
    const d = distanceM(lat, lon, g.latitude, g.longitude);
    const current = await env.DB.prepare(
      "SELECT stable_state,candidate_state,candidate_since,candidate_count,last_epoch,last_sequence FROM geofence_state WHERE geofence_id=?1"
    ).bind(g.id).first<GeoState>();
    if (current && orderAtLeast(current.last_epoch, current.last_sequence, packet.epoch, packet.sequence)) continue;

    const stable = current?.stable_state ?? "unknown";
    const enter = Math.max(25, g.radius_m - Math.min(30, g.radius_m * 0.15));
    const exit = g.radius_m + Math.max(25, g.radius_m * 0.20);
    const desired = stable === "inside" ? (d >= exit ? "outside" : "inside") : (d <= enter ? "inside" : "outside");

    if (!current || stable === "unknown") {
      await env.DB.prepare(
        "INSERT OR REPLACE INTO geofence_state(geofence_id,device_id,stable_state,candidate_state,candidate_since,candidate_count,last_distance_m,updated_at,last_epoch,last_sequence) " +
        "VALUES(?1,?2,?3,NULL,NULL,0,?4,?5,?6,?7)"
      ).bind(g.id, deviceId, desired, d, now, packet.epoch, packet.sequence).run();
      continue;
    }

    if (desired === stable) {
      // Stable state is intentionally write-free. Only clear a pending candidate if one exists.
      if (current.candidate_state !== null || current.candidate_count !== 0) {
        await env.DB.prepare(
          "UPDATE geofence_state SET candidate_state=NULL,candidate_since=NULL,candidate_count=0,last_distance_m=?1,updated_at=?2,last_epoch=?3,last_sequence=?4 " +
          "WHERE geofence_id=?5"
        ).bind(d, now, packet.epoch, packet.sequence, g.id).run();
      }
      continue;
    }

    const same = current.candidate_state === desired;
    const since = same && current.candidate_since ? current.candidate_since : now;
    const count = same ? current.candidate_count + 1 : 1;
    if (count >= 2 && now - since >= 10_000) {
      const record = await eventRecord(
        env, deviceId, desired === "inside" ? "geofence_enter" : "geofence_exit", lat, lon, accuracyM,
        { geofenceId: g.id, name: g.name, distanceM: Math.round(d) },
        `${deviceId}|gf|${g.id}|${packet.epoch}|${packet.sequence}|${desired}`
      );
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE geofence_state SET stable_state=?1,candidate_state=NULL,candidate_since=NULL,candidate_count=0,last_distance_m=?2,updated_at=?3,last_epoch=?4,last_sequence=?5 WHERE geofence_id=?6"
        ).bind(desired, d, now, packet.epoch, packet.sequence, g.id),
        record.statement
      ]);
      generated.push(record.event);
    } else {
      await env.DB.prepare(
        "UPDATE geofence_state SET candidate_state=?1,candidate_since=?2,candidate_count=?3,last_distance_m=?4,updated_at=?5,last_epoch=?6,last_sequence=?7 WHERE geofence_id=?8"
      ).bind(desired, since, count, d, now, packet.epoch, packet.sequence, g.id).run();
    }
  }

  const trip = await env.DB.prepare(
    "SELECT id,destination_name,destination_latitude,destination_longitude,destination_radius_m,expected_arrival_at,arrival_candidate_since,arrival_candidate_count,last_alert_at,stationary_since,last_stop_alert_at,last_eval_epoch,last_eval_sequence,last_distance_to_destination_m,last_location_at " +
    "FROM trips WHERE device_id=?1 AND state='active' ORDER BY started_at DESC LIMIT 1"
  ).bind(deviceId).first<Trip>();
  if (!trip) return generated;

  let dist: number | null = null;
  let arrivalSince = trip.arrival_candidate_since;
  let arrivalCount = trip.arrival_candidate_count;
  let stationarySince = trip.stationary_since;
  let lastAlert = trip.last_alert_at;
  let lastStop = trip.last_stop_alert_at;
  let state = "active";
  let endedAt: number | null = null;
  const events: EventRecord[] = [];

  const before = {
    arrivalSince, arrivalCount, stationarySince, lastAlert, lastStop, state
  };

  if (trip.destination_latitude !== null && trip.destination_longitude !== null) {
    dist = distanceM(lat, lon, trip.destination_latitude, trip.destination_longitude);
    if (dist <= trip.destination_radius_m) {
      arrivalSince ??= now;
      arrivalCount++;
      if (arrivalCount >= 2 && now - arrivalSince >= 10_000) {
        state = "arrived";
        endedAt = now;
        arrivalSince = null;
        arrivalCount = 0;
        stationarySince = null;
        events.push(await eventRecord(
          env, deviceId, "trip_ended", lat, lon, accuracyM,
          { tripId: trip.id, reason: "arrived", destination: trip.destination_name, distanceM: Math.round(dist) },
          `${deviceId}|trip|${trip.id}|${packet.epoch}|${packet.sequence}|arrived`
        ));
      }
    } else {
      arrivalSince = null;
      arrivalCount = 0;
    }
  }

  if (state === "active") {
    const stationary = packet.activity === 1;
    const away = dist === null || dist > trip.destination_radius_m * 1.5;
    if (stationary && away) {
      stationarySince ??= now;
      if (now - stationarySince >= 600_000 && (!lastStop || now - lastStop >= 1_800_000)) {
        lastStop = now;
        events.push(await eventRecord(
          env, deviceId, "trip_alert", lat, lon, accuracyM,
          { tripId: trip.id, reason: "prolonged_stop", destination: trip.destination_name, stoppedMinutes: Math.floor((now - stationarySince) / 60_000), distanceToDestinationM: dist === null ? null : Math.round(dist) },
          `${deviceId}|trip|${trip.id}|${packet.epoch}|${packet.sequence}|stop`
        ));
      }
    } else {
      stationarySince = null;
    }
    if (trip.expected_arrival_at && now > trip.expected_arrival_at + 600_000 && (!lastAlert || now - lastAlert > 1_800_000)) {
      lastAlert = now;
      events.push(await eventRecord(
        env, deviceId, "trip_alert", lat, lon, accuracyM,
        { tripId: trip.id, reason: "overdue", destination: trip.destination_name, distanceToDestinationM: dist === null ? null : Math.round(dist) },
        `${deviceId}|trip|${trip.id}|${packet.epoch}|${packet.sequence}|overdue`
      ));
    }
  }

  const meaningfulChange = state !== before.state ||
    arrivalSince !== before.arrivalSince || arrivalCount !== before.arrivalCount ||
    stationarySince !== before.stationarySince || lastAlert !== before.lastAlert || lastStop !== before.lastStop ||
    events.length > 0;
  const checkpointDue = trip.last_location_at === null || now - trip.last_location_at >= TRIP_IDLE_CHECKPOINT_MS;

  if (meaningfulChange || checkpointDue) {
    const statements: D1PreparedStatement[] = [
      env.DB.prepare(
        "UPDATE trips SET state=?1,ended_at=COALESCE(?2,ended_at),arrival_candidate_since=?3,arrival_candidate_count=?4,last_alert_at=?5,stationary_since=?6,last_stop_alert_at=?7,last_eval_epoch=?8,last_eval_sequence=?9,last_distance_to_destination_m=?10,last_location_at=?11 " +
        "WHERE id=?12 AND state='active'"
      ).bind(state, endedAt, arrivalSince, arrivalCount, lastAlert, stationarySince, lastStop, packet.epoch, packet.sequence, dist, now, trip.id),
      ...events.map(x => x.statement)
    ];
    await env.DB.batch(statements);
    generated.push(...events.map(x => x.event));
  }

  return generated;
}
