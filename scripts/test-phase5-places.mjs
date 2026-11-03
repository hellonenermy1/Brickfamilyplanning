import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

const modulePath = process.argv[2];
if (!modulePath) throw new Error('usage: test-phase5-places.mjs <phase5-places-module>');
const places = await import(pathToFileURL(modulePath).href + `?v=${Date.now()}`);

function numberedBindings(params) { return Object.fromEntries(params.map((value, i) => [`?${i + 1}`, value])); }
class FakePrepared {
  constructor(db, sql) { this.db = db; this.sql = sql; this.params = []; }
  bind(...params) { const x = new FakePrepared(this.db, this.sql); x.params = params; return x; }
  async all() { return { results: this.db.prepare(this.sql).all(numberedBindings(this.params)) }; }
  async first() { return this.db.prepare(this.sql).get(numberedBindings(this.params)) ?? null; }
}
class FakeD1 {
  constructor(db) { this.db = db; }
  prepare(sql) { return new FakePrepared(this.db, sql); }
}

const db = new DatabaseSync(':memory:');
for (const file of ['schema/001_init.sql','schema/003_phase4_safety.sql']) db.exec(fs.readFileSync(file, 'utf8'));
const child = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
for (const id of [child, other]) db.prepare('INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?,?,?,?)').run(id,id,'key',1);

const insert = db.prepare('INSERT INTO geofences(id,device_id,name,latitude,longitude,radius_m,enabled,created_at) VALUES(?,?,?,?,?,?,?,?)');
insert.run('home', child, 'Home', 1.3000, 103.8000, 120, 1, 1);
insert.run('school', child, 'School', 1.3300, 103.8200, 150, 1, 2);
insert.run('disabled', child, 'Old place', 1.3400, 103.8300, 100, 0, 3);
insert.run('other-home', other, 'Other Home', 1.3500, 103.8400, 100, 1, 4);
const d1 = new FakeD1(db);

let result = await places.listLearnedPlaceConfigs(d1, child);
assert.deepEqual(result.map(x => x.id), ['home','school']);
assert.equal(result[0].name, 'Home');
assert.equal(result[0].radiusM, 120);
assert.ok(result.every(x => x.id !== 'disabled'));
assert.ok(result.every(x => x.id !== 'other-home'), 'device isolation must be preserved');

// Cap the device payload even if a parent creates many Places.
for (let i=0;i<40;i++) insert.run(`p${String(i).padStart(2,'0')}`, child, `P${i}`, 1.30 + i*0.00001, 103.80, 50, 1, 100+i);
result = await places.listLearnedPlaceConfigs(d1, child);
assert.equal(result.length, 32);

await assert.rejects(places.listLearnedPlaceConfigs(d1, 'not-a-device'), /invalid learned-place device id/);

// Successful authenticated-health augmentation preserves existing fields and adds learnedPlaces.
const base = Response.json({ ok:true, bleAnchors:[{ id:'a' }] }, { headers:{ 'X-Test':'keep', 'Cache-Control':'private' } });
const augmented = await places.augmentHealthWithLearnedPlaces(base, d1, child);
assert.equal(augmented.status, 200);
assert.equal(augmented.headers.get('X-Test'), 'keep');
assert.equal(augmented.headers.get('Cache-Control'), 'no-store');
const body = await augmented.json();
assert.equal(body.ok, true);
assert.equal(body.bleAnchors.length, 1);
assert.equal(body.learnedPlaces.length, 32);

// Optional configuration failure must not become an intentional empty-place update. Returning the
// original health body without `learnedPlaces` lets Android retain its last encrypted place cache.
class FailingD1 { prepare() { throw new Error('temporary D1 failure'); } }
const baseOnFailure = Response.json({ ok:true, bleAnchors:[] });
const preserved = await places.augmentHealthWithLearnedPlaces(baseOnFailure, new FailingD1(), child);
const preservedBody = await preserved.json();
assert.equal(preservedBody.ok, true);
assert.equal(Object.prototype.hasOwnProperty.call(preservedBody, 'learnedPlaces'), false);

// Non-success auth/health responses must pass through untouched.
const denied = new Response(JSON.stringify({ error:'unauthorized' }), { status:401, headers:{ 'Content-Type':'application/json' } });
const deniedOut = await places.augmentHealthWithLearnedPlaces(denied, d1, child);
assert.equal(deniedOut.status, 401);
assert.deepEqual(await deniedOut.json(), { error:'unauthorized' });

console.log('PHASE5_LEARNED_PLACE_CONFIG_PASS');
