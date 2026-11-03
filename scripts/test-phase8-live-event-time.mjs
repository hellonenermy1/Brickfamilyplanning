import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const [ingestPath, orderPath] = process.argv.slice(2);
if (!ingestPath || !orderPath) throw new Error('usage: test-phase8-live-event-time.mjs <location-ingest> <live-state-order>');
const ingest = await import(pathToFileURL(ingestPath).href + `?ingest=${Date.now()}`);
const order = await import(pathToFileURL(orderPath).href + `?order=${Date.now()}`);

const T = 2_000_000_000_000;
assert.equal(order.shouldAdvanceLiveState({ epoch: 8, sequence: 1, wallTimeMs: T - 60_000 }, { epoch: 7, sequence: 100, wallTimeMs: T }), false, 'new epoch must not regress event time');
assert.equal(order.shouldAdvanceLiveState({ epoch: 8, sequence: 1, wallTimeMs: T }, { epoch: 7, sequence: 100, wallTimeMs: T }), true, 'equal event time may advance logical order');
assert.equal(order.shouldAdvanceLiveState({ epoch: 7, sequence: 101, wallTimeMs: T + 1 }, { epoch: 8, sequence: 1, wallTimeMs: T }), true, 'newer capture time must win even when an older epoch arrives later');
assert.equal(order.shouldAdvanceLiveState({ epoch: 7, sequence: 101, wallTimeMs: T - 1 }, { epoch: 8, sequence: 1, wallTimeMs: T }), false, 'older capture must never replace current');
assert.equal(order.shouldAdvanceLiveState({ epoch: 8, sequence: 1, wallTimeMs: 0 }, { epoch: 7, sequence: 100, wallTimeMs: T }), false, 'invalid event time must fail closed when supplied');
assert.equal(order.shouldAdvanceLiveState({ epoch: 8, sequence: 1 }, { epoch: 7, sequence: 100 }), true, 'legacy no-wall-time callers retain logical ordering semantics');

function packet(epoch, sequence, wallTimeMs) {
  return {
    version: 2, epoch, sequence, elapsedRealtimeMs: 10_000 + sequence, wallTimeMs,
    rawLatE7: null, rawLonE7: null, rawAccuracyCm: null,
    trustedLatE7: 13_100_000, trustedLonE7: 103_800_000, uncertaintyCm: 25_000,
    speedCms: 300, speedAccuracyCms: 100, bearingCdeg: 9_000, bearingAccuracyCdeg: 500,
    altitudeCm: null, verticalAccuracyCm: null, batteryPct: 80, charging: false,
    rawAccepted: false, rawMock: false, fallback: true,
    activity: 2, activityConfidence: 80, quality: 4, source: 2,
    gnssUsedInFix: 0, gnssTotal: 0, gnssAverageCn0Tenth: 0, stepDelta: 0
  };
}

function fakeDb(initialEpoch, initialSequence) {
  const seen = new Set();
  let watermark = { epoch: initialEpoch, sequence: initialSequence };
  return {
    seen,
    watermark: () => watermark,
    prepare(sql) { return { bind(...args) { return { sql, args }; } }; },
    async batch(statements) {
      const out = [];
      for (const statement of statements) {
        if (statement.sql.startsWith('INSERT OR IGNORE INTO device_events')) {
          let changes = 0;
          for (let i = 0; i < statement.args.length; i += 4) {
            const [deviceId, epoch, sequence] = statement.args.slice(i, i + 3);
            const key = `${deviceId}:${epoch}:${sequence}`;
            if (!seen.has(key)) { seen.add(key); changes++; }
          }
          out.push({ meta: { changes } });
        } else if (statement.sql.startsWith('UPDATE devices SET last_epoch=')) {
          const [epoch, sequence] = statement.args;
          const advances = watermark.epoch < epoch || (watermark.epoch === epoch && watermark.sequence < sequence);
          if (advances) watermark = { epoch, sequence };
          out.push({ meta: { changes: advances ? 1 : 0 } });
        } else {
          throw new Error(`unexpected SQL in event-time test: ${statement.sql}`);
        }
      }
      return out;
    }
  };
}

const db = fakeDb(7, 100);
let live = { epoch: 7, sequence: 100, wallTimeMs: T };
const acceptedLive = [];
const env = {
  DB: db,
  HISTORY: {}, MAPS: {}, EVENTS: {}, DEVICE_RATE: {},
  BRICK_DEVICE: {
    idFromName(name) { return name; },
    get(id) {
      assert.equal(id, 'child-time');
      return {
        async setLatest(value) {
          const advance = order.shouldAdvanceLiveState(value, live);
          if (advance) {
            live = { epoch: value.epoch, sequence: value.sequence, wallTimeMs: value.wallTimeMs };
            acceptedLive.push(value);
          }
          return advance;
        }
      };
    }
  }
};

// D1 advances into a reboot epoch for idempotency, but the live read model refuses the stale capture.
let result = await ingest.persistAccepted(env, 'child-time', [packet(8, 1, T - 60_000)]);
assert.deepEqual(db.watermark(), { epoch: 8, sequence: 1 });
assert.equal(result.insertedCount, 1);
assert.equal(result.liveAdvanced, false);
assert.deepEqual(live, { epoch: 7, sequence: 100, wallTimeMs: T });
assert.equal(acceptedLive.length, 0);

// Then an unsent packet from the old epoch arrives with a genuinely NEWER capture time. D1's logical
// watermark correctly stays at epoch 8, but the new history insert still reaches the DO and advances
// the parent read model by event time.
result = await ingest.persistAccepted(env, 'child-time', [packet(7, 101, T + 5_000)]);
assert.deepEqual(db.watermark(), { epoch: 8, sequence: 1 });
assert.equal(result.insertedCount, 1);
assert.equal(result.liveAdvanced, true);
assert.deepEqual(live, { epoch: 7, sequence: 101, wallTimeMs: T + 5_000 });
assert.equal(acceptedLive.length, 1);

// A later genuinely newer packet from epoch 8 advances both logical watermark and live event time.
result = await ingest.persistAccepted(env, 'child-time', [packet(8, 2, T + 10_000)]);
assert.deepEqual(db.watermark(), { epoch: 8, sequence: 2 });
assert.equal(result.liveAdvanced, true);
assert.deepEqual(live, { epoch: 8, sequence: 2, wallTimeMs: T + 10_000 });
assert.equal(acceptedLive.length, 2);

// One offline upload may itself contain records spanning reboot epochs. The logical watermark uses
// epoch/sequence, while the live candidate must be the point captured latest in real time—even when
// that point is from the lower epoch. This directly proves the two ordering domains stay separate.
result = await ingest.persistAccepted(env, 'child-time', [
  packet(7, 103, T + 20_000),
  packet(8, 3, T + 15_000)
]);
assert.deepEqual(db.watermark(), { epoch: 8, sequence: 3 });
assert.equal(result.insertedCount, 2);
assert.equal(result.liveAdvanced, true);
assert.deepEqual(live, { epoch: 7, sequence: 103, wallTimeMs: T + 20_000 });
assert.equal(acceptedLive.length, 3);

console.log('Phase 8 live event-time monotonicity OK: cross-epoch offline backlog cannot move latest backwards or hide the newest captured point');
