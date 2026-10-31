import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

const [dataPath, routePath] = process.argv.slice(2);
if (!dataPath || !routePath) throw new Error('usage: test-phase3-route-graph.mjs <data-module> <route-module>');
const data = await import(pathToFileURL(dataPath).href + `?v=${Date.now()}`);
const route = await import(pathToFileURL(routePath).href + `?v=${Date.now()}`);
const DEVICE_ID = '12345678-1234-4678-9abc-def012345678';
const CLIENT_IP = '203.0.113.31';

const WALK = 1 << 2, RUN = 1 << 3, BIKE = 1 << 4, VEHICLE = 1 << 5;
assert.equal(data.modeMaskForRoad('road', 'motorway'), VEHICLE);
assert.equal(data.modeMaskForRoad('road', 'steps'), WALK | RUN);
assert.equal(data.modeMaskForRoad('road', 'cycleway'), WALK | RUN | BIKE);
assert.equal(data.modeMaskForRoad('road', 'residential'), WALK | RUN | BIKE | VEHICLE);
assert.equal(data.modeMaskForRoad('residential', 'future_unrecognized_detail'), WALK | RUN | BIKE | VEHICLE,
  'unrecognized detail must fall back to a recognized broad road class');
assert.equal(data.modeMaskForRoad('rail', 'future_unrecognized_detail'), 0,
  'unknown/non-road broad classes must still remain excluded');
assert.equal(data.modeMaskForRoad('rail', 'rail'), 0, 'unknown/non-road classes must not constrain particles');

function numberedBindings(params) { return Object.fromEntries(params.map((value, i) => [`?${i + 1}`, value])); }
class FakePrepared {
  constructor(db, sql) { this.db = db; this.sql = sql; this.params = []; }
  bind(...params) { const x = new FakePrepared(this.db, this.sql); x.params = params; return x; }
  async first() { return this.db.prepare(this.sql).get(numberedBindings(this.params)) ?? null; }
}
class FakeD1 { constructor(db) { this.db = db; } prepare(sql) { return new FakePrepared(this.db, sql); } }
class FakeRate {
  constructor() { this.calls = []; this.blocked = new Set(); }
  async limit({ key }) { this.calls.push(key); return { success: !this.blocked.has(key) }; }
  reset() { this.calls = []; this.blocked.clear(); }
}
function p1363ToDer(signature) {
  const raw = Buffer.from(signature); assert.equal(raw.length, 64);
  const integer = bytes => {
    let x = Buffer.from(bytes); while (x.length > 1 && x[0] === 0) x = x.subarray(1);
    if ((x[0] & 0x80) !== 0) x = Buffer.concat([Buffer.from([0]), x]);
    return Buffer.concat([Buffer.from([0x02, x.length]), x]);
  };
  const body = Buffer.concat([integer(raw.subarray(0, 32)), integer(raw.subarray(32))]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}
async function signature(privateKey, body) {
  const raw = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, body);
  return p1363ToDer(raw).toString('base64');
}
function request(body, sig, contentType = 'application/json') {
  const headers = { 'Content-Type': contentType, 'CF-Connecting-IP': CLIENT_IP };
  if (sig !== null) headers['X-Brick-Signature'] = sig;
  return new Request(`https://brick.invalid/api/device/${DEVICE_ID}/route-graph`, { method: 'POST', headers, body });
}

const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publicKey = Buffer.from(await crypto.subtle.exportKey('spki', keys.publicKey)).toString('base64');
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE devices(id TEXT PRIMARY KEY, public_key_spki_b64 TEXT NOT NULL, revoked_at INTEGER)');
db.prepare('INSERT INTO devices(id,public_key_spki_b64,revoked_at) VALUES(?,?,NULL)').run(DEVICE_ID, publicKey);
const rate = new FakeRate();
const env = { DB: new FakeD1(db), MAPS: {}, DEVICE_RATE: rate };
let loaderCalls = 0;
const loader = async (_maps, lon, lat) => {
  loaderCalls += 1;
  assert.equal(lat, 1.3); assert.equal(lon, 103.8);
  return [{ id: 'map:test:1', a: [103.8, 1.3], b: [103.801, 1.3], allowedModeMask: WALK | RUN | BIKE | VEHICLE, kind: 'road', kindDetail: 'residential' }];
};
const body = Buffer.from(JSON.stringify({ protocol: 1, lat: 1.3, lon: 103.8 }));

let response = await route.handleRouteGraphRequest(request(body, null), env, DEVICE_ID, loader);
assert.equal(response.status, 401); assert.deepEqual(rate.calls, [`route-graph-attempt:${CLIENT_IP}`]); assert.equal(loaderCalls, 0);
rate.reset();
response = await route.handleRouteGraphRequest(request(Buffer.alloc(1_025), Buffer.alloc(64, 1).toString('base64')), env, DEVICE_ID, loader);
assert.equal(response.status, 413); assert.deepEqual(rate.calls, [`route-graph-attempt:${CLIENT_IP}`]); assert.equal(loaderCalls, 0);

rate.reset();
const sig = await signature(keys.privateKey, body);
response = await route.handleRouteGraphRequest(request(body, sig), env, DEVICE_ID, loader);
assert.equal(response.status, 200);
const result = await response.json();
assert.equal(result.protocol, 1); assert.equal(result.radiusM, 650); assert.equal(result.segments.length, 1);
assert.equal(result.segments[0].allowedModeMask, 60); assert.equal(loaderCalls, 1);
assert.deepEqual(rate.calls, [`route-graph-attempt:${CLIENT_IP}`, `route-graph-device:${DEVICE_ID}`]);

rate.reset(); rate.blocked.add(`route-graph-device:${DEVICE_ID}`);
response = await route.handleRouteGraphRequest(request(body, sig), env, DEVICE_ID, loader);
assert.equal(response.status, 429); assert.equal(loaderCalls, 1);

rate.reset();
const extra = Buffer.from(JSON.stringify({ protocol: 1, lat: 1.3, lon: 103.8, radiusM: 50_000 }));
response = await route.handleRouteGraphRequest(request(extra, await signature(keys.privateKey, extra)), env, DEVICE_ID, loader);
assert.equal(response.status, 400, 'client cannot expand the private-map extraction radius');
assert.equal(loaderCalls, 1);

db.prepare('UPDATE devices SET revoked_at=? WHERE id=?').run(Date.now(), DEVICE_ID);
rate.reset();
response = await route.handleRouteGraphRequest(request(body, sig), env, DEVICE_ID, loader);
assert.equal(response.status, 401); assert.deepEqual(rate.calls, [`route-graph-attempt:${CLIENT_IP}`]);

console.log('PHASE3_ROUTE_GRAPH_SIGNED_BOUNDARY_PASS');
