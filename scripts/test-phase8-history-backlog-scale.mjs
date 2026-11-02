import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const [historyPath] = process.argv.slice(2);
if (!historyPath) throw new Error('usage: test-phase8-history-backlog-scale.mjs <bundled-history-store>');
const history = await import(pathToFileURL(historyPath).href + `?v=${Date.now()}`);

const TOTAL = 10_000;
const CHUNK = 100;
const BASE = Date.UTC(2026, 9, 20, 0, 0, 0);

function packet(sequence) {
  return {
    version: 2,
    epoch: 44,
    sequence,
    wallTimeMs: BASE + sequence * 5_000,
    elapsedMs: sequence * 5_000,
    trustedLatE7: 13_000_000 + sequence,
    trustedLonE7: 103_800_000 + sequence,
    uncertaintyCm: 1_200,
    speedCms: 500,
    speedAccuracyCms: 100,
    bearingCdeg: 9_000,
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
  return {
    objects,
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
      const bytes = body instanceof ArrayBuffer
        ? new Uint8Array(body)
        : body instanceof Uint8Array
          ? body
          : new Uint8Array(await new Response(body).arrayBuffer());
      objects.set(key, { bytes: bytes.slice(), httpMetadata: options.httpMetadata ?? {} });
    }
  };
}

async function readRawSequences(r2) {
  const sequences = [];
  for (const [key, row] of r2.objects) {
    if (!key.startsWith('history/raw/')) continue;
    const stream = new Blob([row.bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const parsed = JSON.parse(await new Response(stream).text());
    for (const p of parsed.packets ?? []) sequences.push(p.sequence);
  }
  sequences.sort((a, b) => a - b);
  return sequences;
}

const r2 = fakeR2();
let acked = 0;
let retried = 0;

// Model a long offline drain as repeated Queue-sized chunks rather than one unrealistic giant call.
for (let start = 1; start <= TOTAL; start += CHUNK) {
  const end = Math.min(TOTAL, start + CHUNK - 1);
  const messages = [];
  for (let sequence = start; sequence <= end; sequence += 1) {
    const p = packet(sequence);
    messages.push(message({ type: 'location', deviceId: 'child-scale', packet: p, rawPacket: p }));
  }
  const result = await history.processHistoryBatch({ messages }, { HISTORY: r2 });
  assert.equal(result.retriedMessages, 0, `chunk ${start}-${end} unexpectedly retried`);
  assert.equal(result.processedMessages, messages.length, `chunk ${start}-${end} lost an event`);
  for (const m of messages) {
    acked += m.acked;
    retried += m.retried;
    assert.equal(m.acked, 1);
    assert.equal(m.retried, 0);
  }
}

assert.equal(acked, TOTAL);
assert.equal(retried, 0);
let stored = await readRawSequences(r2);
assert.equal(stored.length, TOTAL, '10k drain must preserve every logical history event exactly once');
for (let i = 0; i < TOTAL; i += 1) assert.equal(stored[i], i + 1, `history sequence gap/duplicate at index ${i}`);

// Replay a sparse set after a hypothetical lost ACK. All retries may be ACKed, but storage must stay
// exactly 10k logical events with no second copy of any epoch+sequence.
const duplicates = [];
for (let sequence = 1; sequence <= TOTAL; sequence += 100) {
  const p = packet(sequence);
  duplicates.push(message({ type: 'location', deviceId: 'child-scale', packet: p, rawPacket: p }));
}
const replay = await history.processHistoryBatch({ messages: duplicates }, { HISTORY: r2 });
assert.equal(replay.retriedMessages, 0);
assert.equal(replay.processedMessages, duplicates.length);
for (const m of duplicates) {
  assert.equal(m.acked, 1);
  assert.equal(m.retried, 0);
}
stored = await readRawSequences(r2);
assert.equal(stored.length, TOTAL, 'duplicate redelivery must not grow logical history');
for (let i = 0; i < TOTAL; i += 1) assert.equal(stored[i], i + 1);

// 5-second sampling across 10k points is nearly 14 hours of continuous backlog. The invariant being
// tested is scale-safe drain/dedupe; Android's local Phase 8 tests separately prove multi-day durable
// retention before transmission.
console.log(`Phase 8 history backlog scale OK: ${TOTAL} events drained with exact preservation and replay dedupe`);
