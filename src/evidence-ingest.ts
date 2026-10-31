import { decodeEvidenceBatch, type EvidenceBatch, type EvidenceRecord } from "./evidence-protocol";

type EvidenceEnv = { DB: D1Database; HISTORY: R2Bucket };
type BatchRow = { payload_sha256: string; record_count: number; byte_length: number; r2_key: string };
type RecordRow = {
  record_id: string;
  epoch: number;
  sequence: number;
  provider: number;
  family: number;
  capability: number;
  health: number;
  quality: number;
  independence_group: string;
  elapsed_realtime_ms: number;
  wall_time_ms: number;
  payload_sha256: string;
};

export class EvidenceConflict extends Error {}

async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const input = data instanceof Uint8Array ? data : new Uint8Array(data);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
}

function sameRecord(row: RecordRow, record: EvidenceRecord, payloadSha: string) {
  return row.record_id === record.recordId && row.epoch === record.epoch && row.sequence === record.sequence &&
    row.provider === record.provider && row.family === record.family && row.capability === record.capability &&
    row.health === record.health && row.quality === record.quality && row.independence_group === record.independenceGroup &&
    row.elapsed_realtime_ms === record.elapsedRealtimeMs && row.wall_time_ms === record.wallTimeMs && row.payload_sha256 === payloadSha;
}

function newer(a: EvidenceRecord, b: EvidenceRecord) {
  return a.epoch > b.epoch || (a.epoch === b.epoch && a.sequence > b.sequence);
}

async function readExistingRecord(env: EvidenceEnv, deviceId: string, record: EvidenceRecord): Promise<RecordRow | null> {
  return env.DB.prepare(
    "SELECT record_id,epoch,sequence,provider,family,capability,health,quality,independence_group,elapsed_realtime_ms,wall_time_ms,payload_sha256 " +
    "FROM evidence_records WHERE device_id=?1 AND ((epoch=?2 AND sequence=?3) OR record_id=?4) LIMIT 1"
  ).bind(deviceId, record.epoch, record.sequence, record.recordId).first<RecordRow>();
}

async function exactAcksForExistingBatch(env: EvidenceEnv, deviceId: string, batch: EvidenceBatch, expectedSha: string, byteLength: number) {
  const row = await env.DB.prepare(
    "SELECT payload_sha256,record_count,byte_length,r2_key FROM evidence_batches WHERE device_id=?1 AND batch_id=?2"
  ).bind(deviceId, batch.batchId).first<BatchRow>();
  if (!row) return null;
  if (row.payload_sha256 !== expectedSha || row.record_count !== batch.records.length || row.byte_length !== byteLength) {
    throw new EvidenceConflict("batch id reused with different evidence payload");
  }
  const stored = await env.DB.prepare(
    "SELECT r.record_id,r.epoch,r.sequence,r.provider,r.family,r.capability,r.health,r.quality,r.independence_group,r.elapsed_realtime_ms,r.wall_time_ms,r.payload_sha256 " +
    "FROM evidence_batch_records b JOIN evidence_records r ON r.device_id=b.device_id AND r.record_id=b.record_id " +
    "WHERE b.device_id=?1 AND b.batch_id=?2 ORDER BY b.epoch,b.sequence"
  ).bind(deviceId, batch.batchId).all<RecordRow>();
  if (stored.results.length !== batch.records.length) throw new EvidenceConflict("stored batch is incomplete");
  const payloadHashes = await Promise.all(batch.records.map(r => sha256Hex(r.payload)));
  for (let i = 0; i < batch.records.length; i++) {
    if (!sameRecord(stored.results[i], batch.records[i], payloadHashes[i])) throw new EvidenceConflict("stored evidence record does not match retry");
  }
  return batch.records.map(r => ({ epoch: r.epoch, sequence: r.sequence, recordId: r.recordId }));
}

export async function persistEvidenceBatch(env: EvidenceEnv, deviceId: string, buffer: ArrayBuffer) {
  const batch = decodeEvidenceBatch(buffer);
  const batchSha = await sha256Hex(buffer);
  const existingAcks = await exactAcksForExistingBatch(env, deviceId, batch, batchSha, buffer.byteLength);
  if (existingAcks) return { protocol: 1, batchId: batch.batchId, acked: existingAcks, duplicateBatch: true };

  const payloadHashes = await Promise.all(batch.records.map(r => sha256Hex(r.payload)));
  for (let i = 0; i < batch.records.length; i++) {
    const existing = await readExistingRecord(env, deviceId, batch.records[i]);
    if (existing && !sameRecord(existing, batch.records[i], payloadHashes[i])) {
      throw new EvidenceConflict("evidence sequence or record id collision");
    }
  }

  // Raw object paths use a one-way device key rather than a sanitized identifier. The batch hash is
  // part of the object key as well: if two concurrent signed requests reuse one batch UUID with
  // different bytes before D1 has claimed the UUID, they write different objects instead of racing
  // to overwrite the same raw evidence object. The losing conflicting object is harmless and ages
  // out under the bounded raw-evidence lifecycle rule.
  const deviceKey = await sha256Hex(new TextEncoder().encode(deviceId));
  const r2Key = `evidence/raw/${deviceKey}/${batch.batchId}-${batchSha}.brev`;
  await env.HISTORY.put(r2Key, buffer, {
    httpMetadata: { contentType: "application/vnd.brick.evidence" },
    customMetadata: {
      deviceKey,
      protocol: "1",
      recordCount: String(batch.records.length),
      sha256: batchSha
    }
  });

  const now = Date.now();
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      "INSERT OR IGNORE INTO evidence_batches(device_id,batch_id,protocol,record_count,byte_length,payload_sha256,r2_key,received_at) VALUES(?1,?2,1,?3,?4,?5,?6,?7)"
    ).bind(deviceId, batch.batchId, batch.records.length, buffer.byteLength, batchSha, r2Key, now)
  ];

  const latestByProvider = new Map<number, EvidenceRecord>();
  batch.records.forEach((record, index) => {
    statements.push(
      env.DB.prepare(
        "INSERT OR IGNORE INTO evidence_records(device_id,epoch,sequence,record_id,provider,family,capability,health,quality,independence_group,elapsed_realtime_ms,wall_time_ms,payload_sha256,first_seen_at) " +
        "VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)"
      ).bind(deviceId, record.epoch, record.sequence, record.recordId, record.provider, record.family, record.capability, record.health, record.quality,
        record.independenceGroup, record.elapsedRealtimeMs, record.wallTimeMs, payloadHashes[index], now),
      env.DB.prepare(
        "INSERT OR IGNORE INTO evidence_batch_records(device_id,batch_id,record_id,epoch,sequence) VALUES(?1,?2,?3,?4,?5)"
      ).bind(deviceId, batch.batchId, record.recordId, record.epoch, record.sequence)
    );
    const current = latestByProvider.get(record.provider);
    if (!current || newer(record, current)) latestByProvider.set(record.provider, record);
  });

  for (const record of latestByProvider.values()) {
    statements.push(
      env.DB.prepare(
        "INSERT INTO evidence_provider_health(device_id,provider,capability,health,reason,last_epoch,last_sequence,observed_wall_ms,received_at) " +
        "VALUES(?1,?2,?3,?4,NULL,?5,?6,?7,?8) " +
        "ON CONFLICT(device_id,provider) DO UPDATE SET " +
        "capability=CASE WHEN excluded.last_epoch>last_epoch OR (excluded.last_epoch=last_epoch AND excluded.last_sequence>last_sequence) THEN excluded.capability ELSE capability END," +
        "health=CASE WHEN excluded.last_epoch>last_epoch OR (excluded.last_epoch=last_epoch AND excluded.last_sequence>last_sequence) THEN excluded.health ELSE health END," +
        "last_epoch=CASE WHEN excluded.last_epoch>last_epoch OR (excluded.last_epoch=last_epoch AND excluded.last_sequence>last_sequence) THEN excluded.last_epoch ELSE last_epoch END," +
        "last_sequence=CASE WHEN excluded.last_epoch>last_epoch OR (excluded.last_epoch=last_epoch AND excluded.last_sequence>last_sequence) THEN excluded.last_sequence ELSE last_sequence END," +
        "observed_wall_ms=CASE WHEN excluded.last_epoch>last_epoch OR (excluded.last_epoch=last_epoch AND excluded.last_sequence>last_sequence) THEN excluded.observed_wall_ms ELSE observed_wall_ms END," +
        "received_at=CASE WHEN excluded.last_epoch>last_epoch OR (excluded.last_epoch=last_epoch AND excluded.last_sequence>last_sequence) THEN excluded.received_at ELSE received_at END"
      ).bind(deviceId, record.provider, record.capability, record.health, record.epoch, record.sequence, record.wallTimeMs, now)
    );
  }

  const newest = batch.records[batch.records.length - 1];
  statements.push(
    env.DB.prepare(
      "INSERT INTO device_evidence_state(device_id,last_epoch,last_sequence,last_received_at) VALUES(?1,?2,?3,?4) " +
      "ON CONFLICT(device_id) DO UPDATE SET " +
      "last_epoch=CASE WHEN excluded.last_epoch>last_epoch OR (excluded.last_epoch=last_epoch AND excluded.last_sequence>last_sequence) THEN excluded.last_epoch ELSE last_epoch END," +
      "last_sequence=CASE WHEN excluded.last_epoch>last_epoch OR (excluded.last_epoch=last_epoch AND excluded.last_sequence>last_sequence) THEN excluded.last_sequence ELSE last_sequence END," +
      "last_received_at=CASE WHEN excluded.last_epoch>last_epoch OR (excluded.last_epoch=last_epoch AND excluded.last_sequence>last_sequence) THEN excluded.last_received_at ELSE last_received_at END"
    ).bind(deviceId, newest.epoch, newest.sequence, now)
  );
  await env.DB.batch(statements);

  const verified = await exactAcksForExistingBatch(env, deviceId, batch, batchSha, buffer.byteLength);
  if (!verified) throw new Error("evidence batch persistence verification failed");
  return { protocol: 1, batchId: batch.batchId, acked: verified, duplicateBatch: false };
}
