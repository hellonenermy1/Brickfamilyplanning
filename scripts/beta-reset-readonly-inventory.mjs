/**
 * Brick beta fresh-start read-only D1 inventory.
 *
 * This file NEVER issues INSERT/UPDATE/DELETE/DDL, deploys a Worker, resets a DO,
 * changes pairing state, or accesses another Cloudflare account or database.
 * It is not a reset executor and never prints stored user payloads.
 *
 * Usage (trusted runner only):
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... node scripts/beta-reset-readonly-inventory.mjs
 */
const SCOPE = Object.freeze({
  account: '43fd863702fe37609e629c450c5d596e',
  primary: '2d149970-35c9-4893-8f42-292da6433ced',
  diagnostics: '1f24f9ee-a67b-4d49-8c9f-4aa784a9bfd4',
  apkKey: 'beta/releases/brick-beta-20261105-01/Brick.apk'
});
const backupTables = (
  'devices device_location_control geofences geofence_state ble_anchors trips retention_settings safety_events health_incidents crash_reports audit_log device_replay_state ' +
  'device_live_track_control device_wifi_schedules device_wifi_schedule_result device_capability_profile screen_time_daily commute_summaries device_events device_health_events device_health_samples ' +
  'evidence_batches evidence_records evidence_batch_records device_evidence_state evidence_provider_health atlas_models witness_authorizations ground_receivers device_commands refined_history_runs ' +
  'witness_aliases witness_sightings ground_sightings learned_place_models phase5_refined_intervals phase5_hypothesis_frames phase5_precise_endpoints'
).split(' ');
const transient = 'pairing_tokens pairing_pin_sessions provider_rate_window provider_cache'.split(' ');
const devRuntime = 'dev_object_store dev_object_chunks dev_parent_login_tokens dev_parent_sessions dev_maintenance_state dev_location_history'.split(' ');
const diagnostics = 'beta_requests beta_latest beta_challenges beta_runs beta_records beta_reviews'.split(' ');
const expectedPrimary = [...backupTables, ...transient, ...devRuntime, 'brick_dev_migrations'];
const expectedDiagnostics = [...diagnostics];

const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw Error('CLOUDFLARE_API_TOKEN required on trusted runner');
if (process.env.CLOUDFLARE_ACCOUNT_ID !== SCOPE.account) throw Error('Wrong or missing Cloudflare account: fail closed');
const API = 'https://api.cloudflare.com/client/v4/accounts/' + SCOPE.account;

async function request(method, path, payload) {
  const r = await fetch(API + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      ...(payload ? { 'Content-Type': 'application/json' } : {})
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    redirect: 'error',
    signal: AbortSignal.timeout(20000)
  });
  const b = await r.json().catch(() => null);
  if (!r.ok || b?.success !== true) throw Error('Cloudflare read-only metadata/query failed HTTP ' + r.status);
  return b.result;
}

async function sql(id, statement) {
  if (!/^(SELECT\s|PRAGMA\s+foreign_key_check\s*$)/i.test(statement)) {
    throw Error('Only SELECT and foreign_key_check are permitted');
  }
  const result = await request('POST', '/d1/database/' + id + '/query', { sql: statement, params: [] });
  if (!Array.isArray(result) || !Array.isArray(result[0]?.results)) throw Error('Unexpected D1 query result');
  return result[0].results;
}

function assertSafeName(s) {
  if (!/^[a-z][a-z0-9_]*$/i.test(s)) throw Error('Unsafe table identifier');
  return '"' + s + '"';
}

async function verifyDatabaseIds() {
  const all = await request('GET', '/d1/database?per_page=100');
  if (!Array.isArray(all)) throw Error('Database inventory unavailable');
  for (const [id, name] of [[SCOPE.primary, 'brick-family-beta'], [SCOPE.diagnostics, 'brick-family-beta-diagnostics']]) {
    if (all.filter(d => d.uuid === id && d.name === name).length !== 1) throw Error('Beta D1 ID/name mismatch: ' + name);
  }
}

async function inspect(id, declared) {
  const current = (await sql(id, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")).map(r => String(r.name));
  const actual = current.filter(x => !x.startsWith('sqlite_') && !x.startsWith('_cf_') && x !== 'd1_migrations');
  const unknown = actual.filter(x => !declared.includes(x));
  const missing = declared.filter(x => !actual.includes(x));
  const counts = {};
  for (let offset = 0; offset < declared.length; offset += 8) {
    const part = declared.slice(offset, offset + 8).filter(x => actual.includes(x));
    if (!part.length) continue;
    const query = part.map(x => "SELECT '" + x + "' AS table_name, count(*) AS row_count FROM " + assertSafeName(x)).join(' UNION ALL ');
    for (const r of await sql(id, query)) counts[r.table_name] = Number(r.row_count);
  }
  const badReferences = (await sql(id, 'PRAGMA foreign_key_check')).length;
  return { counts, unknownTables: unknown, missingTables: missing, foreignKeyViolations: badReferences };
}

await verifyDatabaseIds();
const primary = await inspect(SCOPE.primary, expectedPrimary);
const beta = await inspect(SCOPE.diagnostics, expectedDiagnostics);
let objects = [];
let apkMetadataPresent = false;
if (!primary.missingTables.includes('dev_object_store')) {
  objects = await sql(SCOPE.primary,
    "SELECT CASE " +
    "WHEN key LIKE 'beta/releases/%' THEN 'protected_release' " +
    "WHEN key LIKE 'backups/d1/%' THEN 'protected_backup' " +
    "WHEN key LIKE 'history/%' THEN 'device_history' " +
    "WHEN key LIKE 'evidence/%' THEN 'device_evidence' " +
    "WHEN key LIKE 'atlas/%' THEN 'device_atlas' " +
    "WHEN key LIKE 'refined/%' THEN 'device_refined' " +
    "ELSE 'unclassified' END AS category, count(*) AS count " +
    "FROM dev_object_store GROUP BY category ORDER BY category"
  );
  const apk = await sql(SCOPE.primary,
    "SELECT count(*) AS n FROM dev_object_store WHERE key='" + SCOPE.apkKey + "' AND size>0");
  apkMetadataPresent = Number(apk[0]?.n) === 1;
}
const findings = [
  ...(primary.unknownTables.length ? ['UNKNOWN_PRIMARY_TABLES'] : []),
  ...(primary.missingTables.length ? ['MISSING_PRIMARY_TABLES'] : []),
  ...(beta.unknownTables.length ? ['UNKNOWN_DIAGNOSTIC_TABLES'] : []),
  ...(beta.missingTables.length ? ['MISSING_DIAGNOSTIC_TABLES'] : []),
  ...(primary.foreignKeyViolations ? ['PRIMARY_FOREIGN_KEY_VIOLATIONS'] : []),
  ...(beta.foreignKeyViolations ? ['DIAGNOSTIC_FOREIGN_KEY_VIOLATIONS'] : []),
  ...(!apkMetadataPresent ? ['APK_OBJECT_METADATA_MISSING'] : []),
  ...(objects.some(x => x.category === 'unclassified') ? ['UNCLASSIFIED_OBJECT_KEYS'] : []),
  'D1_TIME_TRAVEL_BOOKMARKS_NOT_CHECKED',
  'INDEPENDENT_ENCRYPTED_EXPORTS_NOT_CHECKED',
  'DO_RECOVERY_SNAPSHOTS_NOT_CHECKED',
  'DO_PURGE_NOT_IMPLEMENTED',
  'QUIESCE_NOT_IMPLEMENTED'
];

console.log(JSON.stringify({
  format: 'brick-beta-reset-inventory-readonly-v1',
  action: 'READ_ONLY',
  deployOrDeletePerformed: false,
  databaseScope: ['brick-family-beta', 'brick-family-beta-diagnostics'],
  primary, diagnostics: beta,
  objectCategories: objects,
  apkMetadataPresent,
  readOnlyInventoryPassed: findings.filter(x =>
    /^(UNKNOWN_|MISSING_|PRIMARY_FOREIGN|DIAGNOSTIC_FOREIGN|APK_OBJECT|UNCLASSIFIED)/.test(x)).length === 0,
  resetExecutionAuthorized: false,
  blockers: findings
}, null, 2));
if (findings.some(x =>
  /^(UNKNOWN_|MISSING_|PRIMARY_FOREIGN|DIAGNOSTIC_FOREIGN|APK_OBJECT|UNCLASSIFIED)/.test(x))) {
  process.exitCode = 1;
}
