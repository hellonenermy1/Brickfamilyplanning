import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

const [restorePath] = process.argv.slice(2);
if (!restorePath) throw new Error('usage: test-backup-restore.mjs <backup-restore-module>');
const restore = await import(pathToFileURL(restorePath).href + `?v=${Date.now()}`);

const TABLES = [
  'devices', 'device_location_control', 'geofences', 'geofence_state', 'ble_anchors', 'trips', 'retention_settings',
  'safety_events', 'health_incidents', 'crash_reports', 'audit_log', 'device_replay_state'
];
const LEGACY_TABLES = TABLES.filter(t => t !== 'device_location_control');

function snapshot(extraDevice = {}, { legacy = false } = {}) {
  const tableNames = legacy ? LEGACY_TABLES : TABLES;
  const tables = Object.fromEntries(tableNames.map(t => [t, []]));
  tables.devices.push({
    id: 'child-1',
    name: 'Child',
    public_key_spki_b64: 'test-public-key',
    created_at: 1793430000000,
    last_seen_at: null,
    revoked_at: null,
    last_epoch: 1,
    last_sequence: 9,
    last_health_at: null,
    health_status: 'unknown',
    recovery_count: 0,
    pending_records: 0,
    app_version: '0.6.0-phase6-rc',
    ...extraDevice
  });
  return {
    format: 'brick-d1-snapshot-v1',
    createdAt: 1793435000000,
    excludes: ['pairing_tokens: intentionally excluded'],
    tables
  };
}

function encode(value) {
  const compressed = gzipSync(Buffer.from(JSON.stringify(value)));
  const bytes = compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength);
  const sha = createHash('sha256').update(compressed).digest('hex');
  return { bytes, sha };
}

function fakeDb(initial = {}) {
  const counts = new Map(TABLES.map(t => [t, Number(initial[t] ?? 0)]));
  const rows = new Map(TABLES.map(t => [t, []]));
  function statement(sql, args = []) {
    return {
      sql, args,
      bind(...next) { return statement(sql, next); },
      async first() {
        const m = sql.match(/^SELECT COUNT\(\*\) AS n FROM ([a-z_]+)$/i);
        if (!m) throw new Error(`unexpected first SQL: ${sql}`);
        return { n: counts.get(m[1]) ?? 0 };
      }
    };
  }
  return {
    counts,
    rows,
    prepare(sql) { return statement(sql); },
    async batch(statements) {
      const stagedCounts = new Map(counts);
      const stagedRows = new Map([...rows].map(([table, values]) => [table, values.map(row => ({ ...row }))]));
      for (const s of statements) {
        const m = s.sql.match(/^INSERT INTO ([a-z_]+) \(([^)]+)\) VALUES \(([^)]+)\)$/i);
        if (!m) throw new Error(`unexpected batch SQL: ${s.sql}`);
        const table = m[1];
        if (!stagedCounts.has(table)) throw new Error(`unknown table ${table}`);
        const columns = m[2].split(',').map(x => x.trim());
        assert.equal(columns.length, s.args.length, `bind count mismatch for ${table}`);
        stagedRows.get(table).push(Object.fromEntries(columns.map((column, i) => [column, s.args[i]])));
        stagedCounts.set(table, stagedCounts.get(table) + 1);
      }
      counts.clear();
      rows.clear();
      for (const [key, value] of stagedCounts) counts.set(key, value);
      for (const [key, value] of stagedRows) rows.set(key, value);
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    }
  };
}

const goodSnapshot = snapshot({ revoked_at: 1793434000000, last_epoch: 17, last_sequence: 991 });
goodSnapshot.tables.device_location_control.push({
  device_id: 'child-1',
  desired_enabled: 0,
  command_id: '11111111-1111-4111-8111-111111111111',
  issued_at: 1793434100000,
  updated_at: 1793434200000,
  last_actual_enabled: 0,
  last_actual_at: 1793434300000,
  last_acked_command_id: '11111111-1111-4111-8111-111111111111'
});
goodSnapshot.tables.device_replay_state.push({
  device_id: 'child-1',
  last_health_sequence: 487,
  updated_at: 1793434500000
});
const good = encode(goodSnapshot);
const db = fakeDb();
const result = await restore.restoreBackupToFreshD1({ DB: db }, good.bytes, good.sha);
assert.equal(result.format, 'brick-d1-snapshot-v1');
assert.equal(result.restoredRows.devices, 1);
assert.equal(result.restoredRows.device_location_control, 1);
assert.equal(result.restoredRows.device_replay_state, 1);
assert.equal(db.counts.get('devices'), 1);
assert.equal(db.counts.get('device_location_control'), 1);
assert.equal(db.counts.get('device_replay_state'), 1);
for (const table of TABLES.filter(t => !['devices', 'device_location_control', 'device_replay_state'].includes(t))) assert.equal(db.counts.get(table), 0);

// Security state must survive recovery exactly. A restored revoked identity must remain revoked,
// replay high-water state must not reset, and persistent parent control state/ACK must not silently
// revert to the historical default after disaster recovery.
assert.equal(db.rows.get('devices')[0].id, 'child-1');
assert.equal(db.rows.get('devices')[0].revoked_at, 1793434000000);
assert.equal(db.rows.get('devices')[0].last_epoch, 17);
assert.equal(db.rows.get('devices')[0].last_sequence, 991);
assert.deepEqual(db.rows.get('device_location_control')[0], goodSnapshot.tables.device_location_control[0]);
assert.deepEqual(db.rows.get('device_replay_state')[0], {
  device_id: 'child-1',
  last_health_sequence: 487,
  updated_at: 1793434500000
});

await assert.rejects(
  () => restore.restoreBackupToFreshD1({ DB: db }, good.bytes, good.sha),
  /restore target is not empty: devices/
);

const occupied = fakeDb({ audit_log: 1 });
await assert.rejects(
  () => restore.restoreBackupToFreshD1({ DB: occupied }, good.bytes, good.sha),
  /restore target is not empty: audit_log/
);

const unknownColumn = encode(snapshot({ injected_column: 'nope' }));
await assert.rejects(
  () => restore.restoreBackupToFreshD1({ DB: fakeDb() }, unknownColumn.bytes, unknownColumn.sha),
  /unknown column injected_column/
);

await assert.rejects(
  () => restore.restoreBackupToFreshD1({ DB: fakeDb() }, good.bytes, '0'.repeat(64)),
  /backup integrity hash mismatch/
);

// Backward compatibility: Phase 6 / early Phase 8 V1 backups did not contain the location-control
// table. They must remain recoverable and normalize that missing persistent state to an empty table.
const legacy = encode(snapshot({ revoked_at: 1793434000000, last_epoch: 8, last_sequence: 77 }, { legacy: true }));
const legacyDb = fakeDb();
const legacyResult = await restore.restoreBackupToFreshD1({ DB: legacyDb }, legacy.bytes, legacy.sha);
assert.equal(legacyResult.restoredRows.devices, 1);
assert.equal(legacyResult.restoredRows.device_location_control, 0);
assert.equal(legacyDb.counts.get('device_location_control'), 0);
assert.equal(legacyDb.rows.get('devices')[0].revoked_at, 1793434000000);
assert.equal(legacyDb.rows.get('devices')[0].last_epoch, 8);
assert.equal(legacyDb.rows.get('devices')[0].last_sequence, 77);

assert.deepEqual([...restore.RESTORE_TABLE_ORDER], TABLES);
console.log('Phase 8 fresh-D1 recovery preserves revocation, replay watermarks and persistent location-control state; legacy V1 backups remain restorable');
