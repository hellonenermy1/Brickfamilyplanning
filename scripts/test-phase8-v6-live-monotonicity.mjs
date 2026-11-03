import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const [modulePath, orderPath] = process.argv.slice(2);
if (!modulePath || !orderPath) throw new Error('usage: test-phase8-v6-live-monotonicity.mjs <bundled-location-ingest> <live-state-order>');
const ingest = await import(pathToFileURL(modulePath).href + `?v=${Date.now()}`);
const liveOrder = await import(pathToFileURL(orderPath).href + `?o=${Date.now()}`);

function packet(epoch, sequence, wallTimeMs) {
  return {
    version: 2,
    epoch,
    sequence,
    elapsedRealtimeMs: 100_000 + sequence,
    wallTimeMs,
    rawLatE7: null,
    rawLonE7: null,
    rawAccuracyCm: null,
    trustedLatE7: 13_100_000,
    trustedLonE7: 103_800_000,
    uncertaintyCm: 20_000,
    speedCms: 300,
    speedAccuracyCms: 100,
    bearingCdeg: 9_000,
    bearingAccuracyCdeg: 500,
    altitudeCm: null,
    verticalAccuracyCm: null,
    batteryPct: 80,
    charging: false,
    rawAccepted: false,
    rawMock: false,
    fallback: true,
    activity: 2,
    activityConfidence: 80,
    quality: 4,
    source: 2,
    gnssUsedInFix: 0,
    gnssTotal: 0,
    gnssAverageCn0Tenth: 0,
    stepDelta: 0
  };
}

function fakeDb(initialEpoch, initialSequence) {
  const seen = new Set();
  const latest = new Map([['child-1', { epoch: initialEpoch, sequence: initialSequence }]]);
  return {
    seen,
    latest,
    prepare(sql) {
      return { bind(...args) { return { sql, args }; } };
    },
    async batch(statements) {
      const out = [];
      for (const statement of statements) {
        if (statement.sql.startsWith('INSERT OR IGNORE INTO device_events')) {
          let changes = 0;
          for (let i = 0; i < statement.args.length; i += 4) {
            const [deviceId, epoch, sequence] = statement.args.slice(i, i + 3);
            const key = `${deviceId}:${epoch}:${sequence}`;
            if (!seen.has(key)) { seen.add(key); changes += 1; }
          }
          out.push({ meta: { changes } });
          continue;
        }
        if (statement.sql.startsWith('UPDATE devices SET last_epoch=')) {
          const [epoch, sequence, , deviceId] = statement.args;
          const current = latest.get(deviceId) ?? { epoch: 0, sequence: 0 };
          const advances = current.epoch < epoch || (current.epoch === epoch && current.sequence < sequence);
          if (advances) latest.set(deviceId, { epoch, sequence });
          out.push({ meta: { changes: advances ? 1 : 0 } });
          continue;
        }
        throw new Error(`unexpected statement in monotonicity test: ${statement.sql}`);
      }
      return out;
    }
  };
}

const t = Date.now() - 60_000;
const db = fakeDb(7, 100);
const liveCalls = [];
let liveCurrent = { epoch: 7, sequence: 100, wallTimeMs: t - 5_000 };
const env = {
  DB: db,
  HISTORY: {},
  MAPS: {},
  EVENTS: {},
  DEVICE_RATE: {},
  BRICK_DEVICE: {
    idFromName(name) { return name; },
    get(id) {
      assert.equal(id, 'child-1');
      return {
        async setLatest(value) {
          const advance = liveOrder.shouldAdvanceLiveState(value, liveCurrent);
          if (advance) {
            liveCurrent = { epoch: value.epoch, sequence: value.sequence, wallTimeMs: value.wallTimeMs };
            liveCalls.push(value);
          }
          return advance;
        }
      };
    }
  }
};

// A delayed offline packet is new history, but older in capture time and must not move current state.
let result = await ingest.persistAccepted(env, 'child-1', [packet(7, 90, t - 20_000)]);
assert.equal(result.insertedCount, 1);
assert.equal(result.liveAdvanced, false);
assert.deepEqual(db.latest.get('child-1'), { epoch: 7, sequence: 100 });
assert.equal(liveCalls.length, 0);

// Replaying that same logical packet is idempotent and does not re-hit the DO.
result = await ingest.persistAccepted(env, 'child-1', [packet(7, 90, t - 20_000)]);
assert.equal(result.insertedCount, 0);
assert.equal(result.liveAdvanced, false);
assert.equal(liveCalls.length, 0);

// A genuinely newer capture advances exactly once.
result = await ingest.persistAccepted(env, 'child-1', [packet(7, 101, t)]);
assert.equal(result.insertedCount, 1);
assert.equal(result.liveAdvanced, true);
assert.deepEqual(db.latest.get('child-1'), { epoch: 7, sequence: 101 });
assert.equal(liveCalls.length, 1);
assert.equal(liveCalls[0].sequence, 101);

// Lost ACK / retry of the latest packet is a duplicate: no second live transition.
result = await ingest.persistAccepted(env, 'child-1', [packet(7, 101, t)]);
assert.equal(result.insertedCount, 0);
assert.equal(result.liveAdvanced, false);
assert.equal(liveCalls.length, 1);

// A reboot/new epoch with a newer capture time legitimately advances even when sequence restarts.
result = await ingest.persistAccepted(env, 'child-1', [packet(8, 1, t + 5_000)]);
assert.equal(result.insertedCount, 1);
assert.equal(result.liveAdvanced, true);
assert.deepEqual(db.latest.get('child-1'), { epoch: 8, sequence: 1 });
assert.equal(liveCalls.length, 2);

// Cross-epoch backlog can then deliver an older logical epoch with an even NEWER capture time. D1
// keeps the epoch-8 watermark, but the live read model must not hide this newer captured location.
result = await ingest.persistAccepted(env, 'child-1', [packet(7, 102, t + 10_000)]);
assert.equal(result.insertedCount, 1);
assert.equal(result.liveAdvanced, true);
assert.deepEqual(db.latest.get('child-1'), { epoch: 8, sequence: 1 });
assert.equal(liveCalls.length, 3);
assert.equal(liveCalls[2].epoch, 7);
assert.equal(liveCalls[2].sequence, 102);

assert.deepEqual([...db.seen].sort(), ['child-1:7:101', 'child-1:7:102', 'child-1:7:90', 'child-1:8:1']);

console.log('Phase 8 V6 live monotonicity + retry idempotency OK across out-of-order reboot epochs');
