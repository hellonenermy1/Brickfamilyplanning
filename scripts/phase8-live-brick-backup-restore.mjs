import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

const API = 'https://api.cloudflare.com/client/v4';
const token = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const runId = String(process.env.GITHUB_RUN_ID || Date.now());
const attempt = String(process.env.GITHUB_RUN_ATTEMPT || '1');
const sourceSha = String(process.env.GITHUB_SHA || 'unknown');
const statePath = process.env.BRICK_RESTORE_STATE_PATH || 'phase8-live-restore-state.json';
const evidencePath = process.env.BRICK_RESTORE_EVIDENCE_PATH || 'phase8-live-restore-evidence.json';
const [restoreModulePath] = process.argv.slice(2);

if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required');
if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID is required');
if (!restoreModulePath) throw new Error('usage: phase8-live-brick-backup-restore.mjs <bundled-backup-restore-module>');

const SCHEMAS = [
  'schema/001_init.sql',
  'schema/002_phase2_health.sql',
  'schema/003_phase4_safety.sql',
  'schema/004_phase5_operations.sql',
  'schema/007_phase5c_hardening.sql',
  'schema/008_v1_phase2_evidence.sql',
  'schema/009_v1_phase5_fusion.sql',
  'schema/010_phase5b_closure.sql',
  'schema/011_v1_phase6_location_control.sql',
  'schema/015_phase8_device_identity.sql'
];
const BACKUP_TABLES = [
  'devices',
  'device_location_control',
  'geofences',
  'geofence_state',
  'ble_anchors',
  'trips',
  'retention_settings',
  'safety_events',
  'health_incidents',
  'crash_reports',
  'audit_log',
  'device_replay_state'
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function cf(path, init = {}) {
  const response = await fetch(API + path, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers || {})
    },
    signal: AbortSignal.timeout(30_000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    throw new Error(`Cloudflare API ${response.status} ${path}: ${JSON.stringify(body.errors || body)}`);
  }
  return body.result;
}

async function query(databaseId, sql, params = []) {
  const result = await cf(`/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: 'POST',
    body: JSON.stringify({ sql, params })
  });
  assert(Array.isArray(result) && result.every(r => r?.success !== false), 'D1 query batch did not succeed');
  return result;
}

function rows(result) {
  return result.flatMap(r => Array.isArray(r?.results) ? r.results : []);
}

async function createDatabase(role) {
  const suffix = crypto.createHash('sha256').update(`${runId}:${attempt}:${sourceSha}:${role}`).digest('hex').slice(0, 10);
  const name = `brick-p8-${role}-${runId}-${attempt}-${suffix}`.slice(0, 63);
  const created = await cf(`/accounts/${accountId}/d1/database`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      primary_location_hint: 'apac',
      read_replication: { mode: 'disabled' }
    })
  });
  assert(typeof created?.uuid === 'string' && created.uuid.length > 20, `Cloudflare did not return a D1 UUID for ${role}`);
  return { role, name, id: created.uuid };
}

async function writeState(state) {
  await fs.writeFile(statePath, JSON.stringify(state, null, 2));
}

async function ensureColumns(databaseId, table, columns) {
  const existingRows = rows(await query(databaseId, `PRAGMA table_info(${table})`));
  const existing = new Set(existingRows.map(row => row.name));
  for (const [name, type] of columns) {
    if (!existing.has(name)) await query(databaseId, `ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  }
}

async function applyBrickMigrations(databaseId) {
  // Match the production setup migration order, including historical compatibility column repair.
  await query(databaseId, await fs.readFile(SCHEMAS[0], 'utf8'));
  await ensureColumns(databaseId, 'devices', [
    ['last_health_at', 'INTEGER'],
    ['health_status', "TEXT NOT NULL DEFAULT 'unknown'"],
    ['recovery_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['pending_records', 'INTEGER NOT NULL DEFAULT 0'],
    ['app_version', 'TEXT']
  ]);
  await query(databaseId, await fs.readFile(SCHEMAS[1], 'utf8'));
  await query(databaseId, await fs.readFile(SCHEMAS[2], 'utf8'));
  await ensureColumns(databaseId, 'geofence_state', [
    ['last_epoch', 'INTEGER NOT NULL DEFAULT 0'],
    ['last_sequence', 'INTEGER NOT NULL DEFAULT 0']
  ]);
  await ensureColumns(databaseId, 'trips', [
    ['destination_radius_m', 'REAL NOT NULL DEFAULT 120'],
    ['arrival_candidate_since', 'INTEGER'],
    ['arrival_candidate_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['last_alert_at', 'INTEGER'],
    ['stationary_since', 'INTEGER'],
    ['last_stop_alert_at', 'INTEGER'],
    ['last_eval_epoch', 'INTEGER NOT NULL DEFAULT 0'],
    ['last_eval_sequence', 'INTEGER NOT NULL DEFAULT 0'],
    ['last_distance_to_destination_m', 'REAL'],
    ['last_location_at', 'INTEGER']
  ]);
  for (const path of SCHEMAS.slice(3)) await query(databaseId, await fs.readFile(path, 'utf8'));

  const schemaRows = rows(await query(databaseId, "SELECT name FROM sqlite_master WHERE type='table'"));
  const names = new Set(schemaRows.map(row => row.name));
  for (const table of BACKUP_TABLES) assert(names.has(table), `migration chain did not create backup table ${table}`);
  const uniqueIndex = rows(await query(databaseId, "SELECT name, sql FROM sqlite_master WHERE type='index' AND name='idx_devices_public_key_spki_unique'"));
  assert(uniqueIndex.length === 1 && /CREATE\s+UNIQUE\s+INDEX/i.test(String(uniqueIndex[0]?.sql || '')), 'Phase 8 device identity index missing');
}

async function realP256SpkiBase64() {
  const pair = await crypto.webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const spki = await crypto.webcrypto.subtle.exportKey('spki', pair.publicKey);
  return Buffer.from(spki).toString('base64');
}

async function seedBrickBackupClasses(databaseId) {
  const spki = await realP256SpkiBase64();
  const sql = `
INSERT INTO devices(id,name,public_key_spki_b64,created_at,last_seen_at,revoked_at,last_epoch,last_sequence,last_health_at,health_status,recovery_count,pending_records,app_version)
VALUES('audit-device-1','Audit Child','${spki}',1700000000000,1700000009000,1700000010000,17,991,1700000008000,'degraded',4,23,'0.8.0-phase8-beta1-test');

INSERT INTO device_location_control(device_id,desired_enabled,command_id,issued_at,updated_at,last_actual_enabled,last_actual_at,last_acked_command_id)
VALUES('audit-device-1',0,'cmd-audit-0001',1700000001000,1700000002000,0,1700000002500,'cmd-audit-0001');

INSERT INTO geofences(id,device_id,name,latitude,longitude,radius_m,enabled,created_at)
VALUES('audit-geofence-1','audit-device-1','Audit Place',1.3521,103.8198,120,1,1700000003000);

INSERT INTO geofence_state(geofence_id,device_id,stable_state,candidate_state,candidate_since,candidate_count,last_distance_m,updated_at,last_epoch,last_sequence)
VALUES('audit-geofence-1','audit-device-1','inside',NULL,NULL,0,12.5,1700000004000,17,991);

INSERT INTO ble_anchors(geofence_id,device_id,beacon_uuid,created_at,updated_at)
VALUES('audit-geofence-1','audit-device-1','11111111-1111-4111-8111-111111111111',1700000005000,1700000005000);

INSERT INTO trips(id,device_id,state,destination_name,destination_latitude,destination_longitude,destination_radius_m,expected_arrival_at,started_at,ended_at,arrival_candidate_since,arrival_candidate_count,last_alert_at,stationary_since,last_stop_alert_at,last_eval_epoch,last_eval_sequence,last_distance_to_destination_m,last_location_at)
VALUES('audit-trip-1','audit-device-1','ended','Audit Destination',1.3000,103.8000,150,1700003600000,1700000006000,1700003601000,NULL,0,NULL,NULL,NULL,17,991,0,1700003600000);

INSERT INTO retention_settings(device_id,safety_event_days,updated_at)
VALUES('audit-device-1',365,1700000007000);

INSERT INTO safety_events(id,device_id,kind,device_created_at,server_created_at,latitude,longitude,accuracy_m,detail_json)
VALUES('audit-safety-1','audit-device-1','sos_started',1700000008000,1700000008100,1.3521,103.8198,8.0,'{"fixture":true}');

INSERT INTO health_incidents(id,device_id,kind,severity,started_at,last_seen_at,ended_at,alerted_at,auto_recovered,detail_json)
VALUES('audit-health-1','audit-device-1','location_stale','warn',1700000009000,1700000010000,1700000011000,1700000009500,1,'{"fixture":true}');

INSERT INTO crash_reports(report_id,device_id,app_version,module,exception_signature,device_created_at,received_at)
VALUES('audit-crash-1','audit-device-1','0.8.0-phase8-beta1-test','location','SyntheticAuditException',1700000012000,1700000012100);

INSERT INTO audit_log(id,event_type,method,path,status,created_at,detail_json)
VALUES(1,'phase8_restore_seed','POST','/audit/fixture',200,1700000013000,'{"fixture":true}');

INSERT INTO device_replay_state(device_id,last_health_sequence,updated_at)
VALUES('audit-device-1',487,1700000014000);
`;
  await query(databaseId, sql);
}

async function readBackupTables(databaseId) {
  const tables = {};
  for (const table of BACKUP_TABLES) tables[table] = rows(await query(databaseId, `SELECT * FROM ${table}`));
  return tables;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
  }
  return value;
}

function canonicalTables(tables) {
  const normalized = {};
  for (const table of BACKUP_TABLES) {
    normalized[table] = (tables[table] || [])
      .map(row => stableValue(row))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return JSON.stringify(normalized);
}

function makeRestAdapter(databaseId) {
  function statement(sql, args = []) {
    return {
      sql,
      args,
      bind(...next) { return statement(sql, next); },
      async first() {
        const result = await query(databaseId, sql, args);
        return rows(result)[0] ?? null;
      }
    };
  }
  return {
    prepare(sql) { return statement(sql); },
    async batch(statements) {
      const batch = statements.map(s => ({ sql: s.sql, params: s.args }));
      const result = await cf(`/accounts/${accountId}/d1/database/${databaseId}/query`, {
        method: 'POST',
        body: JSON.stringify({ batch })
      });
      assert(Array.isArray(result) && result.every(r => r?.success !== false), 'live D1 restore batch failed');
      return result;
    }
  };
}

async function deleteDatabase(databaseId) {
  await cf(`/accounts/${accountId}/d1/database/${databaseId}`, { method: 'DELETE' });
}

const state = {
  sourceGitSha: sourceSha,
  accountId,
  databases: [],
  sourceDeleted: false,
  targetDeleted: false
};
await writeState(state);

const source = await createDatabase('backup-source');
state.databases.push({ ...source, deleted: false });
await writeState(state);
await applyBrickMigrations(source.id);
await seedBrickBackupClasses(source.id);
const originalTables = await readBackupTables(source.id);
for (const table of BACKUP_TABLES) assert(originalTables[table].length === 1, `fixture must seed exactly one row in ${table}`);

const snapshot = {
  format: 'brick-d1-snapshot-v1',
  createdAt: Date.now(),
  excludes: [
    'device_events: derivable packet-delivery evidence; detailed routes are already in R2 history',
    'device_health_samples: high-volume operational telemetry retained separately in D1',
    'pairing_tokens: short-lived credentials are intentionally not backed up'
  ],
  tables: originalTables
};
const compressed = gzipSync(Buffer.from(JSON.stringify(snapshot)));
const backupSha256 = crypto.createHash('sha256').update(compressed).digest('hex');
const backupArrayBuffer = compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength);

// This is the destructive boundary: after this succeeds, the source database containing the fixture
// no longer exists. Recovery must succeed from the Brick logical backup alone.
await deleteDatabase(source.id);
state.databases[0].deleted = true;
state.sourceDeleted = true;
await writeState(state);

const target = await createDatabase('restore-target');
state.databases.push({ ...target, deleted: false });
await writeState(state);
await applyBrickMigrations(target.id);

const restoreModule = await import(pathToFileURL(restoreModulePath).href + `?v=${Date.now()}`);
assert(typeof restoreModule.restoreBackupToFreshD1 === 'function', 'bundled Brick restore module missing export');
const restoreResult = await restoreModule.restoreBackupToFreshD1(
  { DB: makeRestAdapter(target.id) },
  backupArrayBuffer,
  backupSha256
);

const restoredTables = await readBackupTables(target.id);
assert(canonicalTables(restoredTables) === canonicalTables(originalTables), 'restored real D1 tables differ from the backed-up source');
for (const table of BACKUP_TABLES) {
  assert(Number(restoreResult?.restoredRows?.[table]) === originalTables[table].length, `restore result count mismatch for ${table}`);
}
const index = rows(await query(target.id, "SELECT name, sql FROM sqlite_master WHERE type='index' AND name='idx_devices_public_key_spki_unique'"));
assert(index.length === 1 && /CREATE\s+UNIQUE\s+INDEX/i.test(String(index[0]?.sql || '')), 'restored target lost Phase 8 identity uniqueness');
const info = await cf(`/accounts/${accountId}/d1/database/${target.id}`);

const evidence = {
  version: 2,
  sourceGitSha: sourceSha,
  runId,
  runAttempt: attempt,
  backupFormat: snapshot.format,
  backupBytes: compressed.byteLength,
  backupSha256,
  appliedSchemas: SCHEMAS,
  backupTables: BACKUP_TABLES,
  restoredRows: restoreResult.restoredRows,
  sourceDatabaseDeleted: true,
  restoredIntoFreshDatabase: true,
  exactStateComparison: true,
  identityUniqueIndexVerified: true,
  fixtureOnly: true,
  productionDatabaseTouched: false,
  databaseFileSizeBytes: Number(info?.file_size || 0),
  restoredCriticalClasses: [
    'device_identity',
    'location_control',
    'geofences',
    'geofence_state',
    'ble_anchors',
    'trips',
    'retention_settings',
    'safety_events',
    'health_incidents',
    'crash_reports',
    'audit_log',
    'replay_high_water'
  ],
  cleanupRequired: true
};
await fs.writeFile(evidencePath, JSON.stringify(evidence, null, 2));
console.log('Phase 8 live Brick backup -> source deletion -> fresh D1 application restore passed.');
