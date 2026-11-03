import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const [historyStorePath, provenancePath] = process.argv.slice(2);
if (!historyStorePath || !provenancePath) {
  throw new Error('usage: test-phase8-history-provenance.mjs <history-store> <history-provenance>');
}
const history = await import(pathToFileURL(historyStorePath).href + `?history=${Date.now()}`);
const provenance = await import(pathToFileURL(provenancePath).href + `?provenance=${Date.now()}`);
const NOW = 2_000_000_000_000;

function packet(sequence, wallTimeMs) {
  return {
    version: 2,
    epoch: 12,
    sequence,
    elapsedRealtimeMs: sequence * 5_000,
    wallTimeMs,
    rawLatE7: 13_000_000 + sequence,
    rawLonE7: 103_800_000 + sequence,
    rawAccuracyCm: 1_000,
    trustedLatE7: 13_000_000 + sequence,
    trustedLonE7: 103_800_000 + sequence,
    uncertaintyCm: 1_000,
    speedCms: 350,
    speedAccuracyCms: 80,
    bearingCdeg: 9_000,
    bearingAccuracyCdeg: 500,
    altitudeCm: 1_000,
    verticalAccuracyCm: 500,
    batteryPct: 75,
    charging: false,
    rawAccepted: true,
    rawMock: false,
    fallback: false,
    activity: 4,
    activityConfidence: 90,
    quality: 1,
    source: 1,
    gnssUsedInFix: 12,
    gnssTotal: 18,
    gnssAverageCn0Tenth: 350,
    stepDelta: 0
  };
}

function message(body) {
  return {
    body,
    acked: 0,
    retried: 0,
    ack() { this.acked++; },
    retry() { this.retried++; }
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
        key,
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
    },
    async list({ prefix = '', cursor, limit = 1000 }) {
      assert.equal(cursor, undefined, 'test dataset should fit one R2 page');
      const keys = [...objects.keys()].filter(key => key.startsWith(prefix)).sort().slice(0, limit);
      return { objects: keys.map(key => ({ key })), truncated: false, cursor: undefined };
    }
  };
}

function response(points) {
  return new Response(JSON.stringify({
    points,
    displayPoints: points,
    truncated: false,
    summary: { distanceM: 0 }
  }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

const r2 = fakeR2();
const capturedAt = NOW - 2 * 60 * 60_000;
const firstReceipt = NOW - 2_000;
const laterRetryReceipt = NOW + 8_000;
const p = packet(7, capturedAt);

// First server acceptance records receipt provenance independently from the device event time.
const first = message({ type: 'location', deviceId: 'child-provenance', packet: p, rawPacket: p, receivedAtMs: firstReceipt });
let result = await history.processHistoryBatch({ messages: [first] }, { HISTORY: r2 });
assert.equal(result.processedMessages, 1);
assert.equal(first.acked, 1);

let enriched = await provenance.augmentPhase8HistoryProvenance(
  response([p]), { HISTORY: r2 }, 'child-provenance', capturedAt - 60_000, capturedAt + 60_000
);
let body = await enriched.json();
assert.equal(enriched.headers.get('X-Brick-History-Provenance'), 'phase8-v1');
assert.equal(body.points[0].wallTimeMs, capturedAt);
assert.equal(body.points[0].serverReceivedAtMs, firstReceipt);
assert.equal(body.displayPoints[0].serverReceivedAtMs, firstReceipt);
assert.equal(body.historyProvenance.eventTimeField, 'wallTimeMs');
assert.equal(body.historyProvenance.serverReceiptField, 'serverReceivedAtMs');
assert.equal(body.historyProvenance.receiptsAvailable, 1);
assert.equal(body.points[0].serverReceivedAtMs - body.points[0].wallTimeMs, 2 * 60 * 60_000 - 2_000);

// A later duplicate upload may rewrite the same R2 segment but must keep the earliest receipt. This
// makes retry/ACK loss auditable instead of making the packet look newly received.
const duplicate = message({ type: 'location', deviceId: 'child-provenance', packet: p, rawPacket: p, receivedAtMs: laterRetryReceipt });
result = await history.processHistoryBatch({ messages: [duplicate] }, { HISTORY: r2 });
assert.equal(result.processedMessages, 1);
assert.equal(duplicate.acked, 1);
enriched = await provenance.augmentPhase8HistoryProvenance(
  response([p]), { HISTORY: r2 }, 'child-provenance', capturedAt - 60_000, capturedAt + 60_000
);
body = await enriched.json();
assert.equal(body.points[0].serverReceivedAtMs, firstReceipt, 'retry must not replace first server receipt time');

// Backward compatibility: a point not represented in any v5 receipt table is still returned intact,
// with no invented receive timestamp.
const oldPoint = packet(99, capturedAt + 10_000);
enriched = await provenance.augmentPhase8HistoryProvenance(
  response([oldPoint]), { HISTORY: r2 }, 'child-provenance', capturedAt - 60_000, capturedAt + 60_000
);
body = await enriched.json();
assert.equal(body.points[0].wallTimeMs, oldPoint.wallTimeMs);
assert.equal(body.points[0].serverReceivedAtMs, undefined);
assert.equal(body.historyProvenance.receiptsAvailable, 0);

console.log('Phase 8 history provenance OK: capture time and first server receipt remain distinct across retries');
