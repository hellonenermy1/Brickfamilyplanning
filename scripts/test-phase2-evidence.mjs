import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const [protocolPath, ingestPath] = process.argv.slice(2);
if (!protocolPath || !ingestPath) throw new Error('usage: test-phase2-evidence.mjs <protocol-module> <ingest-module>');
const protocol = await import(pathToFileURL(protocolPath).href + `?v=${Date.now()}`);
const ingest = await import(pathToFileURL(ingestPath).href + `?v=${Date.now()}`);
const GOLDEN_HEX = '425245560100112233445566778899aabbccddeeff000112345678123456789abcdef01234567800000007000000000000002a00000000075bcd150000019a3b3636fbffff00000310000d64756d6d793a746573743a7363656e657068617365322d676f6c64656e';

function uuidBytes(id) { return Buffer.from(id.replaceAll('-', ''), 'hex'); }
function encodeRecord(r) {
  const group = Buffer.from(r.independenceGroup, 'utf8'), payload = Buffer.from(r.payload);
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
function makeRecords(epoch = 9, prefix = 'dummy') {
  const now = Date.now();
  return [1, 2].map(sequence => ({
    recordId: randomUUID(), epoch, sequence, elapsedRealtimeMs: 50_000 + sequence, wallTimeMs: now + sequence,
    provider: 255, family: 255, capability: 0, health: 0, quality: 3,
    independenceGroup: `dummy:test:${prefix}`, payload: Buffer.from(`${prefix}-${sequence}`)
  }));
}
function ab(bytes) { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); }
function numberedBindings(params) { return Object.fromEntries(params.map((value, i) => [`?${i + 1}`, value])); }

class FakePrepared {
  constructor(db, sql) { this.db = db; this.sql = sql; this.params = []; }
  bind(...params) { const x = new FakePrepared(this.db, this.sql); x.params = params; return x; }
  async first() { return this.db.prepare(this.sql).get(numberedBindings(this.params)) ?? null; }
  async all() { return { results: this.db.prepare(this.sql).all(numberedBindings(this.params)) }; }
  async run() { const r = this.db.prepare(this.sql).run(numberedBindings(this.params)); return { meta: { changes: Number(r.changes) }, results: [] }; }
}
class FakeD1 {
  constructor(db) { this.db = db; this.beforeBatch = null; }
  prepare(sql) { return new FakePrepared(this.db, sql); }
  async batch(statements) {
    if (this.beforeBatch) { const hook = this.beforeBatch; this.beforeBatch = null; await hook(); }
    this.db.exec('BEGIN');
    try {
      const out = []; for (const statement of statements) out.push(await statement.run());
      this.db.exec('COMMIT'); return out;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
class FakeR2 {
  constructor() { this.objects = new Map(); this.putCalls = 0; }
  async put(key, value, options) { this.putCalls += 1; this.objects.set(key, { bytes: Buffer.from(value), options }); }
}

// Cross-language protocol vector shared with Android instrumentation.
const goldenRecord = {
  recordId: '12345678-1234-5678-9abc-def012345678', epoch: 7, sequence: 42,
  elapsedRealtimeMs: 123_456_789, wallTimeMs: 1_761_930_000_123,
  provider: 255, family: 255, capability: 0, health: 0, quality: 3,
  independenceGroup: 'dummy:test:scene', payload: Buffer.from('phase2-golden')
};
const golden = encodeBatch([goldenRecord], '00112233-4455-6677-8899-aabbccddeeff');
assert.equal(golden.bytes.toString('hex'), GOLDEN_HEX);
const decodedGolden = protocol.decodeEvidenceBatch(ab(golden.bytes));
assert.equal(decodedGolden.batchId, golden.batchId);
assert.equal(decodedGolden.records[0].recordId, goldenRecord.recordId);
assert.equal(Buffer.from(decodedGolden.records[0].payload).toString(), 'phase2-golden');

const records = makeRecords();
const first = encodeBatch(records);
assert.deepEqual(protocol.decodeEvidenceBatch(ab(first.bytes)).records.map(x => x.sequence), [1, 2]);
const badVersion = Buffer.from(first.bytes); badVersion[4] = 2;
assert.throws(() => protocol.decodeEvidenceBatch(ab(badVersion)), /unsupported evidence protocol/);
assert.throws(() => protocol.decodeEvidenceBatch(ab(Buffer.concat([first.bytes, Buffer.from([0])]))), /trailing bytes/);
assert.throws(() => protocol.decodeEvidenceBatch(ab(encodeBatch([...records].reverse()).bytes)), /strictly ordered/);
const badEpoch = Buffer.from(first.bytes); badEpoch.writeUInt32BE(0x80000000, 39);
assert.throws(() => protocol.decodeEvidenceBatch(ab(badEpoch)), /Android wire range/);

const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync('schema/001_init.sql', 'utf8'));
db.exec(fs.readFileSync('schema/008_v1_phase2_evidence.sql', 'utf8'));
db.prepare("INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?,?,?,?)").run('device-1', 'Test', 'key', Date.now());
const env = { DB: new FakeD1(db), HISTORY: new FakeR2() };

let result = await ingest.persistEvidenceBatch(env, 'device-1', ab(first.bytes));
assert.equal(result.duplicateBatch, false); assert.equal(result.acked.length, 2);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_records').get().n, 2);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_batches').get().n, 1);
assert.equal(env.HISTORY.putCalls, 1);
const firstSha = createHash('sha256').update(first.bytes).digest('hex');
const firstRow = db.prepare('SELECT payload_sha256,r2_key FROM evidence_batches WHERE device_id=? AND batch_id=?').get('device-1', first.batchId);
assert.equal(firstRow.payload_sha256, firstSha);
assert.ok(firstRow.r2_key.endsWith(`/${first.batchId}-${firstSha}.brev`));
assert.equal(env.HISTORY.objects.get(firstRow.r2_key).options.customMetadata.sha256, firstSha);

// Same exact batch is a pure ACK retry and never rewrites raw storage.
result = await ingest.persistEvidenceBatch(env, 'device-1', ab(first.bytes));
assert.equal(result.duplicateBatch, true); assert.equal(env.HISTORY.putCalls, 1);

// Same durable records under a fresh transport batch UUID must ACK without storage amplification.
const replay = encodeBatch(records);
result = await ingest.persistEvidenceBatch(env, 'device-1', ab(replay.bytes));
assert.equal(result.duplicateBatch, false); assert.equal(result.duplicateRecords, true); assert.equal(result.acked.length, 2);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_records').get().n, 2);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_batches').get().n, 1);
assert.equal(env.HISTORY.putCalls, 1);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_batches WHERE batch_id=?').get(replay.batchId).n, 0);

// Provider state follows durable epoch/sequence, not a regressed wall clock.
const clockRegressed = { ...records[1], recordId: randomUUID(), sequence: 3,
  elapsedRealtimeMs: records[1].elapsedRealtimeMs + 1, wallTimeMs: records[0].wallTimeMs - 100_000,
  health: 1, payload: Buffer.from('clock-regressed-newer-sequence') };
const clockBatch = encodeBatch([clockRegressed]);
result = await ingest.persistEvidenceBatch(env, 'device-1', ab(clockBatch.bytes));
assert.equal(result.acked.length, 1);
const health = db.prepare('SELECT health,last_epoch,last_sequence,observed_wall_ms FROM evidence_provider_health WHERE device_id=? AND provider=?').get('device-1', 255);
assert.equal(health.health, 1); assert.equal(health.last_epoch, 9); assert.equal(health.last_sequence, 3); assert.equal(health.observed_wall_ms, clockRegressed.wallTimeMs);

// Batch-link identity is enforced at the database boundary. A mismatched duplicated epoch/sequence
// must be rejected immediately; an exact durable retry then remains a pure ACK retry with no raw
// storage amplification.
const linkIntegrityRecords = makeRecords(8, 'link-integrity'), linkIntegrity = encodeBatch(linkIntegrityRecords);
result = await ingest.persistEvidenceBatch(env, 'device-1', ab(linkIntegrity.bytes));
assert.equal(result.acked.length, 2);
const rawWritesAfterLinkPersist = env.HISTORY.putCalls;
assert.throws(
  () => db.prepare('UPDATE evidence_batch_records SET epoch=? WHERE device_id=? AND batch_id=? AND record_id=?')
    .run(7, 'device-1', linkIntegrity.batchId, linkIntegrityRecords[0].recordId),
  /evidence batch link identity mismatch/i
);
assert.equal(env.HISTORY.putCalls, rawWritesAfterLinkPersist);
result = await ingest.persistEvidenceBatch(env, 'device-1', ab(linkIntegrity.bytes));
assert.equal(result.duplicateBatch, true); assert.equal(result.acked.length, 2);
assert.equal(env.HISTORY.putCalls, rawWritesAfterLinkPersist);

// Two identical requests racing must converge to the already durable exact ACK instead of turning
// the losing unique-constraint claim into a false 503/storage failure.
const identicalRaceRecords = makeRecords(40, 'identical-race'), identicalRace = encodeBatch(identicalRaceRecords);
env.DB.beforeBatch = async () => {
  const winner = await ingest.persistEvidenceBatch(env, 'device-1', ab(identicalRace.bytes));
  assert.equal(winner.duplicateBatch, false);
};
result = await ingest.persistEvidenceBatch(env, 'device-1', ab(identicalRace.bytes));
assert.equal(result.duplicateBatch, true); assert.equal(result.raced, true); assert.equal(result.acked.length, 2);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_batches WHERE device_id=? AND batch_id=?').get('device-1', identicalRace.batchId).n, 1);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_records WHERE device_id=? AND epoch=?').get('device-1', 40).n, 2);

// Simulate a competing request claiming the same batch UUID with different bytes between preflight
// and D1 batch(). The exact-batch reconciliation must still fail closed as EvidenceConflict.
const raceRecords = makeRecords(44, 'race'), race = encodeBatch(raceRecords), competitorSha = 'f'.repeat(64);
env.DB.beforeBatch = async () => {
  db.prepare('INSERT INTO evidence_batches(device_id,batch_id,protocol,record_count,byte_length,payload_sha256,r2_key,received_at) VALUES(?,?,?,?,?,?,?,?)')
    .run('device-1', race.batchId, 1, raceRecords.length, race.bytes.length, competitorSha, 'evidence/raw/competitor.brev', Date.now());
};
await assert.rejects(ingest.persistEvidenceBatch(env, 'device-1', ab(race.bytes)), ingest.EvidenceConflict);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_records WHERE device_id=? AND epoch=?').get('device-1', 44).n, 0);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_batch_records WHERE device_id=? AND batch_id=?').get('device-1', race.batchId).n, 0);
assert.equal(db.prepare('SELECT payload_sha256 FROM evidence_batches WHERE device_id=? AND batch_id=?').get('device-1', race.batchId).payload_sha256, competitorSha);

// If a different valid batch wins one exact record identity during our transaction window, retry
// once from fresh D1 state: reuse the exact winner record, persist the remaining new record and
// commit a complete batch rather than returning a false storage failure.
const mixedRaceRecords = makeRecords(52, 'mixed-race'), mixedRace = encodeBatch(mixedRaceRecords);
const winnerOne = encodeBatch([mixedRaceRecords[0]]);
env.DB.beforeBatch = async () => {
  const winner = await ingest.persistEvidenceBatch(env, 'device-1', ab(winnerOne.bytes));
  assert.equal(winner.duplicateBatch, false);
};
result = await ingest.persistEvidenceBatch(env, 'device-1', ab(mixedRace.bytes));
assert.equal(result.duplicateBatch, false); assert.equal(result.acked.length, 2);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_records WHERE device_id=? AND epoch=?').get('device-1', 52).n, 2);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_batches WHERE device_id=? AND batch_id=?').get('device-1', mixedRace.batchId).n, 1);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_batch_records WHERE device_id=? AND batch_id=?').get('device-1', mixedRace.batchId).n, 2);

// A different signed batch claiming the same record identity with different content still fails
// closed. The losing batch claim/link rows must roll back completely.
const recordRaceRecords = makeRecords(55, 'record-race'), recordRace = encodeBatch(recordRaceRecords);
const competitorRecordId = randomUUID();
env.DB.beforeBatch = async () => {
  db.prepare(
    'INSERT INTO evidence_records(device_id,epoch,sequence,record_id,provider,family,capability,health,quality,independence_group,elapsed_realtime_ms,wall_time_ms,payload_sha256,first_seen_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run('device-1', 55, 1, competitorRecordId, 255, 255, 0, 0, 3, 'dummy:test:competitor', 1, Date.now(), 'e'.repeat(64), Date.now());
};
await assert.rejects(ingest.persistEvidenceBatch(env, 'device-1', ab(recordRace.bytes)), ingest.EvidenceConflict);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_batches WHERE device_id=? AND batch_id=?').get('device-1', recordRace.batchId).n, 0, 'losing record-race batch claim must roll back');
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_batch_records WHERE device_id=? AND batch_id=?').get('device-1', recordRace.batchId).n, 0);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_records WHERE device_id=? AND epoch=?').get('device-1', 55).n, 1, 'only competitor record should remain');

// Record identity collisions and changed bytes under an accepted batch UUID fail closed.
const collisionRecords = structuredClone(records); collisionRecords[0].recordId = randomUUID(); collisionRecords[0].payload = Buffer.from('changed');
await assert.rejects(ingest.persistEvidenceBatch(env, 'device-1', ab(encodeBatch(collisionRecords).bytes)), ingest.EvidenceConflict);
const changedBatch = encodeBatch([{ ...records[0], payload: Buffer.from('tampered') }, records[1]], first.batchId);
await assert.rejects(ingest.persistEvidenceBatch(env, 'device-1', ab(changedBatch.bytes)), ingest.EvidenceConflict);

const state = db.prepare('SELECT last_epoch,last_sequence FROM device_evidence_state WHERE device_id=?').get('device-1');
assert.equal(state.last_epoch, 52); assert.equal(state.last_sequence, 2);
console.log('Brick V1 Phase 2 evidence protocol + idempotent/concurrent persistence + link-integrity tests OK');
