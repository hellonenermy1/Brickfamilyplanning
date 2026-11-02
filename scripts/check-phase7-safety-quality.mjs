import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const outfile = "/tmp/brick-phase7-safety-batch-v6.mjs";
await build({
  entryPoints: ["src/safety-batch-v6.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  logLevel: "silent"
});
const {
  safetyPositionEligibleV6,
  tripOverdueEligibleV6,
  coordinateDwellStateV6,
  evaluateSafetyBatchV6
} = await import(pathToFileURL(outfile).href + `?v=${Date.now()}`);

const packet = (quality, uncertaintyM = 25) => ({
  trustedLatE7: 13_000_000,
  trustedLonE7: 1_038_000_000,
  uncertaintyCm: Math.round(uncertaintyM * 100),
  quality
});

assert.equal(safetyPositionEligibleV6(packet(1)), true, "PRECISE must be eligible");
assert.equal(safetyPositionEligibleV6(packet(2)), true, "ASSISTED must be eligible");
assert.equal(safetyPositionEligibleV6(packet(3)), true, "ANCHORED must be eligible when uncertainty is bounded");
assert.equal(safetyPositionEligibleV6(packet(4)), false, "ESTIMATED must not drive coordinate-dependent safety transitions");
assert.equal(safetyPositionEligibleV6(packet(5)), false, "COARSE must not drive coordinate-dependent safety transitions");
assert.equal(safetyPositionEligibleV6(packet(6)), false, "LAST_KNOWN must not drive coordinate-dependent safety transitions");
assert.equal(safetyPositionEligibleV6(packet(7)), false, "UNKNOWN must not drive coordinate-dependent safety transitions");
assert.equal(safetyPositionEligibleV6(packet(1, 251)), false, "uncertainty above 250m must be rejected");
assert.equal(safetyPositionEligibleV6({ ...packet(1), trustedLatE7: null }), false, "missing coordinate must be rejected");

assert.deepEqual(
  coordinateDwellStateV6(true, 1234, 2, 5678),
  { arrivalCandidateSince: 1234, arrivalCandidateCount: 2, stationarySince: 5678 },
  "continuous trusted positioning must retain a valid dwell candidate"
);
assert.deepEqual(
  coordinateDwellStateV6(false, 1234, 2, 5678),
  { arrivalCandidateSince: null, arrivalCandidateCount: 0, stationarySince: null },
  "an untrusted positioning gap must break arrival and prolonged-stop dwell continuity"
);

const NOW = 2_000_000_000_000;
assert.equal(tripOverdueEligibleV6(NOW - 600_001, null, NOW), true, "overdue must not depend on coordinate quality");
assert.equal(tripOverdueEligibleV6(NOW - 600_001, NOW - 60_000, NOW), false, "overdue alert must retain its 30-minute repeat bound");
assert.equal(tripOverdueEligibleV6(NOW + 60_000, null, NOW), false, "future ETA must not be overdue");
assert.equal(tripOverdueEligibleV6(null, null, NOW), false, "trip without ETA must not create an overdue alert");

class FakeStatement {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new FakeStatement(this.db, this.sql, args); }
  async all() {
    if (!this.sql.includes("FROM geofences g LEFT JOIN geofence_state")) throw new Error(`unexpected all(): ${this.sql}`);
    return {
      results: this.db.fences.map(g => ({
        ...g,
        stable_state: this.db.fenceStates[g.id]?.stable_state ?? null,
        candidate_state: this.db.fenceStates[g.id]?.candidate_state ?? null,
        candidate_since: this.db.fenceStates[g.id]?.candidate_since ?? null,
        candidate_count: this.db.fenceStates[g.id]?.candidate_count ?? null,
        last_distance_m: this.db.fenceStates[g.id]?.last_distance_m ?? null,
        last_epoch: this.db.fenceStates[g.id]?.last_epoch ?? null,
        last_sequence: this.db.fenceStates[g.id]?.last_sequence ?? null
      }))
    };
  }
  async first() {
    if (!this.sql.includes("FROM trips WHERE")) throw new Error(`unexpected first(): ${this.sql}`);
    return this.db.trip ? { ...this.db.trip } : null;
  }
  async apply() {
    if (this.sql.startsWith("INSERT INTO geofence_state")) {
      const [id,,stable,candidate,candidateSince,candidateCount,lastDistance,,lastEpoch,lastSequence] = this.args;
      this.db.fenceStates[id] = {
        stable_state: stable,
        candidate_state: candidate,
        candidate_since: candidateSince,
        candidate_count: candidateCount,
        last_distance_m: lastDistance,
        last_epoch: lastEpoch,
        last_sequence: lastSequence
      };
      return { meta: { changes: 1 } };
    }
    if (this.sql.startsWith("UPDATE trips SET state=")) {
      const [state,endedAt,arrivalSince,arrivalCount,lastAlert,stationarySince,lastStop,lastEpoch,lastSequence,lastDistance,lastLocation,id] = this.args;
      assert.equal(id, this.db.trip.id);
      Object.assign(this.db.trip, {
        state,
        ended_at: endedAt ?? this.db.trip.ended_at ?? null,
        arrival_candidate_since: arrivalSince,
        arrival_candidate_count: arrivalCount,
        last_alert_at: lastAlert,
        stationary_since: stationarySince,
        last_stop_alert_at: lastStop,
        last_eval_epoch: lastEpoch,
        last_eval_sequence: lastSequence,
        last_distance_to_destination_m: lastDistance,
        last_location_at: lastLocation
      });
      return { meta: { changes: 1 } };
    }
    if (this.sql.startsWith("INSERT OR IGNORE INTO safety_events")) {
      const [id,deviceId,kind,deviceCreatedAt,serverCreatedAt,latitude,longitude,accuracyM,detailJson] = this.args;
      this.db.safetyEvents.push({ id,deviceId,kind,deviceCreatedAt,serverCreatedAt,latitude,longitude,accuracyM,detail:JSON.parse(detailJson) });
      return { meta: { changes: 1 } };
    }
    throw new Error(`unexpected batch statement: ${this.sql}`);
  }
}
class FakeDB {
  constructor() {
    this.fences = [{ id:"gf1", name:"School", latitude:1.3, longitude:103.8, radius_m:100 }];
    this.fenceStates = {
      gf1: { stable_state:"outside", candidate_state:"inside", candidate_since:NOW-5_000, candidate_count:1, last_distance_m:500, last_epoch:1, last_sequence:1 }
    };
    this.trip = {
      id:"trip1", state:"active", destination_name:"School", destination_latitude:1.3, destination_longitude:103.8,
      destination_radius_m:100, expected_arrival_at:NOW-700_000, arrival_candidate_since:NOW-5_000,
      arrival_candidate_count:1, last_alert_at:null, stationary_since:NOW-700_000, last_stop_alert_at:null,
      last_eval_epoch:1, last_eval_sequence:1, last_distance_to_destination_m:777, last_location_at:NOW-100_000
    };
    this.safetyEvents = [];
  }
  prepare(sql) { return new FakeStatement(this, sql); }
  async batch(statements) { return Promise.all(statements.map(s => s.apply())); }
}
class FakeStub {
  constructor() { this.highWater = null; this.pushed = []; }
  async canEvaluateSafety(epoch, sequence) {
    return !this.highWater || epoch > this.highWater.epoch || (epoch === this.highWater.epoch && sequence > this.highWater.sequence);
  }
  async commitSafetyEvaluation(epoch, sequence) { this.highWater = { epoch, sequence }; }
  async pushSafetyEvent(event) { this.pushed.push(event); }
}
class FakeNamespace {
  constructor(stub) { this.stub = stub; }
  idFromName(name) { return name; }
  get() { return this.stub; }
}
function runtimePacket({ sequence, wallTimeMs, quality, activity = 1 }) {
  return {
    epoch:1, sequence, wallTimeMs,
    trustedLatE7:13_000_000, trustedLonE7:1_038_000_000, uncertaintyCm:2_500,
    quality, activity
  };
}

// Behavioral proof on the actual Phase 6/7 batch evaluator used by location-ingest-v6.ts.
{
  const db = new FakeDB();
  const stub = new FakeStub();
  const env = { DB:db, BRICK_DEVICE:new FakeNamespace(stub) };
  const degraded = runtimePacket({ sequence:2, wallTimeMs:NOW, quality:4 }); // ESTIMATED with good-looking coordinates
  const events = await evaluateSafetyBatchV6(env, "device-1", [degraded]);

  assert.equal(events.some(e => e.kind === "geofence_enter" || e.kind === "geofence_exit" || (e.kind === "trip_ended" && e.detail?.reason === "arrived")), false,
    "ESTIMATED must not manufacture coordinate-dependent safety transitions");
  assert.equal(db.fenceStates.gf1.stable_state, "outside", "degraded gap must preserve stable geofence state");
  assert.equal(db.fenceStates.gf1.candidate_state, null, "degraded gap must clear geofence candidate");
  assert.equal(db.fenceStates.gf1.candidate_since, null, "degraded gap must clear geofence dwell start");
  assert.equal(db.fenceStates.gf1.candidate_count, 0, "degraded gap must clear geofence dwell count");
  assert.equal(db.fenceStates.gf1.last_sequence, 2, "degraded gap must advance geofence ordering watermark");

  assert.equal(db.trip.arrival_candidate_since, null, "degraded gap must break arrival dwell");
  assert.equal(db.trip.arrival_candidate_count, 0, "degraded gap must reset arrival count");
  assert.equal(db.trip.stationary_since, null, "degraded gap must break prolonged-stop dwell");
  assert.equal(db.trip.last_distance_to_destination_m, 777, "degraded gap must preserve last trustworthy trip distance");
  assert.equal(db.trip.last_location_at, NOW-100_000, "degraded gap must preserve last trustworthy trip location time");
  assert.equal(db.trip.last_eval_sequence, 2, "degraded gap must advance trip ordering watermark");

  const overdue = events.find(e => e.kind === "trip_alert" && e.detail?.reason === "overdue");
  assert.ok(overdue, "time-based overdue must still fire during degraded positioning");
  assert.equal(overdue.latitude, null, "degraded overdue must not carry guessed latitude");
  assert.equal(overdue.longitude, null, "degraded overdue must not carry guessed longitude");
  assert.equal(overdue.accuracyM, null, "degraded overdue must not carry guessed accuracy");
  assert.equal(overdue.detail.distanceToDestinationM, null, "degraded overdue must not carry guessed distance");
  assert.equal(overdue.detail.positionQualified, false, "degraded overdue must identify unqualified position");
  assert.deepEqual(stub.highWater, { epoch:1, sequence:2 }, "degraded packet must advance durable safety evaluation high-water");

  // A later precise fix must start dwell from scratch, not inherit pre-gap time/count.
  const precise = runtimePacket({ sequence:3, wallTimeMs:NOW+11_000, quality:1 });
  const after = await evaluateSafetyBatchV6(env, "device-1", [precise]);
  assert.equal(after.some(e => e.kind === "geofence_enter" || (e.kind === "trip_ended" && e.detail?.reason === "arrived")), false,
    "first trusted fix after a degraded gap must not instantly complete old dwell");
  assert.equal(db.fenceStates.gf1.candidate_state, "inside");
  assert.equal(db.fenceStates.gf1.candidate_since, NOW+11_000, "geofence dwell must restart after degraded gap");
  assert.equal(db.fenceStates.gf1.candidate_count, 1);
  assert.equal(db.trip.arrival_candidate_since, NOW+11_000, "arrival dwell must restart after degraded gap");
  assert.equal(db.trip.arrival_candidate_count, 1);
}

const ingestSource = fs.readFileSync("src/location-ingest-v6.ts", "utf8");
assert.match(ingestSource, /evaluateSafetyBatchV6\(env, deviceId, \[packet\]\)/, "single location ingest must call the qualified V6 batch safety evaluator");
assert.match(ingestSource, /evaluateSafetyBatchV6\(env, deviceId, packets\)/, "batch location ingest must call the qualified V6 batch safety evaluator");

console.log("Phase 7 actual V6 safety runtime fixtures: PASS");
