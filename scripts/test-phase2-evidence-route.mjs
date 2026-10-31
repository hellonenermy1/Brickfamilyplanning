import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const [routePath] = process.argv.slice(2);
if (!routePath) throw new Error('usage: test-phase2-evidence-route.mjs <route-module>');
const route = await import(pathToFileURL(routePath).href + `?v=${Date.now()}`);
const DEVICE_ID = '12345678-1234-4678-9abc-def012345678';
const CLIENT_IP = '203.0.113.27';

function uuidBytes(id) { return Buffer.from(id.replaceAll('-', ''), 'hex'); }
function encodeRecord(r) {
  const group = Buffer.from(r.independenceGroup), payload = Buffer.from(r.payload);
  const out = Buffer.alloc(52 + group.length + payload.length); let o = 0;
  uuidBytes(r.recordId).copy(out, o); o += 16;
  out.writeUInt32BE(r.epoch, o); o += 4;
  out.writeBigUInt64BE(BigInt(r.sequence), o); o += 8;
  out.writeBigUInt64BE(BigInt(r.elapsedRealtimeMs), o); o += 8;
  out.writeBigUInt64BE(BigInt(r.wallTimeMs), o); o += 8;
  for (const value of [r.provider, r.family, r.capability, r.health, r.quality]) out.writeUInt8(value, o++);
  out.writeUInt8(group.length, o++); out.writeUInt16BE(payload.length, o); o += 2;
  group.copy(out, o); o += group.length; payload.copy(out, o);
  return out;
}
function encodeBatch(records, batchId = randomUUID()) {
  const bodies = records.map(encodeRecord);
  const out = Buffer.alloc(23 + bodies.reduce((n, x) => n + x.length, 0)); let o = 0;
  out.writeUInt32BE(0x42524556, o); o += 4; out.writeUInt8(1, o++);
  uuidBytes(batchId).copy(out, o); o += 16; out.writeUInt16BE(records.length, o); o += 2;
  for (const body of bodies) { body.copy(out, o); o += body.length; }
  return { batchId, bytes: out };
}
function records(epoch = 21) {
  const now = Date.now();
  return [1, 2].map(sequence => ({
    recordId: randomUUID(), epoch, sequence, elapsedRealtimeMs: 100_000 + sequence, wallTimeMs: now + sequence,
    provider: 255, family: 255, capability: 0, health: 0, quality: 3,
    independenceGroup: 'dummy:test:http', payload: Buffer.from(`signed-http-${sequence}`)
  }));
}
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
    try { const out = []; for (const s of statements) out.push(await s.run()); this.db.exec('COMMIT'); return out; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
class FakeR2 {
  constructor() { this.objects = new Map(); this.putCalls = 0; }
  async put(key, value, options) { this.putCalls += 1; this.objects.set(key, { bytes: Buffer.from(value), options }); }
}
class FakeRate {
  constructor() { this.calls = []; this.blocked = new Set(); }
  async limit({ key }) { this.calls.push(key); return { success: !this.blocked.has(key) }; }
  reset() { this.calls = []; this.blocked.clear(); }
}
function requestFor(body, signature, contentType = 'application/vnd.brick.evidence') {
  const headers = { 'Content-Type': contentType, 'CF-Connecting-IP': CLIENT_IP };
  if (signature !== null) headers['X-Brick-Signature'] = signature;
  return new Request(`https://brick.invalid/api/device/${DEVICE_ID}/evidence`, { method: 'POST', headers, body });
}

// Android java.security.Signature("SHA256withECDSA") emits ASN.1 DER, while Web Crypto emits
// fixed-width IEEE-P1363 r||s. Convert the locally generated raw signature to DER so every valid
// route request exercises the same signature format produced by DeviceKeys.sign() on Android.
function p1363ToDer(signature) {
  const raw = Buffer.from(signature);
  assert.equal(raw.length, 64, 'P-256 WebCrypto signature must be 64-byte P1363');
  function integer(bytes) {
    let x = Buffer.from(bytes);
    while (x.length > 1 && x[0] === 0) x = x.subarray(1);
    if ((x[0] & 0x80) !== 0) x = Buffer.concat([Buffer.from([0]), x]);
    return Buffer.concat([Buffer.from([0x02, x.length]), x]);
  }
  const r = integer(raw.subarray(0, 32));
  const s = integer(raw.subarray(32, 64));
  const body = Buffer.concat([r, s]);
  assert.ok(body.length < 128);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}
async function signLikeAndroid(privateKey, bytes) {
  const raw = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, bytes);
  return p1363ToDer(raw).toString('base64');
}

assert.equal(route.decodeEvidenceDevicePath(DEVICE_ID), DEVICE_ID);
assert.equal(route.decodeEvidenceDevicePath('12345678-1234-5678-9abc-def012345678'), null, 'non-v4 UUID must fail');
assert.equal(route.decodeEvidenceDevicePath('%2e%2e%2fvictim'), null, 'decoded slash/path control must fail');
assert.equal(route.decodeEvidenceDevicePath('%zz'), null, 'bad URL encoding must fail');

const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publicSpkiB64 = Buffer.from(await crypto.subtle.exportKey('spki', keys.publicKey)).toString('base64');
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync('schema/001_init.sql', 'utf8'));
db.exec(fs.readFileSync('schema/008_v1_phase2_evidence.sql', 'utf8'));
db.prepare('INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?,?,?,?)').run(DEVICE_ID, 'HTTP test', publicSpkiB64, Date.now());
const rate = new FakeRate(), history = new FakeR2();
const env = { DB: new FakeD1(db), HISTORY: history, DEVICE_RATE: rate };
const items = records(), batch = encodeBatch(items);

// Missing/bad signatures consume only the requester bucket, never the child's authenticated bucket.
let response = await route.handleEvidenceRequest(requestFor(batch.bytes, null), env, DEVICE_ID);
assert.equal(response.status, 401); assert.deepEqual(rate.calls, [`evidence-attempt:${CLIENT_IP}`]);
rate.reset();
response = await route.handleEvidenceRequest(requestFor(batch.bytes, Buffer.alloc(64, 7).toString('base64')), env, DEVICE_ID);
assert.equal(response.status, 401); assert.deepEqual(rate.calls, [`evidence-attempt:${CLIENT_IP}`]);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_records').get().n, 0);

// Missing Content-Length/chunked-style oversized traffic must be cut off by the streaming body
// reader before signature verification, authenticated device limiting or durable persistence.
rate.reset();
const oversized = Buffer.alloc(65_537, 0x41);
response = await route.handleEvidenceRequest(
  requestFor(oversized, Buffer.alloc(64, 9).toString('base64')),
  env,
  DEVICE_ID
);
assert.equal(response.status, 413);
assert.deepEqual(rate.calls, [`evidence-attempt:${CLIENT_IP}`]);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_records').get().n, 0);
assert.equal(history.putCalls, 0);

// Valid requests use Android-compatible DER ECDSA and are ACKed only after D1/R2 persistence.
rate.reset();
const signature = await signLikeAndroid(keys.privateKey, batch.bytes);
response = await route.handleEvidenceRequest(requestFor(batch.bytes, signature), env, DEVICE_ID);
assert.equal(response.status, 200);
const body = await response.json();
assert.equal(body.protocol, 1); assert.equal(body.batchId, batch.batchId); assert.equal(body.acked.length, 2);
assert.deepEqual(rate.calls, [`evidence-attempt:${CLIENT_IP}`, `evidence-device:${DEVICE_ID}`]);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_records').get().n, 2);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_batches').get().n, 1);
assert.equal(history.putCalls, 1);

// Lost response -> exact signed retry: exact ACK, no second R2 write.
rate.reset();
response = await route.handleEvidenceRequest(requestFor(batch.bytes, signature), env, DEVICE_ID);
assert.equal(response.status, 200); assert.equal((await response.json()).duplicateBatch, true); assert.equal(history.putCalls, 1);

// Fresh transport batch UUID with the same durable records is record-replay deduped without storage growth.
const replay = encodeBatch(items), replaySignature = await signLikeAndroid(keys.privateKey, replay.bytes);
rate.reset();
response = await route.handleEvidenceRequest(requestFor(replay.bytes, replaySignature), env, DEVICE_ID);
assert.equal(response.status, 200); const replayBody = await response.json(); assert.equal(replayBody.duplicateRecords, true);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_batches').get().n, 1); assert.equal(history.putCalls, 1);

// A signed request that reuses a durable record identity with changed content is a permanent evidence
// identity conflict: the route must return 409 (the Android conflict-isolation contract), not 503,
// and it must not create another record/batch/raw object.
const changedItems = items.map((item, index) => index === 0 ? { ...item, payload: Buffer.from('changed-durable-content') } : item);
const conflictBatch = encodeBatch(changedItems), conflictSignature = await signLikeAndroid(keys.privateKey, conflictBatch.bytes);
rate.reset();
response = await route.handleEvidenceRequest(requestFor(conflictBatch.bytes, conflictSignature), env, DEVICE_ID);
assert.equal(response.status, 409);
assert.match((await response.json()).error, /collision|conflict|different/i);
assert.deepEqual(rate.calls, [`evidence-attempt:${CLIENT_IP}`, `evidence-device:${DEVICE_ID}`]);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_records').get().n, 2);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_batches').get().n, 1);
assert.equal(history.putCalls, 1);

// Requester limiting happens before device lookup/crypto. Device limiting happens only after proof.
rate.reset(); rate.blocked.add(`evidence-attempt:${CLIENT_IP}`);
response = await route.handleEvidenceRequest(requestFor(batch.bytes, signature), env, DEVICE_ID);
assert.equal(response.status, 429); assert.deepEqual(rate.calls, [`evidence-attempt:${CLIENT_IP}`]);
rate.reset(); rate.blocked.add(`evidence-device:${DEVICE_ID}`);
const next = encodeBatch(records(22)), nextSig = await signLikeAndroid(keys.privateKey, next.bytes);
response = await route.handleEvidenceRequest(requestFor(next.bytes, nextSig), env, DEVICE_ID);
assert.equal(response.status, 429); assert.deepEqual(rate.calls, [`evidence-attempt:${CLIENT_IP}`, `evidence-device:${DEVICE_ID}`]);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_records WHERE epoch=22').get().n, 0);

// Revocation and malformed signed protocol fail closed without persistence.
rate.reset();
db.prepare('UPDATE devices SET revoked_at=? WHERE id=?').run(Date.now(), DEVICE_ID);
response = await route.handleEvidenceRequest(requestFor(next.bytes, nextSig), env, DEVICE_ID);
assert.equal(response.status, 401); assert.deepEqual(rate.calls, [`evidence-attempt:${CLIENT_IP}`]);
db.prepare('UPDATE devices SET revoked_at=NULL WHERE id=?').run(DEVICE_ID);
rate.reset();
const malformed = Buffer.from(next.bytes); malformed[4] = 2;
response = await route.handleEvidenceRequest(requestFor(malformed, await signLikeAndroid(keys.privateKey, malformed)), env, DEVICE_ID);
assert.equal(response.status, 400);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_records WHERE epoch=22').get().n, 0);

console.log('Brick V1 Phase 2 signed evidence HTTP route integration tests OK (Android DER ECDSA + bounded stream + 409 conflict contract)');
