import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const modulePath = process.argv[2];
if (!modulePath) throw new Error('usage: test-phase5-witness.mjs <phase5-evidence-module>');
const p5 = await import(pathToFileURL(modulePath).href + `?v=${Date.now()}`);

function numberedBindings(params) { return Object.fromEntries(params.map((value, i) => [`?${i + 1}`, value])); }
class FakePrepared {
  constructor(db, sql) { this.db = db; this.sql = sql; this.params = []; }
  bind(...params) { const x = new FakePrepared(this.db, this.sql); x.params = params; return x; }
  async first() { return this.db.prepare(this.sql).get(numberedBindings(this.params)) ?? null; }
  async all() { return { results: this.db.prepare(this.sql).all(numberedBindings(this.params)) }; }
  async run() { const r = this.db.prepare(this.sql).run(numberedBindings(this.params)); return { meta: { changes: Number(r.changes) }, results: [] }; }
}
class FakeD1 {
  constructor(db) { this.db = db; }
  prepare(sql) { return new FakePrepared(this.db, sql); }
  async batch(statements) {
    this.db.exec('BEGIN');
    try {
      const out = []; for (const statement of statements) out.push(await statement.run());
      this.db.exec('COMMIT'); return out;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}

const db = new DatabaseSync(':memory:');
for (const file of ['schema/001_init.sql','schema/003_phase4_safety.sql','schema/008_v1_phase2_evidence.sql','schema/009_v1_phase5_fusion.sql']) {
  db.exec(fs.readFileSync(file, 'utf8'));
}
const child = '11111111-1111-4111-8111-111111111111';
const witness = '22222222-2222-4222-8222-222222222222';
const outsider = '33333333-3333-4333-8333-333333333333';
for (const id of [child,witness,outsider]) db.prepare('INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?,?,?,?)').run(id,id,'key',Date.now());
db.prepare('INSERT INTO witness_authorizations(device_id,witness_device_id,enabled,created_at,updated_at) VALUES(?,?,?,?,?)').run(child,witness,1,Date.now(),Date.now());
const d1 = new FakeD1(db);

const now = Date.now();
const slotMs = 5 * 60_000;
const slot = Math.floor(now / slotMs);
const enc = x => new TextEncoder().encode(JSON.stringify(x));
function record(device, payload, wallTimeMs = now, sequence = 1, family = 12) {
  return {
    recordId: randomUUID(), epoch: 1, sequence, elapsedRealtimeMs: 123_000 + sequence,
    wallTimeMs, provider: 17, family, capability: 0, health: 0, quality: 2,
    independenceGroup: 'witness.mesh', payload: enc(payload), _device: device
  };
}
async function apply(device, r, semanticNow = now) {
  const statements = await p5.phase5EvidenceStatements(d1, device, r, semanticNow);
  if (statements.length) await d1.batch(statements);
}

// Child publishes a rotating alias; authorised witness resolves it to the child.
const alias = '0123456789abcdef';
await apply(child, record(child, { v:1,t:'a',aliases:[{a:alias,s:slot}] }, now, 1));
assert.equal(db.prepare('SELECT child_device_id FROM witness_aliases WHERE alias=?').get(alias).child_device_id, child);

const sighting = record(witness, { v:1,t:'s',a:alias,latE7:13000000,lonE7:1038000000,accCm:1200,r:-50,tx:-8 }, now, 2);
await apply(witness, sighting);
let row = db.prepare('SELECT * FROM witness_sightings WHERE record_id=?').get(sighting.recordId);
assert.equal(row.child_device_id, child);
assert.equal(row.authorised, 1);
assert.equal(row.proximity_allowance_m, 35);
assert.equal(row.uncertainty_m, 47);

// A signed Brick device is not automatically an authorised family witness.
const outsiderSighting = record(outsider, { v:1,t:'s',a:alias,latE7:13001000,lonE7:1038001000,accCm:1000,r:-45 }, now, 3);
await apply(outsider, outsiderSighting);
row = db.prepare('SELECT * FROM witness_sightings WHERE record_id=?').get(outsiderSighting.recordId);
assert.equal(row.child_device_id, null, 'unauthorised witness must not resolve the child');
assert.equal(row.authorised, 0);

// A child hearing its own rotating alias cannot self-authorise a location constraint.
const selfSighting = record(child, { v:1,t:'s',a:alias,latE7:13000000,lonE7:1038000000,accCm:500,r:-40 }, now, 4);
await apply(child, selfSighting);
row = db.prepare('SELECT * FROM witness_sightings WHERE record_id=?').get(selfSighting.recordId);
assert.equal(row.child_device_id, null);
assert.equal(row.authorised, 0);

// Out-of-order/offline case: witness sighting lands before the child's alias registration. Advance
// the simulated server clock with the future slot so this test never depends on CI's position inside
// the current five-minute wall-clock slot.
const nextSlot = slot + 1;
const nextWall = nextSlot * slotMs + 10_000;
const lateAlias = 'fedcba9876543210';
const early = record(witness, { v:1,t:'s',a:lateAlias,latE7:13002000,lonE7:1038002000,accCm:1500,r:-72 }, nextWall, 5);
await apply(witness, early, nextWall);
row = db.prepare('SELECT * FROM witness_sightings WHERE record_id=?').get(early.recordId);
assert.equal(row.child_device_id, null);
assert.equal(row.authorised, 0);

await apply(child, record(child, { v:1,t:'a',aliases:[{a:lateAlias,s:nextSlot}] }, nextWall, 6), nextWall);
row = db.prepare('SELECT * FROM witness_sightings WHERE record_id=?').get(early.recordId);
assert.equal(row.child_device_id, child, 'later alias registration must resolve an authorised pending sighting');
assert.equal(row.authorised, 1);

// Disabling the family relationship must immediately prevent new useful resolution.
db.prepare('UPDATE witness_authorizations SET enabled=0,updated_at=? WHERE device_id=? AND witness_device_id=?').run(now, child, witness);
const disabledSlot = slot + 2;
const disabledWall = disabledSlot * slotMs + 10_000;
const disabledAlias = '1111222233334444';
await apply(child, record(child, { v:1,t:'a',aliases:[{a:disabledAlias,s:disabledSlot}] }, disabledWall, 7), disabledWall);
const disabled = record(witness, { v:1,t:'s',a:disabledAlias,latE7:13003000,lonE7:1038003000,accCm:900,r:-52 }, disabledWall, 8);
await apply(witness, disabled, disabledWall);
row = db.prepare('SELECT * FROM witness_sightings WHERE record_id=?').get(disabled.recordId);
assert.equal(row.child_device_id, null);
assert.equal(row.authorised, 0);
db.prepare('UPDATE witness_authorizations SET enabled=1,updated_at=? WHERE device_id=? AND witness_device_id=?').run(now, child, witness);

// RSSI only selects conservative allowance bands; it is never converted to an exact range.
assert.equal(p5.conservativeBleAllowanceM(-50), 35);
assert.equal(p5.conservativeBleAllowanceM(-65), 75);
assert.equal(p5.conservativeBleAllowanceM(-80), 150);
assert.equal(p5.conservativeBleAllowanceM(-95), 250);
assert.ok(p5.conservativeBleAllowanceM(-95) > p5.conservativeBleAllowanceM(-50));

// Provider/family mismatch and malformed radio values fail closed.
await assert.rejects(
  p5.phase5EvidenceStatements(d1, witness, record(witness, { v:1,t:'s',a:alias,latE7:13000000,lonE7:1038000000,accCm:1,r:99 }, now, 9), now),
  p5.Phase5SemanticError
);
await assert.rejects(
  p5.phase5EvidenceStatements(d1, witness, record(witness, { v:1,t:'s',a:alias,latE7:13000000,lonE7:1038000000,accCm:100,r:-50 }, now, 10, 11), now),
  /provider\/family mismatch/
);

// One child cannot register two public aliases for the same five-minute slot; far-future aliases
// also fail closed so an alias cannot quietly become a long-lived public identifier.
await assert.rejects(
  p5.phase5EvidenceStatements(d1, child, record(child, { v:1,t:'a',aliases:[
    {a:'aaaaaaaabbbbbbbb',s:slot+3},{a:'ccccccccdddddddd',s:slot+3}
  ] }, now, 11), now),
  /duplicate witness alias slot/
);
await assert.rejects(
  p5.phase5EvidenceStatements(d1, child, record(child, { v:1,t:'a',aliases:[{a:'99999999aaaaaaaa',s:slot+100}] }, now, 12), now),
  /slot outside permitted window/
);

// Semantic indexes are bounded. Raw BREV retention remains the Phase 2 R2 responsibility.
const oldAlias = 'aaaabbbbccccdddd';
db.prepare('INSERT INTO witness_aliases(alias,child_device_id,slot,valid_from_ms,valid_to_ms,source_record_id,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)')
  .run(oldAlias, child, slot-10_000, now-40*86400000, now-40*86400000+slotMs, 'old-record', now-40*86400000, now-1);
const oldSightingId = randomUUID();
db.prepare('INSERT INTO witness_sightings(record_id,alias,witness_device_id,child_device_id,observed_wall_ms,witness_latitude,witness_longitude,witness_accuracy_m,rssi,tx_power,proximity_allowance_m,uncertainty_m,authorised,received_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .run(oldSightingId, oldAlias, witness, null, now-40*86400000, 1.3, 103.8, 20, -60, null, 75, 95, 0, now-31*86400000);
const cleanupSlot = slot + 3;
const cleanupWall = cleanupSlot * slotMs + 20_000;
await apply(child, record(child, { v:1,t:'a',aliases:[{a:'1234123412341234',s:cleanupSlot}] }, cleanupWall, 13), cleanupWall);
assert.equal(db.prepare('SELECT COUNT(*) n FROM witness_aliases WHERE alias=?').get(oldAlias).n, 0);
assert.equal(db.prepare('SELECT COUNT(*) n FROM witness_sightings WHERE record_id=?').get(oldSightingId).n, 0);

console.log('PHASE5_WITNESS_SEMANTICS_PASS');
