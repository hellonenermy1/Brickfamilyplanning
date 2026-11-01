import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const [groundPath, phase5Path] = process.argv.slice(2);
if (!groundPath || !phase5Path) throw new Error('usage: test-phase5-ground.mjs <ground-module> <phase5-evidence-module>');
const ground = await import(pathToFileURL(groundPath).href + `?v=${Date.now()}`);
const p5 = await import(pathToFileURL(phase5Path).href + `?v=${Date.now()}`);

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
class AllowRate { async limit() { return { success: true }; } }

const db = new DatabaseSync(':memory:');
for (const file of ['schema/001_init.sql','schema/003_phase4_safety.sql','schema/008_v1_phase2_evidence.sql','schema/009_v1_phase5_fusion.sql']) {
  db.exec(fs.readFileSync(file, 'utf8'));
}
const child = '11111111-1111-4111-8111-111111111111';
db.prepare('INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?,?,?,?)').run(child,'Child','placeholder',Date.now());

const keys = await crypto.subtle.generateKey({ name:'ECDSA', namedCurve:'P-256' }, true, ['sign','verify']);
const spki = Buffer.from(await crypto.subtle.exportKey('spki', keys.publicKey)).toString('base64');
const receiverId = 'school.gate.1';
db.prepare('INSERT INTO ground_receivers(id,device_id,name,latitude,longitude,radius_m,public_key_spki_b64,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
  .run(receiverId, child, 'School gate', 1.3200, 103.8100, 40, spki, 1, Date.now(), Date.now());
const d1 = new FakeD1(db);
const env = { DB: d1, DEVICE_RATE: new AllowRate() };

async function signedRequest(bodyObject, signatureOverride = null) {
  const text = JSON.stringify(bodyObject);
  const bytes = new TextEncoder().encode(text);
  const signature = signatureOverride ?? Buffer.from(await crypto.subtle.sign({ name:'ECDSA', hash:'SHA-256' }, keys.privateKey, bytes)).toString('base64');
  return new Request(`https://brick.test/api/ground/${receiverId}/sighting`, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'X-Brick-Receiver-Signature':signature, 'CF-Connecting-IP':'203.0.113.5' },
    body:text
  });
}

const now = Date.now();
const slot = Math.floor(now / p5.WITNESS_SLOT_MS);
const alias = '0123456789abcdef';
db.prepare('INSERT INTO witness_aliases(alias,child_device_id,slot,valid_from_ms,valid_to_ms,source_record_id,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)')
  .run(alias, child, slot, slot*p5.WITNESS_SLOT_MS, (slot+1)*p5.WITNESS_SLOT_MS, randomUUID(), now, now + 14*24*60*60_000);

const sightingId = randomUUID();
const body = { protocol:1, sightingId, alias, observedWallMs:now, rssi:-50, txPower:-8 };
let response = await ground.handleGroundReceiverRequest(await signedRequest(body), env, receiverId);
assert.equal(response.status, 200);
let payload = await response.json();
assert.equal(payload.accepted, true);
assert.equal(payload.duplicate, false);
assert.equal(payload.resolved, true);
let row = db.prepare('SELECT * FROM ground_sightings WHERE receiver_id=? AND sighting_id=?').get(receiverId, sightingId);
assert.equal(row.child_device_id, child);
assert.equal(row.resolved, 1);
assert.equal(row.receiver_radius_m, 40);
assert.equal(row.proximity_allowance_m, 35);
assert.equal(row.uncertainty_m, 75, 'receiver site radius + conservative proximity allowance');

response = await ground.handleGroundReceiverRequest(await signedRequest(body), env, receiverId);
payload = await response.json();
assert.equal(response.status, 200);
assert.equal(payload.duplicate, true);
assert.equal(db.prepare('SELECT COUNT(*) n FROM ground_sightings WHERE receiver_id=? AND sighting_id=?').get(receiverId,sightingId).n, 1);

const tampered = { ...body, rssi:-90 };
response = await ground.handleGroundReceiverRequest(await signedRequest(tampered), env, receiverId);
assert.equal(response.status, 409, 'same sighting identity with different signed bytes must fail closed');

response = await ground.handleGroundReceiverRequest(await signedRequest({ ...body, sightingId:randomUUID() }, 'AAAA'), env, receiverId);
assert.equal(response.status, 401, 'bad receiver signature must be rejected');

// Out-of-order/offline: Ground observes an alias before the child registration reaches Cloudflare.
const lateAlias = 'fedcba9876543210';
const nextSlot = slot + 1;
const nextWall = nextSlot * p5.WITNESS_SLOT_MS + 10_000;
const pendingId = randomUUID();
response = await ground.handleGroundReceiverRequest(await signedRequest({ protocol:1,sightingId:pendingId,alias:lateAlias,observedWallMs:nextWall,rssi:-72,txPower:null }), env, receiverId);
assert.equal(response.status, 200);
payload = await response.json();
assert.equal(payload.resolved, false);
row = db.prepare('SELECT * FROM ground_sightings WHERE receiver_id=? AND sighting_id=?').get(receiverId,pendingId);
assert.equal(row.child_device_id, null);
assert.equal(row.resolved, 0);

const aliasRecord = {
  recordId:randomUUID(), epoch:1, sequence:5, elapsedRealtimeMs:500_000, wallTimeMs:nextWall,
  provider:17, family:12, capability:0, health:0, quality:3, independenceGroup:'witness.alias',
  payload:new TextEncoder().encode(JSON.stringify({ v:1,t:'a',aliases:[{a:lateAlias,s:nextSlot}] }))
};
const statements = await p5.phase5EvidenceStatements(d1, child, aliasRecord, nextWall);
await d1.batch(statements);
row = db.prepare('SELECT * FROM ground_sightings WHERE receiver_id=? AND sighting_id=?').get(receiverId,pendingId);
assert.equal(row.child_device_id, child);
assert.equal(row.resolved, 1, 'later child alias registration must resolve the fixed receiver sighting');

assert.equal(ground.groundUncertaintyM(40,-50), 75);
assert.equal(ground.groundUncertaintyM(40,-90), 290);
assert.throws(() => ground.parseGroundSighting(new TextEncoder().encode(JSON.stringify({ ...body, exactDistanceM:2 })).buffer), /unexpected/);

console.log('PHASE5_GROUND_NETWORK_PASS');
