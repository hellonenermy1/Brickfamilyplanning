import type { BrickDevice, RealtimeSafetyEvent } from "./device-do";
import type { LivePacket } from "./protocol";

export type SafetyBatchEnv = {
  DB: D1Database;
  BRICK_DEVICE: DurableObjectNamespace<BrickDevice>;
};

type FenceRow = {
  id: string; name: string; latitude: number; longitude: number; radius_m: number;
  stable_state: string | null; candidate_state: string | null; candidate_since: number | null;
  candidate_count: number | null; last_distance_m: number | null; last_epoch: number | null; last_sequence: number | null;
};
type FenceState = {
  row: FenceRow; stable: string; candidate: string | null; candidateSince: number | null;
  candidateCount: number; lastDistanceM: number | null; lastEpoch: number; lastSequence: number; dirty: boolean;
};
type Trip = {
  id: string; destination_name: string | null; destination_latitude: number | null; destination_longitude: number | null;
  destination_radius_m: number; expected_arrival_at: number | null; arrival_candidate_since: number | null;
  arrival_candidate_count: number; last_alert_at: number | null; stationary_since: number | null; last_stop_alert_at: number | null;
  last_eval_epoch: number; last_eval_sequence: number; last_distance_to_destination_m: number | null; last_location_at: number | null;
};
type PendingEvent = { event: RealtimeSafetyEvent; statement: D1PreparedStatement };

function radians(v: number) { return v * Math.PI / 180; }
function distanceM(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6_371_000;
  const dLat = radians(bLat - aLat), dLon = radians(bLon - aLon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function atLeast(epoch: number, sequence: number, otherEpoch: number, otherSequence: number) {
  return epoch > otherEpoch || (epoch === otherEpoch && sequence >= otherSequence);
}
async function deterministicId(key: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)));
  return "srv_" + Array.from(digest.slice(0, 16), b => b.toString(16).padStart(2, "0")).join("");
}
async function eventRecord(env: SafetyBatchEnv, deviceId: string, kind: string, packet: LivePacket, lat: number | null, lon: number | null, accuracyM: number | null, detail: Record<string, unknown>, key: string): Promise<PendingEvent> {
  const id = await deterministicId(key);
  const event: RealtimeSafetyEvent = {
    id,
    kind,
    deviceCreatedAt: packet.wallTimeMs,
    serverCreatedAt: Date.now(),
    latitude: lat,
    longitude: lon,
    accuracyM,
    detail
  };
  return {
    event,
    statement: env.DB.prepare(
      "INSERT OR IGNORE INTO safety_events(id,device_id,kind,device_created_at,server_created_at,latitude,longitude,accuracy_m,detail_json) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)"
    ).bind(id, deviceId, kind, event.deviceCreatedAt, event.serverCreatedAt, lat, lon, accuracyM, JSON.stringify(detail))
  };
}

export async function evaluateSafetyBatchV6(env: SafetyBatchEnv, deviceId: string, packets: LivePacket[]) {
  const usable = packets.filter(p => p.trustedLatE7 !== null && p.trustedLonE7 !== null && p.uncertaintyCm >= 0 && p.uncertaintyCm <= 25_000);
  if (!usable.length) return [] as RealtimeSafetyEvent[];

  const [fenceRows, tripRow] = await Promise.all([
    env.DB.prepare(
      `SELECT g.id,g.name,g.latitude,g.longitude,g.radius_m,
       s.stable_state,s.candidate_state,s.candidate_since,s.candidate_count,s.last_distance_m,s.last_epoch,s.last_sequence
       FROM geofences g LEFT JOIN geofence_state s ON s.geofence_id=g.id
       WHERE g.device_id=?1 AND g.enabled=1`
    ).bind(deviceId).all<FenceRow>(),
    env.DB.prepare(
      "SELECT id,destination_name,destination_latitude,destination_longitude,destination_radius_m,expected_arrival_at,arrival_candidate_since,arrival_candidate_count,last_alert_at,stationary_since,last_stop_alert_at,last_eval_epoch,last_eval_sequence,last_distance_to_destination_m,last_location_at FROM trips WHERE device_id=?1 AND state='active' ORDER BY started_at DESC LIMIT 1"
    ).bind(deviceId).first<Trip>()
  ]);
  if (!fenceRows.results.length && !tripRow) return [] as RealtimeSafetyEvent[];

  const fences = fenceRows.results.map<FenceState>(row => ({
    row,
    stable: row.stable_state ?? "unknown",
    candidate: row.candidate_state,
    candidateSince: row.candidate_since,
    candidateCount: row.candidate_count ?? 0,
    lastDistanceM: row.last_distance_m,
    lastEpoch: row.last_epoch ?? 0,
    lastSequence: row.last_sequence ?? 0,
    dirty: false
  }));
  let trip = tripRow ? { ...tripRow } : null;
  let tripDirty = false;
  let tripState = "active";
  let tripEndedAt: number | null = null;
  const events: PendingEvent[] = [];

  for (const packet of usable) {
    const lat = packet.trustedLatE7! / 1e7;
    const lon = packet.trustedLonE7! / 1e7;
    const accuracyM = packet.uncertaintyCm / 100;
    const eventTime = packet.wallTimeMs;

    for (const f of fences) {
      if (atLeast(f.lastEpoch, f.lastSequence, packet.epoch, packet.sequence)) continue;
      const d = distanceM(lat, lon, f.row.latitude, f.row.longitude);
      const enter = Math.max(25, f.row.radius_m - Math.min(30, f.row.radius_m * 0.15));
      const exit = f.row.radius_m + Math.max(25, f.row.radius_m * 0.20);
      const desired = f.stable === "inside" ? (d >= exit ? "outside" : "inside") : (d <= enter ? "inside" : "outside");

      if (f.stable === "unknown") {
        f.stable = desired; f.candidate = null; f.candidateSince = null; f.candidateCount = 0;
      } else if (desired === f.stable) {
        f.candidate = null; f.candidateSince = null; f.candidateCount = 0;
      } else {
        if (f.candidate === desired && f.candidateSince !== null) f.candidateCount += 1;
        else { f.candidate = desired; f.candidateSince = eventTime; f.candidateCount = 1; }
        const candidateSince = f.candidateSince;
        if (f.candidateCount >= 2 && candidateSince !== null && eventTime - candidateSince >= 10_000) {
          const next = desired;
          events.push(await eventRecord(
            env, deviceId, next === "inside" ? "geofence_enter" : "geofence_exit", packet, lat, lon, accuracyM,
            { geofenceId: f.row.id, name: f.row.name, distanceM: Math.round(d) },
            `${deviceId}|gf|${f.row.id}|${next}|${candidateSince}`
          ));
          f.stable = next; f.candidate = null; f.candidateSince = null; f.candidateCount = 0;
        }
      }
      f.lastDistanceM = d; f.lastEpoch = packet.epoch; f.lastSequence = packet.sequence; f.dirty = true;
    }

    if (trip && tripState === "active" && !atLeast(trip.last_eval_epoch, trip.last_eval_sequence, packet.epoch, packet.sequence)) {
      let dist: number | null = null;
      if (trip.destination_latitude !== null && trip.destination_longitude !== null) {
        dist = distanceM(lat, lon, trip.destination_latitude, trip.destination_longitude);
        if (dist <= trip.destination_radius_m) {
          trip.arrival_candidate_since ??= eventTime;
          trip.arrival_candidate_count += 1;
          const arrivalSince = trip.arrival_candidate_since;
          if (trip.arrival_candidate_count >= 2 && arrivalSince !== null && eventTime - arrivalSince >= 10_000) {
            tripState = "arrived"; tripEndedAt = eventTime;
            events.push(await eventRecord(
              env, deviceId, "trip_ended", packet, lat, lon, accuracyM,
              { tripId: trip.id, reason: "arrived", destination: trip.destination_name, distanceM: Math.round(dist) },
              `${deviceId}|trip|${trip.id}|arrived|${arrivalSince}`
            ));
            trip.arrival_candidate_since = null; trip.arrival_candidate_count = 0; trip.stationary_since = null;
          }
        } else {
          trip.arrival_candidate_since = null; trip.arrival_candidate_count = 0;
        }
      }

      if (tripState === "active") {
        const stationary = packet.activity === 1;
        const away = dist === null || dist > trip.destination_radius_m * 1.5;
        if (stationary && away) {
          trip.stationary_since ??= eventTime;
          const stationarySince = trip.stationary_since;
          if (stationarySince !== null && eventTime - stationarySince >= 600_000 && (!trip.last_stop_alert_at || eventTime - trip.last_stop_alert_at >= 1_800_000)) {
            const previousStopAlert = trip.last_stop_alert_at ?? 0;
            trip.last_stop_alert_at = eventTime;
            events.push(await eventRecord(
              env, deviceId, "trip_alert", packet, lat, lon, accuracyM,
              { tripId: trip.id, reason: "prolonged_stop", destination: trip.destination_name, stoppedMinutes: Math.floor((eventTime - stationarySince) / 60_000), distanceToDestinationM: dist === null ? null : Math.round(dist) },
              `${deviceId}|trip|${trip.id}|stop|${stationarySince}|${previousStopAlert}`
            ));
          }
        } else trip.stationary_since = null;

        if (trip.expected_arrival_at && eventTime > trip.expected_arrival_at + 600_000 && (!trip.last_alert_at || eventTime - trip.last_alert_at > 1_800_000)) {
          const previousAlert = trip.last_alert_at ?? 0;
          trip.last_alert_at = eventTime;
          events.push(await eventRecord(
            env, deviceId, "trip_alert", packet, lat, lon, accuracyM,
            { tripId: trip.id, reason: "overdue", destination: trip.destination_name, distanceToDestinationM: dist === null ? null : Math.round(dist) },
            `${deviceId}|trip|${trip.id}|overdue|${trip.expected_arrival_at}|${previousAlert}`
          ));
        }
      }
      trip.last_eval_epoch = packet.epoch; trip.last_eval_sequence = packet.sequence;
      trip.last_distance_to_destination_m = dist; trip.last_location_at = eventTime; tripDirty = true;
    }
  }

  const writes: D1PreparedStatement[] = [];
  const serverNow = Date.now();
  for (const f of fences) if (f.dirty) {
    writes.push(env.DB.prepare(
      `INSERT INTO geofence_state(geofence_id,device_id,stable_state,candidate_state,candidate_since,candidate_count,last_distance_m,updated_at,last_epoch,last_sequence)
       VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
       ON CONFLICT(geofence_id) DO UPDATE SET stable_state=excluded.stable_state,candidate_state=excluded.candidate_state,candidate_since=excluded.candidate_since,candidate_count=excluded.candidate_count,last_distance_m=excluded.last_distance_m,updated_at=excluded.updated_at,last_epoch=excluded.last_epoch,last_sequence=excluded.last_sequence
       WHERE excluded.last_epoch>geofence_state.last_epoch OR (excluded.last_epoch=geofence_state.last_epoch AND excluded.last_sequence>geofence_state.last_sequence)`
    ).bind(f.row.id, deviceId, f.stable, f.candidate, f.candidateSince, f.candidateCount, f.lastDistanceM, serverNow, f.lastEpoch, f.lastSequence));
  }
  if (trip && tripDirty) {
    writes.push(env.DB.prepare(
      "UPDATE trips SET state=?1,ended_at=COALESCE(?2,ended_at),arrival_candidate_since=?3,arrival_candidate_count=?4,last_alert_at=?5,stationary_since=?6,last_stop_alert_at=?7,last_eval_epoch=?8,last_eval_sequence=?9,last_distance_to_destination_m=?10,last_location_at=?11 WHERE id=?12 AND state='active' AND (last_eval_epoch<?8 OR (last_eval_epoch=?8 AND last_eval_sequence<?9))"
    ).bind(tripState, tripEndedAt, trip.arrival_candidate_since, trip.arrival_candidate_count, trip.last_alert_at, trip.stationary_since, trip.last_stop_alert_at, trip.last_eval_epoch, trip.last_eval_sequence, trip.last_distance_to_destination_m, trip.last_location_at, trip.id));
  }
  writes.push(...events.map(e => e.statement));
  if (writes.length) await env.DB.batch(writes);

  const highest = usable[usable.length - 1];
  const stub = env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(deviceId));
  await stub.commitSafetyEvaluation(highest.epoch, highest.sequence);
  // D1 is the durable source of truth. A transient realtime/WebSocket broadcast failure must not
  // turn a successfully persisted safety transition into a failed ingest/duplicate reconstruction.
  await Promise.allSettled(events.map(({ event }) => stub.pushSafetyEvent(event)));
  return events.map(e => e.event);
}
