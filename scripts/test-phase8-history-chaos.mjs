import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const [historyPath] = process.argv.slice(2);
if (!historyPath) throw new Error('usage: test-phase8-history-chaos.mjs <bundled-history-store>');
const history = await import(pathToFileURL(historyPath).href + `?v=${Date.now()}`);

function packet(sequence, wallTimeMs = 1_793_430_000_000) {
  return {
    version: 2,
    epoch: 7,
    sequence,
    wallTimeMs,
    elapsedMs: 1_000 + sequence,
    trustedLatE7: 13_000_000,
    trustedLonE7: 103_800_000,
    uncertaintyCm: 900,
    speedCms: 250,
    speedAccuracyCms: 50,
    bearingCdeg: 9_000,
    batteryPct: 80,
    charging: false,
    activity: 2,
    activityConfidence: 90,
    quality: 1,
    source: 1,
    fallback: false,
    rawAccepted: true
  };
}

function message(body) {
  return {
    body,
    acked: 0,
    retried: 0,
    ack() { this.acked += 1; },
    retry() { this.retried += 1; }
  };
}

function fakeR2() {
  const objects = new Map();
  let failPuts = 0;
  return {
    objects,
    failNextPuts(count = 1) { failPuts = count; },
    async get(key) {
      const row = objects.get(key);
      if (!row) return null;
      return {
        httpMetadata: row.httpMetadata,
        body: new Blob([row.bytes]).stream(),
        async text() { return new TextDecoder().decode(row.bytes); }
      };
    },
    async put(key, body, options = {}) {
      if (failPuts > 0) {
        failPuts -= 1;
        throw new Error('injected R2 write failure');
      }
      const bytes = body instanceof ArrayBuffer
        ? new Uint8Array(body)
        : body instanceof Uint8Array
          ? body
          : new Uint8Array(await new Response(body).arrayBuffer());
      objects.set(key, { bytes: bytes.slice(), httpMetadata: options.httpMetadata ?? {} });
    }
  };
}

async function readRaw(r2) {
  const entry = [...r2.objects.entries()].find(([key]) => key.startsWith('history/raw/'));
  assert.ok(entry, 'raw history segment must exist');
  const [, row] = entry;
  const decompressed = new Blob([row.bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(decompressed).text());
}

const r2 = fakeR2();
const p1 = packet(1);
const p2 = packet(2, p1.wallTimeMs + 5_000);

// A transient durable-store failure must request retry and must not ACK the Queue message.
// history-store writes raw/trusted replicas concurrently, so one sibling object is allowed to land
// before the other fails. That partial write is not treated as delivery: the queue message retries,
// and the next pass must repair/converge the segment before ACK.
r2.failNextPuts(1);
const first = message({ type: 'location', deviceId: 'child-1', packet: p1, rawPacket: p1 });
const failed = await history.processHistoryBatch({ messages: [first] }, { HISTORY: r2 });
assert.equal(first.acked, 0);
assert.equal(first.retried, 1);
assert.equal(failed.processedMessages, 0);
assert.equal(failed.retriedMessages, 1);
assert.ok(r2.objects.size <= 1, 'a failed concurrent replica write may leave at most one partial object');

// Redelivery after the fault must converge both durable objects before ACK.
const retry = message({ type: 'location', deviceId: 'child-1', packet: p1, rawPacket: p1 });
const recovered = await history.processHistoryBatch({ messages: [retry] }, { HISTORY: r2 });
assert.equal(retry.acked, 1);
assert.equal(retry.retried, 0);
assert.equal(recovered.processedMessages, 1);
assert.equal(r2.objects.size, 2, 'retry must repair/converge raw and trusted history replicas');
let raw = await readRaw(r2);
assert.deepEqual(raw.packets.map(p => p.sequence), [1]);

// Lost ACK / duplicate delivery must be logically idempotent. Duplicate sequence 1 plus a new
// sequence 2 may both be ACKed, but the stored segment contains each logical packet exactly once.
const duplicate = message({ type: 'location', deviceId: 'child-1', packet: p1, rawPacket: p1 });
const next = message({ type: 'location', deviceId: 'child-1', packet: p2, rawPacket: p2 });
const duplicateResult = await history.processHistoryBatch({ messages: [duplicate, next] }, { HISTORY: r2 });
assert.equal(duplicate.acked, 1);
assert.equal(next.acked, 1);
assert.equal(duplicateResult.processedMessages, 2);
raw = await readRaw(r2);
assert.deepEqual(raw.packets.map(p => p.sequence), [1, 2]);
assert.deepEqual(raw.trustedPackets.map(p => p.sequence), [1, 2]);

// Re-delivering the same two packets again remains stable across another read/merge/write cycle.
const duplicateAgain = message({ type: 'location', deviceId: 'child-1', packet: p1, rawPacket: p1 });
const nextAgain = message({ type: 'location', deviceId: 'child-1', packet: p2, rawPacket: p2 });
await history.processHistoryBatch({ messages: [duplicateAgain, nextAgain] }, { HISTORY: r2 });
raw = await readRaw(r2);
assert.deepEqual(raw.packets.map(p => p.sequence), [1, 2]);

console.log('Phase 8 lost-ACK, retry, duplicate and durable history chaos OK');
