import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const [queuePath, historyPath] = process.argv.slice(2);
if (!queuePath || !historyPath) throw new Error('usage: test-phase8-sos-mixed-backlog.mjs <queue-v6> <history-store>');
const queue = await import(pathToFileURL(queuePath).href + `?q=${Date.now()}`);
const history = await import(pathToFileURL(historyPath).href + `?h=${Date.now()}`);

const SOS_ID = '11111111-1111-4111-8111-111111111111';
const DEVICE = 'child-sos';
const now = Date.now();

function location(sequence) {
  return {
    version: 2,
    epoch: 17,
    sequence,
    elapsedRealtimeMs: sequence * 5_000,
    wallTimeMs: now - 60_000 + sequence * 100,
    rawLatE7: 13_000_000 + sequence,
    rawLonE7: 103_800_000 + sequence,
    rawAccuracyCm: 1_500,
    trustedLatE7: 13_000_000 + sequence,
    trustedLonE7: 103_800_000 + sequence,
    uncertaintyCm: 1_500,
    speedCms: 400,
    speedAccuracyCms: 100,
    bearingCdeg: 9_000,
    bearingAccuracyCdeg: 500,
    altitudeCm: null,
    verticalAccuracyCm: null,
    batteryPct: 60,
    charging: false,
    rawAccepted: true,
    rawMock: false,
    fallback: false,
    activity: 4,
    activityConfidence: 90,
    quality: 1,
    source: 1,
    gnssUsedInFix: 10,
    gnssTotal: 15,
    gnssAverageCn0Tenth: 350,
    stepDelta: 0
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
  let failures = 0;
  return {
    objects,
    failNextPuts(count = 1) { failures = count; },
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
      if (failures > 0) { failures -= 1; throw new Error('injected R2 failure'); }
      const bytes = body instanceof ArrayBuffer
        ? new Uint8Array(body)
        : body instanceof Uint8Array
          ? body
          : new Uint8Array(await new Response(body).arrayBuffer());
      objects.set(key, { bytes: bytes.slice(), httpMetadata: options.httpMetadata ?? {} });
    }
  };
}

function fakeDb() {
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (!sql.includes('FROM safety_events')) throw new Error(`unexpected SELECT: ${sql}`);
              const [eventId, deviceId] = args;
              return eventId === SOS_ID && deviceId === DEVICE ? { ok: 1 } : null;
            }
          };
        }
      };
    }
  };
}

// Use a full 100-message queue-style batch: one critical receipt and 99 normal location records.
// Location durability is then forced to fail. The critical receipt must already be ACKed and must
// never be converted into a retry just because normal history R2 is unavailable.
const sos = message({ type: 'safety_receipt', deviceId: DEVICE, eventId: SOS_ID, kind: 'sos_started', createdAtMs: now - 2_000 });
const locations = Array.from({ length: 99 }, (_, i) => {
  const p = location(i + 1);
  return message({ type: 'location', deviceId: DEVICE, packet: p, rawPacket: p, receivedAtMs: now - 1_000 });
});
const messages = [sos, ...locations];
const env = { DB: fakeDb(), HISTORY: fakeR2() };

let safety = await queue.processSafetyReceipts({ messages }, env);
assert.equal(sos.acked, 1);
assert.equal(sos.retried, 0);
assert.deepEqual([...safety.succeededDeviceIds], [DEVICE]);
assert.equal(safety.retriedDeviceIds.size, 0);
for (const item of locations) assert.equal(item.acked + item.retried, 0, 'safety pass must not consume normal history messages');

env.HISTORY.failNextPuts(1);
let result = await history.processHistoryBatch({ messages }, env);
assert.equal(result.processedMessages, 0);
assert.equal(result.retriedMessages, 99);
assert.equal(result.ignoredMessages, 1);
assert.equal(sos.acked, 1, 'history pass must not double-ACK safety receipt');
assert.equal(sos.retried, 0, 'history outage must never retry an already durable SOS receipt');
for (const item of locations) {
  assert.equal(item.acked, 0);
  assert.equal(item.retried, 1);
}

// When R2 recovers, normal history converges independently. SOS state was already durable before
// this recovery and does not depend on draining the backlog.
const retryLocations = locations.map(item => message(item.body));
result = await history.processHistoryBatch({ messages: retryLocations }, env);
assert.equal(result.processedMessages, 99);
assert.equal(result.retriedMessages, 0);
for (const item of retryLocations) {
  assert.equal(item.acked, 1);
  assert.equal(item.retried, 0);
}

// Re-delivering the critical receipt itself remains harmless/idempotent because the durable D1 row
// is the source of truth; the receipt can be acknowledged again without creating location work.
const sosRetry = message(sos.body);
safety = await queue.processSafetyReceipts({ messages: [sosRetry] }, env);
assert.equal(sosRetry.acked, 1);
assert.equal(sosRetry.retried, 0);
assert.deepEqual([...safety.succeededDeviceIds], [DEVICE]);

console.log('Phase 8 mixed SOS/backlog torture OK: durable SOS receipt completes while failed location history retries independently');
