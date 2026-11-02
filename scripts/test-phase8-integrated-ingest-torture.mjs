import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const [historyPath, ingestPath] = process.argv.slice(2);
if (!historyPath || !ingestPath) throw new Error('usage: test-phase8-integrated-ingest-torture.mjs <history-store> <location-ingest>');
const history = await import(pathToFileURL(historyPath).href + `?h=${Date.now()}`);
const ingest = await import(pathToFileURL(ingestPath).href + `?i=${Date.now()}`);

function packet(sequence, wallTimeMs) {
  return {
    version: 2,
    epoch: 9,
    sequence,
    wallTimeMs,
    elapsedMs: sequence * 5000,
    trustedLatE7: 13_000_000 + sequence,
    trustedLonE7: 103_800_000 + sequence,
    uncertaintyCm: 1200,
    speedCms: 500,
    speedAccuracyCms: 100,
    bearingCdeg: 9000,
    batteryPct: 70,
    charging: false,
    activity: 2,
    activityConfidence: 90,
    quality: 1,
    source: 1,
    fallback: false,
    rawAccepted: true
  };
}

function queueMessage(body) {
  return { body, acked: 0, retried: 0, ack() { this.acked++; }, retry() { this.retried++; } };
}

function fakeR2() {
  const objects = new Map();
  let failures = 0;
  return {
    objects,
    failNextPuts(n = 1) { failures = n; },
    async get(key) {
      const row = objects.get(key);
      if (!row) return null;
      return { body: new Blob([row.bytes]).stream(), async text() { return new TextDecoder().decode(row.bytes); } };
    },
    async put(key, body) {
      if (failures > 0) { failures--; throw new Error('injected durable-store failure'); }
      const bytes = body instanceof Uint8Array ? body : new Uint8Array(await new Response(body).arrayBuffer());
      objects.set(key, { bytes: bytes.slice() });
    }
  };
}

function fakeDb(initialSequence) {
  const seen = new Set();
  let latest = { epoch: 9, sequence: initialSequence };
  return {
    seen,
    latest: () => latest,
    prepare(sql) { return { bind(...args) { return { sql, args }; } }; },
    async batch(statements) {
      const results = [];
      for (const s of statements) {
        if (s.sql.startsWith('INSERT OR IGNORE INTO device_events')) {
          let changes = 0;
          for (let i = 0; i < s.args.length; i += 4) {
            const [deviceId, epoch, sequence] = s.args.slice(i, i + 3);
            const key = `${deviceId}:${epoch}:${sequence}`;
            if (!seen.has(key)) { seen.add(key); changes++; }
          }
          results.push({ meta: { changes } });
        } else if (s.sql.startsWith('UPDATE devices SET last_epoch=')) {
          const [epoch, sequence] = s.args;
          const advances = latest.epoch < epoch || (latest.epoch === epoch && latest.sequence < sequence);
          if (advances) latest = { epoch, sequence };
          results.push({ meta: { changes: advances ? 1 : 0 } });
        } else {
          throw new Error(`unexpected SQL: ${s.sql}`);
        }
      }
      return results;
    }
  };
}

async function rawSequences(r2) {
  const out = [];
  for (const [key, row] of r2.objects) {
    if (!key.startsWith('history/raw/')) continue;
    const stream = new Blob([row.bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const parsed = JSON.parse(await new Response(stream).text());
    for (const p of parsed.packets ?? []) out.push(p.sequence);
  }
  return out.sort((a,b)=>a-b);
}

const now = Date.now();
const old1 = packet(40, now - 120_000);
const old2 = packet(41, now - 115_000);
const newest = packet(51, now - 5_000);
const r2 = fakeR2();
const db = fakeDb(50);
const live = [];
const env = {
  DB: db,
  HISTORY: r2,
  MAPS: {},
  EVENTS: {},
  DEVICE_RATE: {},
  BRICK_DEVICE: { idFromName(x) { return x; }, get() { return { async setLatest(p) { live.push(p.sequence); return true; } }; } }
};

// 1) Multi-day/offline-style delayed data is accepted into history identity, but current remains 50.
let persisted = await ingest.persistAccepted(env, 'child-torture', [old1, old2]);
assert.equal(persisted.insertedCount, 2);
assert.equal(persisted.liveAdvanced, false);
assert.deepEqual(db.latest(), { epoch: 9, sequence: 50 });
assert.deepEqual(live, []);

// 2) Cloud durable history write partially fails. Queue message MUST retry, never ACK.
r2.failNextPuts(1);
const failedA = queueMessage({ type: 'location', deviceId: 'child-torture', packet: old1, rawPacket: old1 });
const failedB = queueMessage({ type: 'location', deviceId: 'child-torture', packet: old2, rawPacket: old2 });
let result = await history.processHistoryBatch({ messages: [failedA, failedB] }, { HISTORY: r2 });
assert.equal(result.processedMessages, 0);
assert.equal(result.retriedMessages, 2);
assert.equal(failedA.acked + failedB.acked, 0);
assert.equal(failedA.retried + failedB.retried, 2);

// 3) Network/server returns: same logical messages retry and converge raw+trusted replicas before ACK.
const retryA = queueMessage({ type: 'location', deviceId: 'child-torture', packet: old1, rawPacket: old1 });
const retryB = queueMessage({ type: 'location', deviceId: 'child-torture', packet: old2, rawPacket: old2 });
result = await history.processHistoryBatch({ messages: [retryA, retryB] }, { HISTORY: r2 });
assert.equal(result.processedMessages, 2);
assert.equal(result.retriedMessages, 0);
assert.equal(retryA.acked + retryB.acked, 2);
assert.deepEqual(await rawSequences(r2), [40, 41]);

// 4) Lost ACK causes duplicate redelivery. Storage stays one logical copy of each packet.
const dupA = queueMessage({ type: 'location', deviceId: 'child-torture', packet: old1, rawPacket: old1 });
const dupB = queueMessage({ type: 'location', deviceId: 'child-torture', packet: old2, rawPacket: old2 });
await history.processHistoryBatch({ messages: [dupA, dupB] }, { HISTORY: r2 });
assert.deepEqual(await rawSequences(r2), [40, 41]);

// 5) A genuinely new location arrives after recovery and advances live exactly once.
persisted = await ingest.persistAccepted(env, 'child-torture', [newest]);
assert.equal(persisted.insertedCount, 1);
assert.equal(persisted.liveAdvanced, true);
assert.deepEqual(db.latest(), { epoch: 9, sequence: 51 });
assert.deepEqual(live, [51]);

// 6) Delayed old backlog arrives *after* the newest fix. It remains history only and cannot regress live.
persisted = await ingest.persistAccepted(env, 'child-torture', [packet(42, now - 110_000)]);
assert.equal(persisted.liveAdvanced, false);
assert.deepEqual(db.latest(), { epoch: 9, sequence: 51 });
assert.deepEqual(live, [51]);

// 7) Retry of newest after a lost response is idempotent: no second live transition.
persisted = await ingest.persistAccepted(env, 'child-torture', [newest]);
assert.equal(persisted.insertedCount, 0);
assert.equal(persisted.liveAdvanced, false);
assert.deepEqual(live, [51]);

console.log('Phase 8 integrated ingest torture OK: partial durable failure -> retry convergence -> duplicate dedupe -> monotonic live state');
