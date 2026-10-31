import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const [protocolPath, ingestPath] = process.argv.slice(2);
if (!protocolPath || !ingestPath) throw new Error('usage: test-phase2-evidence.mjs <protocol-module> <ingest-module>');
const protocol = await import(pathToFileURL(protocolPath).href + `?v=${Date.now()}`);
const ingest = await import(pathToFileURL(ingestPath).href + `?v=${Date.now()}`);

function uuidBytes(id) {
  const hex = id.replaceAll('-', '');
  return Uint8Array.from({ length: 16 }, (_, i) => Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16));
}

function encodeRecord(r) {
  const group = Buffer.from(r.independenceGroup, 'utf8');
  const payload = Buffer.from(r.payload);
  const out = Buffer.alloc(52 + group.length + payload.length);
  let o = 0;
  Buffer.from(uuidBytes(r.recordId)).copy(out, o); o += 16;
  out.writeUInt32BE(r.epoch, o); o += 4;
  out.writeBigUInt64BE(BigInt(r.sequence), o); o += 8;
  out.writeBigUInt64BE(BigInt(r.elapsedRealtimeMs), o); o += 8;
  out.writeBigUInt64BE(BigInt(r.wallTimeMs), o); o += 8;
  out.writeUInt8(r.provider, o++);
  out.writeUInt8(r.family, o++);
  out.writeUInt8(r.capability, o++);
  out.writeUInt8(r.health, o++);
  out.writeUInt8(r.quality, o++);
  out.writeUInt8(group.length, o++);
  out.writeUInt16BE(payload.length, o); o += 2;
  group.copy(out, o); o += group.length;
  payload.copy(out, o);
  return out;
}

function encodeBatch(records, batchId = randomUUID()) {
  const bodies = records.map(encodeRecord);
  const out = Buffer.alloc(23 + bodies.reduce((n, x) => n + x.length, 0));
  let o = 0;
  out.writeUInt32BE(0x42524556, o); o += 4;
  out.writeUInt8(1, o++);
  Buffer.from(uuidBytes(batchId)).copy(out, o); o += 16;
  out.writeUInt16BE(records.length, o); o += 2;
  for (const body of bodies) { body.copy(out, o); o += body.length; }
  return { batchId, bytes: out };
}

function makeRecords() {
  const now = Date.now();
  return [1, 2].map(sequence => ({
    recordId: randomUUID(), epoch: 9, sequence,
    elapsedRealtimeMs: 50_000 + sequence,
    wallTimeMs: now + sequence,
    provider: 255, family: 255, capability: 0, health: 0, quality: 3,
    independenceGroup: 'dummy:test:scene',
    payload: Buffer.from(`dummy-${sequence}`)
  }));
}

function numberedBindings(params) {
  return Object.fromEntries(params.map((value, index) => [`?${index + 1}`, value]));
}

class FakePrepared {
  constructor(db, sql) { this.db = db; this.sql = sql; this.params = []; }
  bind(...params) { const x = new FakePrepared(this.db, this.sql); x.params = params; return x; }
  async first() { return this.db.prepare(this.sql).get(numberedBindings(this.params)) ?? null; }
  async all() { return { results: this.db.prepare(this.sql).all(numberedBindings(this.params)) }; }
  async run() {
    const result = this.db.prepare(this.sql).run(numberedBindings(this.params));
    return { meta: { changes: Number(result.changes) }, results: [] };
  }
}
class FakeD1 {
  constructor(db) { this.db = db; }
  prepare(sql) { return new FakePrepared(this.db, sql); }
  async batch(statements) {
    this.db.exec('BEGIN');
    try {
      const out = [];
      for (const statement of statements) out.push(await statement.run());
      this.db.exec('COMMIT');
      return out;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
class FakeR2 {
  constructor() { this.objects = new Map(); this.putCalls = 0; }
  async put(key, value, options) {
    this.putCalls += 1;
    this.objects.set(key, { bytes: Buffer.from(value), options });
  }
}

const records = makeRecords();
const first = encodeBatch(records);
const decoded = protocol.decodeEvidenceBatch(first.bytes.buffer.slice(first.bytes.byteOffset, first.bytes.byteOffset + first.bytes.byteLength));
assert.equal(decoded.batchId, first.batchId);
assert.deepEqual(decoded.records.map(x => x.sequence), [1, 2]);
assert.deepEqual(decoded.records.map(x => x.independenceGroup), ['dummy:test:scene', 'dummy:test:scene']);

const badVersion = Buffer.from(first.bytes); badVersion[4] = 2;
assert.throws(() => protocol.decodeEvidenceBatch(badVersion.buffer.slice(badVersion.byteOffset, badVersion.byteOffset + badVersion.byteLength)), /unsupported evidence protocol/);
const trailing = Buffer.concat([first.bytes, Buffer.from([0])]);
assert.throws(() => protocol.decodeEvidenceBatch(trailing.buffer.slice(trailing.byteOffset, trailing.byteOffset + trailing.byteLength)), /trailing bytes/);
const reversed = encodeBatch([...records].reverse());
assert.throws(() => protocol.decodeEvidenceBatch(reversed.bytes.buffer.slice(reversed.bytes.byteOffset, reversed.bytes.byteOffset + reversed.bytes.byteLength)), /strictly ordered/);

const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync('schema/001_init.sql', 'utf8'));
db.exec(fs.readFileSync('schema/008_v1_phase2_evidence.sql', 'utf8'));
db.prepare("INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?,?,?,?)").run('device-1', 'Test', 'key', Date.now());
const env = { DB: new FakeD1(db), HISTORY: new FakeR2() };
const ab = first.bytes.buffer.slice(first.bytes.byteOffset, first.bytes.byteOffset + first.bytes.byteLength);

let result = await ingest.persistEvidenceBatch(env, 'device-1', ab);
assert.equal(result.duplicateBatch, false);
assert.equal(result.acked.length, 2);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_records').get().n, 2);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_batches').get().n, 1);
assert.equal(env.HISTORY.putCalls, 1);

result = await ingest.persistEvidenceBatch(env, 'device-1', ab);
assert.equal(result.duplicateBatch, true);
assert.equal(result.acked.length, 2);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_records').get().n, 2);
assert.equal(env.HISTORY.putCalls, 1, 'same batch retry should not rewrite R2');

const retryNewBatch = encodeBatch(records);
result = await ingest.persistEvidenceBatch(env, 'device-1', retryNewBatch.bytes.buffer.slice(retryNewBatch.bytes.byteOffset, retryNewBatch.bytes.byteOffset + retryNewBatch.bytes.byteLength));
assert.equal(result.duplicateBatch, false);
assert.equal(result.acked.length, 2);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_records').get().n, 2, 'record-level retry must dedupe');
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_batches').get().n, 2);

const collisionRecords = structuredClone(records);
collisionRecords[0].recordId = randomUUID();
collisionRecords[0].payload = Buffer.from('changed');
const collision = encodeBatch(collisionRecords);
await assert.rejects(
  ingest.persistEvidenceBatch(env, 'device-1', collision.bytes.buffer.slice(collision.bytes.byteOffset, collision.bytes.byteOffset + collision.bytes.byteLength)),
  ingest.EvidenceConflict
);

const reusedBatchChanged = encodeBatch([{ ...records[0], payload: Buffer.from('tampered') }, records[1]], first.batchId);
await assert.rejects(
  ingest.persistEvidenceBatch(env, 'device-1', reusedBatchChanged.bytes.buffer.slice(reusedBatchChanged.bytes.byteOffset, reusedBatchChanged.bytes.byteOffset + reusedBatchChanged.bytes.byteLength)),
  ingest.EvidenceConflict
);

const state = db.prepare('SELECT last_epoch,last_sequence FROM device_evidence_state WHERE device_id=?').get('device-1');
assert.equal(state.last_epoch, 9);
assert.equal(state.last_sequence, 2);

console.log('Brick V1 Phase 2 evidence protocol + idempotent persistence integration tests OK');
