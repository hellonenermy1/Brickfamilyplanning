import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const modulePath = process.argv[2];
if (!modulePath) throw new Error('usage: test-phase8-retention-contract.mjs <phase4-module>');
const { getRetention, runRetentionCleanup } = await import(pathToFileURL(modulePath).href + `?v=${Date.now()}`);

function fakeDb({ safetyEventDays = null } = {}) {
  const executed = [];
  return {
    executed,
    prepare(sql) {
      return {
        sql,
        bind(...args) {
          return {
            async run() {
              executed.push({ sql, args });
              return { success: true, meta: { changes: 0 } };
            },
            async first() {
              if (/SELECT safety_event_days FROM retention_settings/i.test(sql)) {
                return safetyEventDays === null ? null : { safety_event_days: safetyEventDays };
              }
              throw new Error(`unexpected first SQL: ${sql}`);
            }
          };
        },
        async first() {
          if (/SELECT safety_event_days FROM retention_settings/i.test(sql)) {
            return safetyEventDays === null ? null : { safety_event_days: safetyEventDays };
          }
          throw new Error(`unexpected first SQL: ${sql}`);
        }
      };
    }
  };
}

const originalNow = Date.now;
const fixedNow = Date.UTC(2026, 10, 3, 1, 0, 0);
Date.now = () => fixedNow;
try {
  const db = fakeDb();
  await runRetentionCleanup({ DB: db, HISTORY: {} });
  assert.equal(db.executed.length, 3, 'retention cleanup must stay bounded to the three intended D1 cleanup statements');

  const safety = db.executed[0];
  assert.match(safety.sql, /^DELETE FROM safety_events /i);
  assert.match(safety.sql, /server_created_at/i);
  assert.match(safety.sql, /retention_settings/i);
  assert.match(safety.sql, /COALESCE/i);
  assert.equal(safety.args[0], fixedNow);

  const pairing = db.executed[1];
  assert.match(pairing.sql, /^DELETE FROM pairing_tokens /i);
  assert.equal(pairing.args[0], fixedNow - 86_400_000);

  const deliveries = db.executed[2];
  assert.match(deliveries.sql, /^DELETE FROM device_events /i);
  assert.equal(deliveries.args[0], fixedNow - 30 * 86_400_000);

  const destructiveSql = db.executed.map(x => x.sql).join('\n').toLowerCase();
  for (const protectedTable of [
    'devices', 'device_location_control', 'geofences', 'geofence_state', 'trips',
    'retention_settings', 'device_replay_state', 'health_incidents', 'crash_reports'
  ]) {
    assert.ok(!new RegExp(`delete\\s+from\\s+${protectedTable}\\b`, 'i').test(destructiveSql),
      `retention cleanup must not delete current/security state from ${protectedTable}`);
  }

  const defaultRetention = await getRetention({ DB: fakeDb(), HISTORY: {} }, 'child-1');
  assert.equal(defaultRetention.status, 200);
  assert.deepEqual(await defaultRetention.json(), {
    rawHistoryDays: 30,
    trustedHistoryDays: 90,
    safetyEventDays: 180
  });

  const customRetention = await getRetention({ DB: fakeDb({ safetyEventDays: 365 }), HISTORY: {} }, 'child-1');
  assert.equal(customRetention.status, 200);
  assert.deepEqual(await customRetention.json(), {
    rawHistoryDays: 30,
    trustedHistoryDays: 90,
    safetyEventDays: 365
  });
} finally {
  Date.now = originalNow;
}

console.log('Phase 8 retention contract keeps D1 cleanup bounded, preserves current/security state, and reports raw/trusted/safety retention truth.');
