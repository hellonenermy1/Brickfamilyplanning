// Actual native SQLite: reject malformed snapshots and stale credentials before INSERT.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { newDatabase, ecdsa, DEVICE_A } from './phase8d-native-fixture.mjs';
const backup = await import(pathToFileURL(process.argv[2]).href);
const restore = await import(pathToFileURL(process.argv[3]).href);
const key = await ecdsa();
function snapshot() {
  const tables = Object.fromEntries(backup.BACKUP_TABLES.map(t => [t, []]));
  tables.devices = [{ id: DEVICE_A, name: 'Synthetic', public_key_spki_b64: key.spki, created_at: Date.now() }];
  return { format: 'brick-d1-snapshot-v3', createdAt: Date.now(), excludes: [], tables };
}
function adapter(db) {
  let writes = 0;
  function stmt(sql, args = []) { return { sql, args, bind(...a) { return stmt(sql, a); },
    async first() { return db.prepare(sql).get(...args) ?? null; } }; }
  return { get writes() { return writes; }, prepare: stmt, async batch(items) {
    db.exec('BEGIN'); try { for (const s of items) { db.prepare(s.sql).run(...s.args); writes++; } db.exec('COMMIT'); }
    catch(e) { db.exec('ROLLBACK'); throw e; } return items.map(() => ({ success: true }));
  } };
}
let failures = 0;
async function check(name, fn) { try { await fn(); console.log('PASS P8D-052 ' + name); } catch(e) { failures++; console.error('FAIL P8D-052 ' + name + ': ' + e.message); } }
for (const invalid of [
  { device_id: DEVICE_A, epoch: 1, sequence: 1, wall_time_ms: 1, latitude: 1, longitude: 2, uncertainty_m: 3, created_at: 1, injected_column: 'bad' },
  { device_id: DEVICE_A }
]) await check('late invalid table row leaves earlier devices untouched', async () => {
  const db = newDatabase(), env = adapter(db), s = snapshot();
  s.tables.phase5_precise_endpoints = [invalid];
  try {
    const bytes = gzipSync(JSON.stringify(s));
    await assert.rejects(restore.restoreBackupToFreshD1({ DB: env }, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), /unknown column|missing required/);
    assert.equal(env.writes, 0, 'validation occurred after an earlier table committed');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM devices').get().n, 0);
  } finally { db.close(); }
});
for (const table of backup.TRANSIENT_RECOVERY_TABLES) await check('occupied transient target refused: ' + table, async () => {
  const db = newDatabase(), env = adapter(db);
  const inserts = {
    pairing_tokens: "INSERT INTO pairing_tokens VALUES('synthetic','Synthetic',9999999999999,NULL)",
    pairing_pin_sessions: "INSERT INTO pairing_pin_sessions(id,pin_hash,device_name,created_at,expires_at) VALUES('synthetic','synthetic','Synthetic',1,9999999999999)",
    provider_rate_window: "INSERT INTO provider_rate_window VALUES('synthetic',1,1,1)",
    provider_cache: "INSERT INTO provider_cache VALUES('synthetic','synthetic','{}',9999999999999,1)"
  };
  try { db.exec(inserts[table]); const b = gzipSync(JSON.stringify(snapshot()));
    await assert.rejects(restore.restoreBackupToFreshD1({ DB: env }, b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)), /restore target is not empty/);
    assert.equal(env.writes, 0); assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n, 1, 'rejection must preserve preexisting target');
  } finally { db.close(); }
});
await check('second committed-batch service failure rejects and blocks same-target retry', async () => {
  const db = newDatabase(), env = adapter(db), s = snapshot();
  s.tables.device_location_control = [{ device_id: DEVICE_A, desired_enabled: 1, command_id: 'synthetic', issued_at: 1, updated_at: 1 }];
  const bytes = gzipSync(JSON.stringify(s)), body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  let batches = 0;
  const flaky = { prepare: env.prepare, async batch(items) { if (++batches === 2) throw Error('synthetic D1 outage'); return env.batch(items); } };
  try {
    await assert.rejects(restore.restoreBackupToFreshD1({ DB: flaky }, body), /synthetic D1 outage/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM devices').get().n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM device_location_control').get().n, 0);
    const priorWrites = env.writes;
    await assert.rejects(restore.restoreBackupToFreshD1({ DB: env }, body), /restore target is not empty/);
    assert.equal(env.writes, priorWrites, 'partial target must require discard/new database, not resume');
  } finally { db.close(); }
});
if (failures) process.exitCode = 1;
