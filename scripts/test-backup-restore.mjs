import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

const [restorePath] = process.argv.slice(2);
if (!restorePath) throw new Error('usage: test-backup-restore.mjs <backup-restore-module>');
const restore = await import(pathToFileURL(restorePath).href + `?v=${Date.now()}`);

const TABLES = [
  'devices', 'geofences', 'geofence_state', 'ble_anchors', 'trips', 'retention_settings',
  'safety_events', 'health_incidents', 'crash_reports', 'audit_log', 'device_replay_state'
];

function snapshot(extraDevice = {}) {
  const tables = Object.fromEntries(TABLES.map(t => [t, []]));
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
    prepare(sql) { return statement(sql); },
    async batch(statements) {
      const staged = new Map(counts);
      for (const s of statements) {
        const m = s.sql.match(/^INSERT INTO ([a-z_]+) \(([^)]+)\) VALUES \(([^)]+)\)$/i);
        if (!m) throw new Error(`unexpected batch SQL: ${s.sql}`);
        const table = m[1];
        if (!staged.has(table)) throw new Error(`unknown table ${table}`);
        staged.set(table, staged.get(table) + 1);
      }
      counts.clear();
      for (const [key, value] of staged) counts.set(key, value);
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    }
  };
}

const good = encode(snapshot());
const db = fakeDb();
const result = await restore.restoreBackupToFreshD1({ DB: db }, good.bytes, good.sha);
assert.equal(result.format, 'brick-d1-snapshot-v1');
assert.equal(result.restoredRows.devices, 1);
assert.equal(db.counts.get('devices'), 1);
for (const table of TABLES.filter(t => t !== 'devices')) assert.equal(db.counts.get(table), 0);

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

assert.deepEqual([...restore.RESTORE_TABLE_ORDER], TABLES);
console.log('Phase 6 fresh-D1 backup restore contract OK');
