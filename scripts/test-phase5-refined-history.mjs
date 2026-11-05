import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import {newDatabase,adapter,ecdsa} from './phase8d-native-fixture.mjs';

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

const sqlite = newDatabase(), db = adapter(sqlite);
const r2 = new FakeR2();
const env = { DB:db, HISTORY:r2 };
const deviceId = uuid(99),key=await ecdsa();sqlite.prepare('INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?,?,?,?)').run(deviceId,'Synthetic refined history',key.spki,Date.now());
// Keep the fixture in the recent past so the production 30-day retention and future-time guards
// are genuinely exercised without the test expiring as the calendar advances.
const startMs = Date.now() - 5 * 60_000;
const frameMs = startMs + 60_000;
const endMs = startMs + 120_000;

// A frame alone is durable but cannot be refined without a trusted endpoint on each side.
assert.equal(await mod.persistHypothesisFrameIfPresent(env, deviceId, hypothesisRecord(uuid(1), frameMs), endMs), true);
assert.equal(await mod.processRefinementsForDevice(env, deviceId, endMs), 0);
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM phase5_refined_intervals').get().n,0);
assert.ok([...r2.objects.keys()].some(k => k.startsWith('history/hypotheses/')));
assert.ok(![...r2.objects.keys()].some(k => k.startsWith('history/raw/') || k.startsWith('history/trusted/')));

const startPacket = { rawAccepted:true, quality:1, trustedLatE7:13_000_000, trustedLonE7:1_038_000_000, uncertaintyCm:1000, epoch:1, sequence:10, wallTimeMs:startMs };
const endPacket = { rawAccepted:true, quality:1, trustedLatE7:13_100_000, trustedLonE7:1_038_100_000, uncertaintyCm:1000, epoch:1, sequence:11, wallTimeMs:endMs };
await db.batch(mod.preciseEndpointStatements(db, deviceId, [startPacket, endPacket], endMs));
assert.equal(await mod.processRefinementsForDevice(env, deviceId, endMs), 1);
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM phase5_refined_intervals').get().n,1);
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
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM phase5_hypothesis_frames').get().n,1);

// Malformed hypothesis evidence fails closed rather than inventing a plausible refined point.
const bad = hypothesisRecord(uuid(2), frameMs + 1);
bad.payload = new TextEncoder().encode(JSON.stringify({ v:1, t:'h', o:'missing', m:20, h:[] }));
await assert.rejects(() => mod.persistHypothesisFrameIfPresent(env, deviceId, bad, endMs), /invalid fusion hypothesis frame/);

sqlite.close();console.log('PHASE5_REFINED_HISTORY_PASS (actual production-migration SQLite; object fixture)');
