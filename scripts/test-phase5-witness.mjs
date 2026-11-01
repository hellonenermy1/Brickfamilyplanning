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
const slot = Math.floor(now / (5 * 60_000));
const enc = x => new TextEncoder().encode(JSON.stringify(x));
function record(device, payload, wallTimeMs = now, sequence = 1) {
  return {
    recordId: randomUUID(), epoch: 1, sequence, elapsedRealtimeMs: 123_000 + sequence,
    wallTimeMs, provider: 17, family: 12, capability: 0, health: 0, quality: 2,
    independenceGroup: 'witness.mesh', payload: enc(payload), _device: device
  };
}
async function apply(device, r) {
  const statements = await p5.phase5EvidenceStatements(d1, device, r, now);
  if (statements.length) await d1.batch(statements);
}

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

const outsiderSighting = record(outsider, { v:1,t:'s',a:alias,latE7:13001000,lonE7:1038001000,accCm:1000,r:-45 }, now, 3);
await apply(outsider, outsiderSighting);
row = db.prepare('SELECT * FROM witness_sightings WHERE record_id=?').get(outsiderSighting.recordId);
assert.equal(row.child_device_id, null, 'unauthorised witness must not resolve the child');
assert.equal(row.authorised, 0);

// Out-of-order/offline case: witness sighting lands before the child alias registration.
const nextSlot = slot + 1;
const nextWall = nextSlot * 5 * 60_000 + 10_000;
const lateAlias = 'fedcba9876543210';
const early = record(witness, { v:1,t:'s',a:lateAlias,latE7:13002000,lonE7:1038002000,accCm:1500,r:-72 }, nextWall, 4);
await apply(witness, early);
row = db.prepare('SELECT * FROM witness_sightings WHERE record_id=?').get(early.recordId);
assert.equal(row.child_device_id, null);
assert.equal(row.authorised, 0);

await apply(child, record(child, { v:1,t:'a',aliases:[{a:lateAlias,s:nextSlot}] }, nextWall, 5));
row = db.prepare('SELECT * FROM witness_sightings WHERE record_id=?').get(early.recordId);
assert.equal(row.child_device_id, child, 'later alias registration must resolve an authorised pending sighting');
assert.equal(row.authorised, 1);

assert.equal(p5.conservativeBleAllowanceM(-50), 35);
assert.equal(p5.conservativeBleAllowanceM(-65), 75);
assert.equal(p5.conservativeBleAllowanceM(-80), 150);
assert.equal(p5.conservativeBleAllowanceM(-95), 250);
assert.ok(p5.conservativeBleAllowanceM(-95) > p5.conservativeBleAllowanceM(-50));

await assert.rejects(
  p5.phase5EvidenceStatements(d1, witness, record(witness, { v:1,t:'s',a:alias,latE7:13000000,lonE7:1038000000,accCm:1,r:99 }, now, 6), now),
  p5.Phase5SemanticError
);

console.log('PHASE5_WITNESS_SEMANTICS_PASS');
