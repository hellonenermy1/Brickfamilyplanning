import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

const modulePath = process.argv[2];
if (!modulePath) throw new Error('usage: test-phase5-external-constraints.mjs <module>');
const external = await import(pathToFileURL(modulePath).href + `?v=${Date.now()}`);

function numberedBindings(params) { return Object.fromEntries(params.map((value, i) => [`?${i + 1}`, value])); }
class FakePrepared {
  constructor(db, sql) { this.db = db; this.sql = sql; this.params = []; }
  bind(...params) { const x = new FakePrepared(this.db, this.sql); x.params = params; return x; }
  async all() { return { results: this.db.prepare(this.sql).all(numberedBindings(this.params)) }; }
}
class FakeD1 { constructor(db) { this.db = db; } prepare(sql) { return new FakePrepared(this.db, sql); } }

const db = new DatabaseSync(':memory:');
for (const file of ['schema/001_init.sql','schema/003_phase4_safety.sql','schema/004_phase5_operations.sql','schema/008_v1_phase2_evidence.sql','schema/009_v1_phase5_fusion.sql']) {
  db.exec(fs.readFileSync(file, 'utf8'));
}
const child = '11111111-1111-4111-8111-111111111111';
const otherChild = '22222222-2222-4222-8222-222222222222';
const witness1 = '33333333-3333-4333-8333-333333333333';
const witness2 = '44444444-4444-4444-8444-444444444444';
for (const id of [child,otherChild,witness1,witness2]) db.prepare('INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?,?,?,?)').run(id,id,'key',1);
const now = 2_000_000_000_000;

const auth = db.prepare('INSERT INTO witness_authorizations(device_id,witness_device_id,enabled,created_at,updated_at) VALUES(?,?,?,?,?)');
auth.run(child,witness1,1,1,1);
auth.run(child,witness2,1,1,1);

const ws = db.prepare('INSERT INTO witness_sightings(record_id,alias,witness_device_id,child_device_id,observed_wall_ms,witness_latitude,witness_longitude,witness_accuracy_m,rssi,tx_power,proximity_allowance_m,uncertainty_m,authorised,received_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
ws.run('w1-old','aaaaaaaaaaaaaaaa',witness1,child,now-30_000,1.3000,103.8000,15,-60,null,75,90,1,now-29_000);
ws.run('w1-new','bbbbbbbbbbbbbbbb',witness1,child,now-10_000,1.3001,103.8001,12,-55,null,35,47,1,now-9_000);
ws.run('w2','cccccccccccccccc',witness2,child,now-20_000,1.3002,103.8002,20,-70,null,75,95,1,now-19_000);
ws.run('unauth','dddddddddddddddd',witness2,child,now-5_000,1.3003,103.8003,10,-50,null,35,45,0,now-4_000);
ws.run('stale','eeeeeeeeeeeeeeee',witness1,child,now-121_000,1.3,103.8,10,-50,null,35,45,1,now-120_000);
ws.run('other-child','ffffffffffffffff',witness1,otherChild,now-5_000,1.4,103.9,10,-50,null,35,45,1,now-4_000);

const receiverId = 'school-gate';
db.prepare('INSERT INTO ground_receivers(id,device_id,name,latitude,longitude,radius_m,public_key_spki_b64,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
  .run(receiverId,child,'School Gate',1.3300,103.8200,40,'key',1,1,1);
const gs = db.prepare('INSERT INTO ground_sightings(receiver_id,sighting_id,alias,child_device_id,observed_wall_ms,receiver_latitude,receiver_longitude,receiver_radius_m,rssi,tx_power,proximity_allowance_m,uncertainty_m,resolved,payload_sha256,received_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
gs.run(receiverId,'g-old','aaaaaaaaaaaaaaaa',child,now-40_000,1.3300,103.8200,40,-65,null,75,115,1,'a'.repeat(64),now-39_000);
gs.run(receiverId,'g-new','bbbbbbbbbbbbbbbb',child,now-8_000,1.3300,103.8200,40,-55,null,35,75,1,'b'.repeat(64),now-7_000);
gs.run(receiverId,'g-unresolved','cccccccccccccccc',null,now-2_000,1.3300,103.8200,40,-50,null,35,75,0,'c'.repeat(64),now-1_000);

const d1 = new FakeD1(db);
const result = await external.listCurrentExternalConstraints(d1, child, now);
assert.equal(result.filter(x => x.kind === 'witness').length, 2, 'one latest row per currently authorised witness');
assert.equal(result.filter(x => x.kind === 'ground_receiver').length, 1, 'one latest row per enabled receiver');
assert.ok(result.some(x => x.id === 'witness:w1-new'));
assert.ok(!result.some(x => x.id === 'witness:w1-old'));
assert.ok(!result.some(x => x.id.includes('unauth')));
assert.ok(!result.some(x => x.id.includes('stale')));
assert.ok(!result.some(x => x.id.includes('other-child')));
assert.ok(result.some(x => x.id === 'ground:school-gate:g-new'));
assert.ok(!result.some(x => x.id.includes('g-old')));
assert.ok(!result.some(x => x.id.includes('g-unresolved')));

const groups = result.map(x => x.independenceGroup);
assert.equal(new Set(groups).size, groups.length, 'returned current constraints must already be independent by source');
const ground = result.find(x => x.kind === 'ground_receiver');
assert.equal(ground.radiusM,75);
assert.equal(ground.latitude,1.33);
assert.equal(ground.longitude,103.82);

// Revocation must affect the current constraint set immediately; a still-fresh historical row is
// not enough to keep influencing the child's refined state.
db.prepare('UPDATE witness_authorizations SET enabled=0,updated_at=? WHERE device_id=? AND witness_device_id=?').run(now,child,witness1);
let afterRevoke = await external.listCurrentExternalConstraints(d1, child, now);
assert.ok(!afterRevoke.some(x => x.sourceId === witness1), 'revoked witness must disappear immediately');
assert.ok(afterRevoke.some(x => x.sourceId === witness2), 'unrelated authorised witness remains');

db.prepare('UPDATE ground_receivers SET enabled=0,updated_at=? WHERE id=?').run(now,receiverId);
afterRevoke = await external.listCurrentExternalConstraints(d1, child, now);
assert.ok(!afterRevoke.some(x => x.kind === 'ground_receiver'), 'disabled receiver must disappear immediately');

await assert.rejects(external.listCurrentExternalConstraints(d1,'bad-id',now), /invalid child device id/);
await assert.rejects(external.listCurrentExternalConstraints(d1,child,0), /invalid constraint time/);

console.log('PHASE5_EXTERNAL_CONSTRAINTS_PASS');
