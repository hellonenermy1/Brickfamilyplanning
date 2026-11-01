import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const modulePath = process.argv[2];
if (!modulePath) throw new Error('compiled refined-history module path required');
const mod = await import(pathToFileURL(modulePath).href + `?v=${Date.now()}`);

class FakeR2 {
  objects = new Map();
  async put(key, value, opts) { this.objects.set(key, { text: String(value), opts }); }
  async get(key) {
    const value = this.objects.get(key);
    return value ? { text: async () => value.text } : null;
  }
  async delete(key) { this.objects.delete(key); }
}

class BoundStatement {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new BoundStatement(this.db, this.sql, args); }
  async first() { return this.db.first(this.sql, this.args); }
  async all() { return { results: this.db.all(this.sql, this.args) }; }
  async run() { this.db.run(this.sql, this.args); return { meta: { changes: 1 } }; }
}

class FakeDB {
  frames = new Map();
  endpoints = [];
  intervals = new Map();
  prepare(sql) { return new BoundStatement(this, sql.replace(/\s+/g, ' ').trim()); }
  async batch(statements) { for (const s of statements) await s.run(); return statements.map(() => ({ meta: { changes: 1 } })); }

  first(sql, a) {
    if (sql.startsWith('SELECT r2_key,wall_time_ms FROM phase5_hypothesis_frames')) {
      const row = this.frames.get(`${a[0]}|${a[1]}`); return row ? { r2_key: row.r2_key, wall_time_ms: row.wall_time_ms } : null;
    }
    if (sql.includes('FROM phase5_precise_endpoints') && sql.includes('wall_time_ms<?2')) {
      return this.endpoints.filter(e => e.device_id === a[0] && e.wall_time_ms < a[1]).sort((x,y) => y.wall_time_ms-x.wall_time_ms)[0] ?? null;
    }
    if (sql.includes('FROM phase5_precise_endpoints') && sql.includes('wall_time_ms>?2')) {
      return this.endpoints.filter(e => e.device_id === a[0] && e.wall_time_ms > a[1]).sort((x,y) => x.wall_time_ms-y.wall_time_ms)[0] ?? null;
    }
    return null;
  }

  all(sql, a) {
    if (sql.startsWith('SELECT record_id,wall_time_ms,r2_key FROM phase5_hypothesis_frames')) {
      return [...this.frames.values()].filter(r => r.device_id === a[0] && r.refined_run_id == null).sort((x,y) => x.wall_time_ms-y.wall_time_ms).slice(0,a[1]);
    }
    if (sql.startsWith('SELECT epoch,sequence,wall_time_ms,latitude,longitude,uncertainty_m FROM phase5_precise_endpoints')) {
      return this.endpoints.filter(e => e.device_id === a[0] && e.wall_time_ms >= a[1] && e.wall_time_ms <= a[2]).sort((x,y) => x.wall_time_ms-y.wall_time_ms || x.epoch-y.epoch || x.sequence-y.sequence);
    }
    if (sql.startsWith('SELECT id,from_ms,to_ms,model_version,refined_r2_key,created_at FROM phase5_refined_intervals')) {
      return [...this.intervals.values()].filter(r => r.device_id === a[0] && r.to_ms >= a[1] && r.from_ms <= a[2]).sort((x,y) => x.from_ms-y.from_ms || x.created_at-y.created_at).slice(0,200);
    }
    if (sql.startsWith('SELECT record_id,r2_key FROM phase5_hypothesis_frames WHERE created_at')) return [];
    if (sql.startsWith('SELECT id,refined_r2_key FROM phase5_refined_intervals WHERE to_ms')) return [];
    return [];
  }

  run(sql, a) {
    if (sql.startsWith('INSERT INTO phase5_hypothesis_frames')) {
      this.frames.set(`${a[0]}|${a[1]}`, { device_id:a[0], record_id:a[1], wall_time_ms:a[2], r2_key:a[3], created_at:a[4], refined_run_id:null });
      return;
    }
    if (sql.startsWith('INSERT OR IGNORE INTO phase5_precise_endpoints')) {
      if (!this.endpoints.some(e => e.device_id===a[0] && e.epoch===a[1] && e.sequence===a[2])) this.endpoints.push({ device_id:a[0], epoch:a[1], sequence:a[2], wall_time_ms:a[3], latitude:a[4], longitude:a[5], uncertainty_m:a[6], created_at:a[7] });
      return;
    }
    if (sql.startsWith('INSERT OR IGNORE INTO phase5_refined_intervals')) {
      if (!this.intervals.has(a[0])) this.intervals.set(a[0], { id:a[0], device_id:a[1], from_ms:a[2], to_ms:a[3], model_version:a[4], source_r2_key:null, refined_r2_key:a[5], created_at:a[6] });
      return;
    }
    if (sql.startsWith('UPDATE phase5_hypothesis_frames SET refined_run_id')) {
      const row = this.frames.get(`${a[1]}|${a[2]}`); if (row && row.refined_run_id == null) row.refined_run_id = a[0];
      return;
    }
    if (sql.startsWith('DELETE FROM phase5_precise_endpoints')) return;
    if (sql.startsWith('DELETE FROM phase5_hypothesis_frames')) return;
    if (sql.startsWith('DELETE FROM phase5_refined_intervals')) return;
    throw new Error(`unhandled SQL in fake: ${sql}`);
  }
}

function uuid(n) { return `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`; }
function hypothesisRecord(recordId, wallTimeMs) {
  const payload = {
    v:1, t:'h', o:'wrong-route', m:20,
    h:[
      { id:'wrong-route', latE7:13_400_000, lonE7:1_038_400_000, uCm:8_000, rw:900, ew:800, s:'route-a' },
      { id:'right-route', latE7:13_050_000, lonE7:1_038_050_000, uCm:9_000, rw:700, ew:950, s:'route-b' }
    ]
  };
  return { recordId, epoch:1, sequence:2, elapsedRealtimeMs:50_000, wallTimeMs, provider:22, family:1, capability:0, health:0, quality:2, independenceGroup:'fusion.hypotheses', payload:new TextEncoder().encode(JSON.stringify(payload)) };
}

const db = new FakeDB();
const r2 = new FakeR2();
const env = { DB:db, HISTORY:r2 };
const deviceId = uuid(99);
// Keep the fixture in the recent past so the production 30-day retention and future-time guards
// are genuinely exercised without the test expiring as the calendar advances.
const startMs = Date.now() - 5 * 60_000;
const frameMs = startMs + 60_000;
const endMs = startMs + 120_000;

// A frame alone is durable but cannot be refined without a trusted endpoint on each side.
assert.equal(await mod.persistHypothesisFrameIfPresent(env, deviceId, hypothesisRecord(uuid(1), frameMs), endMs), true);
assert.equal(await mod.processRefinementsForDevice(env, deviceId, endMs), 0);
assert.equal(db.intervals.size, 0);
assert.ok([...r2.objects.keys()].some(k => k.startsWith('history/hypotheses/')));
assert.ok(![...r2.objects.keys()].some(k => k.startsWith('history/raw/') || k.startsWith('history/trusted/')));

const startPacket = { rawAccepted:true, quality:1, trustedLatE7:13_000_000, trustedLonE7:1_038_000_000, uncertaintyCm:1000, epoch:1, sequence:10, wallTimeMs:startMs };
const endPacket = { rawAccepted:true, quality:1, trustedLatE7:13_100_000, trustedLonE7:1_038_100_000, uncertaintyCm:1000, epoch:1, sequence:11, wallTimeMs:endMs };
await db.batch(mod.preciseEndpointStatements(db, deviceId, [startPacket, endPacket], endMs));
assert.equal(await mod.processRefinementsForDevice(env, deviceId, endMs), 1);
assert.equal(db.intervals.size, 1);
assert.ok([...r2.objects.keys()].some(k => k.startsWith('history/refined/')));

const listed = await mod.listRefinedHistory(env, deviceId, startMs, endMs);
assert.equal(listed.runs.length, 1);
assert.equal(listed.points.length, 1);
assert.equal(listed.points[0].refinedHypothesisId, 'right-route');
assert.equal(listed.points[0].originalRealtimeHypothesisId, 'wrong-route');
assert.equal(listed.points[0].changedFromRealtime, true);
assert.equal(listed.points[0].latitude, 1.305);
assert.equal(listed.points[0].longitude, 103.805);

// Duplicate frame upload is idempotent and does not create a second run/index row.
assert.equal(await mod.persistHypothesisFrameIfPresent(env, deviceId, hypothesisRecord(uuid(1), frameMs), endMs), true);
assert.equal(db.frames.size, 1);

// Malformed hypothesis evidence fails closed rather than inventing a plausible refined point.
const bad = hypothesisRecord(uuid(2), frameMs + 1);
bad.payload = new TextEncoder().encode(JSON.stringify({ v:1, t:'h', o:'missing', m:20, h:[] }));
await assert.rejects(() => mod.persistHypothesisFrameIfPresent(env, deviceId, bad, endMs), /invalid fusion hypothesis frame/);

console.log('PHASE5_REFINED_HISTORY_PASS');
