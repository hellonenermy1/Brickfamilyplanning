import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const [restorePath] = process.argv.slice(2);
if (!restorePath) throw new Error('usage: test-backup-restore.mjs <backup-restore-module>');
const restore = await import(pathToFileURL(restorePath).href + `?v=${Date.now()}`);

const keyPair = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify']
);
const publicSpki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
const canonicalPublicKey = Buffer.from(publicSpki).toString('base64');
const unpaddedPublicKey = canonicalPublicKey.replace(/=+$/, '');
assert.notEqual(unpaddedPublicKey, canonicalPublicKey, 'test key must exercise a noncanonical Base64 spelling');

const TABLES = [
  'devices', 'device_location_control', 'geofences', 'geofence_state', 'ble_anchors', 'trips', 'retention_settings',
  'safety_events', 'health_incidents', 'crash_reports', 'audit_log', 'device_replay_state',
  'device_live_track_control', 'device_wifi_schedules', 'device_wifi_schedule_result',
  'device_capability_profile', 'screen_time_daily', 'commute_summaries'
];
const PRE_P8B_TABLES = TABLES.slice(0, 12);
const LEGACY_TABLES = PRE_P8B_TABLES.filter(t => t !== 'device_location_control');

function snapshot(extraDevice = {}, { legacy = false, preP8B = false } = {}) {
  const tableNames = legacy ? LEGACY_TABLES : preP8B ? PRE_P8B_TABLES : TABLES;
  const tables = Object.fromEntries(tableNames.map(t => [t, []]));
  tables.devices.push({
    id: 'child-1',
    name: 'Child',
    public_key_spki_b64: canonicalPublicKey,
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
    format: legacy || preP8B ? 'brick-d1-snapshot-v1' : 'brick-d1-snapshot-v2',
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
  last_acked_command_id: '11111111-1111-4111-8111-111111111111',
  command_status: 'completed',
  completed_at: 1793434400000,
  result_actual_enabled: 0,
  result_success: 1,
  result_reason: 'signed_phone_confirmed'
});
goodSnapshot.tables.device_replay_state.push({
  device_id: 'child-1',
  last_health_sequence: 487,
  updated_at: 1793434500000
});
goodSnapshot.tables.device_live_track_control.push({ device_id: 'child-1', command_id: 'live-1', requested_active: 1, issued_at: 1793434100000, expires_at: 1793435000000, command_status: 'completed', last_actual_active: 1, completed_at: 1793434200000, result_reason: 'signed_phone_confirmed' });
goodSnapshot.tables.device_wifi_schedules.push({ device_id: 'child-1', id: 'bedtime', enabled: 1, target_enabled: 0, local_minute_of_day: 1290, days_mask: 127, grace_minutes: 15, updated_at: 1793434300000 });
goodSnapshot.tables.device_wifi_schedule_result.push({ device_id: 'child-1', schedule_id: 'bedtime', target_enabled: 0, actual_enabled: 0, status: 'completed', attempted_at: 1793434400000, detail: null, received_at: 1793434450000 });
goodSnapshot.tables.device_capability_profile.push({ device_id: 'child-1', profile_version: 1, profile_json: '{"deviceOwner":true}', device_updated_at: 1793434250000, received_at: 1793434260000 });
goodSnapshot.tables.screen_time_daily.push({ device_id: 'child-1', local_day: '2026-11-04', total_foreground_ms: 64000, session_count: 4, summary_json: '{"privacy":"aggregate_only_no_package_names"}', received_at: 1793434500000 });
goodSnapshot.tables.commute_summaries.push({ id: 'commute-1', device_id: 'child-1', started_at: 1793430000000, ended_at: 1793430300000, distance_m: 1250, duration_ms: 300000, transport_mode: 'walking', mode_confidence: 0.8, start_label: null, end_label: null, provenance: 'trusted_history_v1', created_at: 1793434600000 });
const good = encode(goodSnapshot);
const db = fakeDb();
const result = await restore.restoreBackupToFreshD1({ DB: db }, good.bytes, good.sha);
assert.equal(result.format, 'brick-d1-snapshot-v2');
assert.equal(result.restoredRows.devices, 1);
assert.equal(result.restoredRows.device_location_control, 1);
assert.equal(result.restoredRows.device_replay_state, 1);
for (const table of TABLES.slice(12)) {
  assert.equal(result.restoredRows[table], 1, 'P8B table omitted: ' + table);
  assert.deepEqual(db.rows.get(table)[0], goodSnapshot.tables[table][0], 'P8B row changed: ' + table);
}
assert.equal(db.counts.get('devices'), 1);
assert.equal(db.counts.get('device_location_control'), 1);
assert.equal(db.counts.get('device_replay_state'), 1);
for (const table of TABLES.slice(2, 12).filter(t => t !== 'device_replay_state')) assert.equal(db.counts.get(table), 0);

// Security state must survive recovery exactly. A restored revoked identity must remain revoked,
// replay high-water state must not reset, and persistent parent control state/ACK must not silently
// revert to the historical default after disaster recovery.
assert.equal(db.rows.get('devices')[0].id, 'child-1');
assert.equal(db.rows.get('devices')[0].public_key_spki_b64, canonicalPublicKey);
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

const pendingSnapshot = snapshot();
pendingSnapshot.tables.device_location_control.push({ device_id: 'child-1', desired_enabled: 1, command_id: 'pending-loc', issued_at: 1793434100000, updated_at: 1793434100000, command_status: 'pending' });
pendingSnapshot.tables.device_live_track_control.push({ device_id: 'child-1', command_id: 'pending-live', requested_active: 1, issued_at: 1793434100000, expires_at: 1993435000000, command_status: 'pending' });
const pending = encode(pendingSnapshot);
const pendingDb = fakeDb();
await restore.restoreBackupToFreshD1({ DB: pendingDb }, pending.bytes, pending.sha);
assert.equal(pendingDb.rows.get('device_location_control')[0].command_status, 'expired');
assert.equal(pendingDb.rows.get('device_location_control')[0].result_success, 0);
assert.equal(pendingDb.rows.get('device_live_track_control')[0].command_status, 'expired');
assert.equal(pendingDb.rows.get('device_live_track_control')[0].result_reason, 'cancelled_on_disaster_restore');
const missingTable = snapshot();
delete missingTable.tables.device_wifi_schedules;
const missing = encode(missingTable);
await assert.rejects(() => restore.restoreBackupToFreshD1({ DB: fakeDb() }, missing.bytes, missing.sha), /v2 backup must contain all Phase 8B durable tables/);
const old12 = encode(snapshot({}, { preP8B: true }));
const old12Db = fakeDb();
const old12Result = await restore.restoreBackupToFreshD1({ DB: old12Db }, old12.bytes, old12.sha);
assert.equal(old12Result.format, 'brick-d1-snapshot-v1');
assert.equal(old12Result.restoredRows.device_live_track_control, 0);

// A legacy backup may contain an unpadded spelling of a valid key. Restore must normalize it to the
// same canonical text used by new pairings so schema 015's text UNIQUE index retains identity meaning.
const legacy = encode(snapshot({
  public_key_spki_b64: unpaddedPublicKey,
  revoked_at: 1793434000000,
  last_epoch: 8,
  last_sequence: 77
}, { legacy: true }));
const legacyDb = fakeDb();
const legacyResult = await restore.restoreBackupToFreshD1({ DB: legacyDb }, legacy.bytes, legacy.sha);
assert.equal(legacyResult.restoredRows.devices, 1);
assert.equal(legacyResult.restoredRows.device_location_control, 0);
assert.equal(legacyDb.counts.get('device_location_control'), 0);
assert.equal(legacyDb.rows.get('devices')[0].public_key_spki_b64, canonicalPublicKey);
assert.equal(legacyDb.rows.get('devices')[0].revoked_at, 1793434000000);
assert.equal(legacyDb.rows.get('devices')[0].last_epoch, 8);
assert.equal(legacyDb.rows.get('devices')[0].last_sequence, 77);

// Two text spellings of the same P-256 key are one cryptographic device identity. A recovery must
// refuse such an ambiguous historical snapshot instead of restoring two rows that the SQL text index
// alone would consider different.
const duplicateIdentity = snapshot({ public_key_spki_b64: canonicalPublicKey });
duplicateIdentity.tables.devices.push({
  ...duplicateIdentity.tables.devices[0],
  id: 'child-2',
  name: 'Duplicate child',
  public_key_spki_b64: unpaddedPublicKey,
  created_at: 1793430000001
});
const duplicate = encode(duplicateIdentity);
await assert.rejects(
  () => restore.restoreBackupToFreshD1({ DB: fakeDb() }, duplicate.bytes, duplicate.sha),
  /semantic duplicate device identity/
);

assert.deepEqual([...restore.RESTORE_TABLE_ORDER], TABLES);
console.log('P8D backup v2: six nonempty P8B tables preserved; pending commands retired; v1 11/12 table compatibility and corrupt snapshot rejection PASS.');
