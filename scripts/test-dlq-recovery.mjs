import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const [queuePath] = process.argv.slice(2);
if (!queuePath) throw new Error('usage: test-dlq-recovery.mjs <queue-v6-module>');
const queue = await import(pathToFileURL(queuePath).href + `?v=${Date.now()}`);

const packet = {
  version: 2, epoch: 7, sequence: 42, elapsedRealtimeMs: 500000, wallTimeMs: Date.UTC(2026, 9, 31, 6, 15, 20),
  rawLatE7: 13002000, rawLonE7: 1038050000, rawAccuracyCm: 1200,
  trustedLatE7: 13000000, trustedLonE7: 1038050100, uncertaintyCm: 2800,
  speedCms: 140, speedAccuracyCms: 30, bearingCdeg: 9000, bearingAccuracyCdeg: 500,
  altitudeCm: null, verticalAccuracyCm: null, batteryPct: 73, charging: false,
  rawAccepted: false, rawMock: false, fallback: true,
  activity: 2, activityConfidence: 88, quality: 4, source: 4,
  gnssUsedInFix: 0, gnssTotal: 0, gnssAverageCn0Tenth: 0, stepDelta: 5
};

let incident = null;
let deviceHealth = 'healthy';
let failHistoryWrites = true;
const objects = new Map();

function statement(sql, args = []) {
  return {
    sql,
    args,
    bind(...next) { return statement(sql, next); },
    async first() {
      if (/SELECT id FROM devices WHERE id=\?1/i.test(sql)) return args[0] === 'child-1' ? { id: 'child-1' } : null;
      if (/SELECT id FROM health_incidents/i.test(sql)) return incident && incident.ended_at == null ? { id: incident.id } : null;
      if (/SELECT 1 AS ok FROM safety_events/i.test(sql)) return null;
      throw new Error(`unexpected first SQL: ${sql}`);
    },
    async run() {
      if (/UPDATE devices SET health_status='degraded'/i.test(sql)) {
        deviceHealth = 'degraded';
        return { meta: { changes: 1 } };
      }
      if (/INSERT INTO health_incidents/i.test(sql)) {
        incident = {
          id: args[0], device_id: args[1], kind: 'backend_processing_failed', severity: 'critical',
          started_at: args[2], last_seen_at: args[2], detail_json: args[3], ended_at: null, auto_recovered: 0
        };
        return { meta: { changes: 1 } };
      }
      if (/UPDATE health_incidents SET last_seen_at=/i.test(sql) && /severity='critical'/i.test(sql)) {
        if (incident) {
          incident.last_seen_at = args[0];
          incident.detail_json = args[1];
        }
        return { meta: { changes: incident ? 1 : 0 } };
      }
      if (/UPDATE health_incidents SET ended_at=/i.test(sql)) {
        if (incident && incident.ended_at == null) {
          incident.ended_at = args[0];
          incident.last_seen_at = args[0];
          incident.auto_recovered = 1;
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 0 } };
      }
      throw new Error(`unexpected run SQL: ${sql}`);
    }
  };
}

const env = {
  DB: {
    prepare(sql) { return statement(sql); },
    async batch(statements) {
      const results = [];
      for (const s of statements) results.push(await s.run());
      return results;
    }
  },
  HISTORY: {
    async get() { return null; },
    async put(key, body, options) {
      if (failHistoryWrites) throw new Error('simulated R2 outage');
      objects.set(key, { body, options });
    }
  }
};

function locationMessage() {
  let acked = 0;
  let retried = 0;
  const message = {
    body: { type: 'location', deviceId: 'child-1', packet, rawPacket: packet },
    ack() { acked++; },
    retry() { retried++; }
  };
  return { message, state: () => ({ acked, retried }) };
}

// First DLQ delivery: the backend is still broken. Brick must record a visible incident and retry
// the ORIGINAL location work. It must not ACK and silently discard the location.
const first = locationMessage();
await queue.processDeadLetterBatch({ queue: 'brick-family-v1-dlq', messages: [first.message] }, env);
assert.deepEqual(first.state(), { acked: 0, retried: 1 });
assert.equal(deviceHealth, 'degraded');
assert.equal(incident?.kind, 'backend_processing_failed');
assert.equal(incident?.ended_at, null);
assert.equal(objects.size, 0);

// Next DLQ delivery after R2 recovery: the same logical work is durably written, then and only then
// may the message be ACKed and the backend incident be marked automatically recovered.
failHistoryWrites = false;
const second = locationMessage();
await queue.processDeadLetterBatch({ queue: 'brick-family-v1-dlq', messages: [second.message] }, env);
assert.deepEqual(second.state(), { acked: 1, retried: 0 });
assert.ok([...objects.keys()].some(k => k.startsWith('history/raw/')), 'raw R2 segment missing after DLQ recovery');
assert.ok([...objects.keys()].some(k => k.startsWith('history/trusted/')), 'trusted R2 segment missing after DLQ recovery');
assert.ok(incident?.ended_at != null, 'backend incident should close only after durable recovery');
assert.equal(incident?.auto_recovered, 1);

console.log('Phase 6 DLQ durable reprocessing regression test OK');
