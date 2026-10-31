import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const [ingestPath] = process.argv.slice(2);
if (!ingestPath) throw new Error('usage: test-phase2-evidence-link-integrity.mjs <ingest-module>');
const ingest = await import(pathToFileURL(ingestPath).href + `?v=${Date.now()}`);

function uuidBytes(id) { return Buffer.from(id.replaceAll('-', ''), 'hex'); }
function encodeRecord(r) {
  const group = Buffer.from(r.independenceGroup, 'utf8');
  const payload = Buffer.from(r.payload);
  const out = Buffer.alloc(52 + group.length + payload.length);
  let o = 0;
  uuidBytes(r.recordId).copy(out, o); o += 16;
  out.writeUInt32BE(r.epoch, o); o += 4;
  out.writeBigUInt64BE(BigInt(r.sequence), o); o += 8;
  out.writeBigUInt64BE(BigInt(r.elapsedRealtimeMs), o); o += 8;
  out.writeBigUInt64BE(BigInt(r.wallTimeMs), o); o += 8;
  for (const value of [r.provider, r.family, r.capability, r.health, r.quality]) out.writeUInt8(value, o++);
  out.writeUInt8(group.length, o++);
  out.writeUInt16BE(payload.length, o); o += 2;
  group.copy(out, o); o += group.length;
  payload.copy(out, o);
  return out;
}
function encodeBatch(records, batchId = randomUUID()) {
  const bodies = records.map(encodeRecord);
  const out = Buffer.alloc(23 + bodies.reduce((n, body) => n + body.length, 0));
  let o = 0;
  out.writeUInt32BE(0x42524556, o); o += 4;
  out.writeUInt8(1, o++);
  uuidBytes(batchId).copy(out, o); o += 16;
  out.writeUInt16BE(records.length, o); o += 2;
  for (const body of bodies) { body.copy(out, o); o += body.length; }
  return { batchId, bytes: out };
}
function ab(bytes) { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); }
function numberedBindings(params) { return Object.fromEntries(params.map((value, i) => [`?${i + 1}`, value])); }

class FakePrepared {
  constructor(db, sql) { this.db = db; this.sql = sql; this.params = []; }
  bind(...params) { const next = new FakePrepared(this.db, this.sql); next.params = params; return next; }
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
  constructor() { this.putCalls = 0; }
  async put() { this.putCalls += 1; }
}

const now = Date.now();
const records = [1, 2].map(sequence => ({
  recordId: randomUUID(),
  epoch: 8,
  sequence,
  elapsedRealtimeMs: 80_000 + sequence,
  wallTimeMs: now + sequence,
  provider: 255,
  family: 255,
  capability: 0,
  health: 0,
  quality: 3,
  independenceGroup: 'dummy:test:link-integrity',
  payload: Buffer.from(`link-${sequence}`)
}));
const batch = encodeBatch(records);

const db = new DatabaseSync(':memory:');
// Cloudflare D1 enforces foreign keys. Keep this harness aligned with the production constraint
// instead of relying on Node SQLite's connection default.
db.exec('PRAGMA foreign_keys=ON');
assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
db.exec(fs.readFileSync('schema/001_init.sql', 'utf8'));
db.exec(fs.readFileSync('schema/008_v1_phase2_evidence.sql', 'utf8'));
db.prepare('INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?,?,?,?)')
  .run('device-link-test', 'Link integrity', 'key', Date.now());
const env = { DB: new FakeD1(db), HISTORY: new FakeR2() };

let result = await ingest.persistEvidenceBatch(env, 'device-link-test', ab(batch.bytes));
assert.equal(result.duplicateBatch, false);
assert.equal(result.acked.length, 2);
assert.equal(env.HISTORY.putCalls, 1);

// The schema itself must reject a link whose duplicated epoch/sequence does not match the exact
// authoritative evidence-record identity.
assert.throws(
  () => db.prepare('UPDATE evidence_batch_records SET epoch=? WHERE device_id=? AND batch_id=? AND record_id=?')
    .run(7, 'device-link-test', batch.batchId, records[0].recordId),
  /FOREIGN KEY constraint failed/i
);
assert.equal(
  db.prepare('SELECT epoch FROM evidence_batch_records WHERE device_id=? AND batch_id=? AND record_id=?')
    .get('device-link-test', batch.batchId, records[0].recordId).epoch,
  8
);

// Defense in depth: simulate legacy/pre-existing corruption by bypassing FK enforcement only for
// the deliberate mutation. Re-enable enforcement before Brick reads the state. The application
// must still fail closed before another R2 write rather than trusting duplicated link columns.
db.exec('PRAGMA foreign_keys=OFF');
assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 0);
db.prepare('UPDATE evidence_batch_records SET epoch=? WHERE device_id=? AND batch_id=? AND record_id=?')
  .run(7, 'device-link-test', batch.batchId, records[0].recordId);
db.exec('PRAGMA foreign_keys=ON');
assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 1, 'deliberate corruption should be visible to FK check');

await assert.rejects(
  ingest.persistEvidenceBatch(env, 'device-link-test', ab(batch.bytes)),
  error => error instanceof ingest.EvidenceConflict && /batch link does not match evidence record identity/i.test(error.message)
);
assert.equal(env.HISTORY.putCalls, 1, 'corrupt durable link retry must fail before another raw write');
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_records WHERE device_id=?').get('device-link-test').n, 2);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_batches WHERE device_id=?').get('device-link-test').n, 1);

// Repair the legacy corruption and prove both SQLite integrity and Brick's exact duplicate ACK path
// return to normal without rewriting raw storage.
db.prepare('UPDATE evidence_batch_records SET epoch=? WHERE device_id=? AND batch_id=? AND record_id=?')
  .run(8, 'device-link-test', batch.batchId, records[0].recordId);
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
result = await ingest.persistEvidenceBatch(env, 'device-link-test', ab(batch.bytes));
assert.equal(result.duplicateBatch, true);
assert.equal(result.acked.length, 2);
assert.equal(env.HISTORY.putCalls, 1);

console.log('Brick V1 Phase 2 evidence batch-link schema + readback integrity test OK');
