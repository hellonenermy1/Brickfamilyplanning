import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

const API = 'https://api.cloudflare.com/client/v4';
const WORKER_NAME = 'brick-family-v1-dev';
const D1_NAME = 'brick-family-v1-dev';
const HISTORY_BUCKET = 'brick-family-v1-dev-history';
const MAPS_BUCKET = 'brick-family-v1-dev-maps';
const EVENT_QUEUE = 'brick-family-v1-dev-events';
const DLQ = 'brick-family-v1-dev-dlq';
const ACCESS_APP_NAME = 'Brick Parent Dashboard Development';
const CURRENT_APP_VERSION = '0.6.0-phase6c-beta1';
const TEMPLATE = 'wrangler.development.template.jsonc';
const GENERATED_CONFIG = 'wrangler.development.jsonc';
const SCHEMAS = [
  'schema/001_init.sql',
  'schema/002_phase2_health.sql',
  'schema/003_phase4_safety.sql',
  'schema/004_phase5_operations.sql',
  'schema/007_phase5c_hardening.sql',
  'schema/008_v1_phase2_evidence.sql',
  'schema/009_v1_phase5_fusion.sql',
  'schema/010_phase5b_closure.sql',
  'schema/011_v1_phase6_location_control.sql'
];

const token = process.env.CLOUDFLARE_API_TOKEN;
const explicitAccount = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required.');

async function cf(path, init = {}) {
  const response = await fetch(API + path, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    throw new Error(`Cloudflare API ${response.status} for ${path}: ${JSON.stringify(body.errors || body)}`);
  }
  return body.result;
}

async function selectAccount() {
  const accounts = await cf('/accounts?per_page=50');
  if (!Array.isArray(accounts) || accounts.length === 0) throw new Error('No Cloudflare account is visible to the token.');
  if (explicitAccount) {
    const found = accounts.find(a => a.id === explicitAccount);
    if (!found) throw new Error('Requested Cloudflare account is not visible to the token.');
    return found.id;
  }
  if (accounts.length !== 1) throw new Error(`Token can access ${accounts.length} accounts. Re-run with the development workflow account-id input.`);
  return accounts[0].id;
}

const accountId = await selectAccount();

async function ensureD1() {
  const databases = await cf(`/accounts/${accountId}/d1/database?per_page=100`);
  let db = databases.find(x => x.name === D1_NAME);
  if (!db) {
    db = await cf(`/accounts/${accountId}/d1/database`, {
      method: 'POST',
      body: JSON.stringify({ name: D1_NAME, primary_location_hint: 'apac' })
    });
  }
  if (!db?.uuid) throw new Error('Development D1 database has no UUID.');
  return db.uuid;
}

async function ensureR2Bucket(name) {
  try {
    await cf(`/accounts/${accountId}/r2/buckets/${name}`);
    return;
  } catch (error) {
    const message = String(error);
    if (/10042|enable R2/i.test(message)) throw new Error('Cloudflare R2 is not enabled for this account. Enable R2 and rerun the development deploy.');
    if (!message.includes('Cloudflare API 404 ')) throw error;
  }
  await cf(`/accounts/${accountId}/r2/buckets`, {
    method: 'POST',
    body: JSON.stringify({ name, locationHint: 'apac', storageClass: 'Standard' })
  });
}

async function ensureR2Lifecycle() {
  const day = 86_400;
  await cf(`/accounts/${accountId}/r2/buckets/${HISTORY_BUCKET}/lifecycle`, {
    method: 'PUT',
    body: JSON.stringify({ rules: [
      { id: 'brick-dev-raw-history-14d', enabled: true, conditions: { prefix: 'history/raw/' }, deleteObjectsTransition: { condition: { type: 'Age', maxAge: 14 * day } } },
      { id: 'brick-dev-trusted-history-30d', enabled: true, conditions: { prefix: 'history/trusted/' }, deleteObjectsTransition: { condition: { type: 'Age', maxAge: 30 * day } } },
      { id: 'brick-dev-raw-evidence-14d', enabled: true, conditions: { prefix: 'evidence/raw/' }, deleteObjectsTransition: { condition: { type: 'Age', maxAge: 14 * day } } },
      { id: 'brick-dev-abort-multipart-2d', enabled: true, conditions: { prefix: '' }, abortMultipartUploadsTransition: { condition: { type: 'Age', maxAge: 2 * day } } }
    ] })
  });
}

async function ensureQueue(name) {
  const list = await cf(`/accounts/${accountId}/queues?per_page=100`);
  if (!Array.isArray(list)) throw new Error('Cloudflare Queues API returned an unexpected response.');
  if (!list.some(x => x.queue_name === name)) {
    await cf(`/accounts/${accountId}/queues`, { method: 'POST', body: JSON.stringify({ queue_name: name }) });
  }
}

async function zeroTrustOrganization() {
  let org;
  try { org = await cf(`/accounts/${accountId}/access/organizations`); }
  catch (error) { throw new Error(`Cloudflare Zero Trust/Access is not initialized. ${String(error)}`); }
  const value = Array.isArray(org) ? org[0] : org;
  if (!value?.auth_domain) throw new Error('Cloudflare Zero Trust organization has no auth_domain.');
  const domain = String(value.auth_domain).replace(/^https?:\/\//i, '').replace(/\/$/, '');
  if (!/^[a-z0-9.-]+\.cloudflareaccess\.com$/i.test(domain)) throw new Error(`Unexpected Access auth_domain: ${domain}`);
  return `https://${domain.toLowerCase()}`;
}

async function ensureCloudflareIdp() {
  const idps = await cf(`/accounts/${accountId}/access/identity_providers`);
  if (Array.isArray(idps) && idps.some(x => x.type === 'cloudflare')) return;
  await cf(`/accounts/${accountId}/access/identity_providers`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Cloudflare', type: 'cloudflare', config: { restrict_to_account_members: true } })
  });
}

function appDestinations(app) {
  return Array.isArray(app?.destinations) ? app.destinations.map(d => d?.uri).filter(Boolean) : app?.domain ? [app.domain] : [];
}

async function ensureAccess(workerHost) {
  await ensureCloudflareIdp();
  const destination = `${workerHost}/parent*`;
  const apps = await cf(`/accounts/${accountId}/access/apps?per_page=100`);
  const candidates = (Array.isArray(apps) ? apps : []).filter(a => a.type === 'self_hosted' && (a.name === ACCESS_APP_NAME || appDestinations(a).includes(destination)));
  if (candidates.length > 1) throw new Error(`Multiple development Access apps match ${destination}; refusing to guess.`);
  const desired = {
    type: 'self_hosted',
    name: ACCESS_APP_NAME,
    session_duration: '12h',
    app_launcher_visible: false,
    allow_iframe: false,
    enable_binding_cookie: true,
    http_only_cookie_attribute: true,
    same_site_cookie_attribute: 'lax',
    path_cookie_attribute: true,
    destinations: [{ type: 'public', uri: destination }],
    policies: [{
      name: 'Brick development parents — Cloudflare account members',
      decision: 'allow',
      precedence: 1,
      include: [{ cloudflare_account_member: { account_id: accountId } }]
    }]
  };
  const app = candidates.length === 0
    ? await cf(`/accounts/${accountId}/access/apps`, { method: 'POST', body: JSON.stringify(desired) })
    : await cf(`/accounts/${accountId}/access/apps/${candidates[0].id}`, { method: 'PUT', body: JSON.stringify(desired) });
  if (!app?.id || !app?.aud) throw new Error('Development Access app has no ID/AUD.');
  if (!appDestinations(app).includes(destination)) throw new Error('Development Access app did not retain the exact /parent* destination.');
  return { appId: app.id, aud: app.aud, destination };
}

function run(cmd, args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      shell: process.platform === 'win32',
      env: { ...process.env },
      stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit'
    });
    let out = '', err = '';
    if (capture) {
      p.stdout.on('data', d => { out += d; process.stdout.write(d); });
      p.stderr.on('data', d => { err += d; process.stderr.write(d); });
    }
    p.on('error', reject);
    p.on('exit', code => code === 0 ? resolve(out + err) : reject(new Error(`${cmd} exited ${code}${err ? `: ${err.slice(-1400)}` : ''}`)));
  });
}

async function d1Query(d1Id, sql, params = []) {
  return cf(`/accounts/${accountId}/d1/database/${d1Id}/query`, { method: 'POST', body: JSON.stringify({ sql, params }) });
}

async function ensureColumns(d1Id, table, columns) {
  const result = await d1Query(d1Id, `PRAGMA table_info(${table})`);
  const existing = new Set((result?.[0]?.results || []).map(r => r.name));
  for (const [name, type] of columns) if (!existing.has(name)) await d1Query(d1Id, `ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
}

async function ensurePhase2Columns(d1Id) {
  await ensureColumns(d1Id, 'devices', [
    ['last_health_at', 'INTEGER'],
    ['health_status', "TEXT NOT NULL DEFAULT 'unknown'"],
    ['recovery_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['pending_records', 'INTEGER NOT NULL DEFAULT 0'],
    ['app_version', 'TEXT']
  ]);
}

async function ensurePhase4Columns(d1Id) {
  const tables = await d1Query(d1Id, "SELECT name FROM sqlite_master WHERE type='table'");
  const names = new Set((tables?.[0]?.results || []).map(r => r.name));
  if (names.has('geofence_state')) await ensureColumns(d1Id, 'geofence_state', [['last_epoch', 'INTEGER NOT NULL DEFAULT 0'], ['last_sequence', 'INTEGER NOT NULL DEFAULT 0']]);
  if (names.has('trips')) await ensureColumns(d1Id, 'trips', [
    ['destination_radius_m', 'REAL NOT NULL DEFAULT 120'], ['arrival_candidate_since', 'INTEGER'], ['arrival_candidate_count', 'INTEGER NOT NULL DEFAULT 0'], ['last_alert_at', 'INTEGER'],
    ['stationary_since', 'INTEGER'], ['last_stop_alert_at', 'INTEGER'], ['last_eval_epoch', 'INTEGER NOT NULL DEFAULT 0'], ['last_eval_sequence', 'INTEGER NOT NULL DEFAULT 0'],
    ['last_distance_to_destination_m', 'REAL'], ['last_location_at', 'INTEGER']
  ]);
}

function renderWrangler(template, d1Id, teamDomain, aud) {
  return template
    .replace('__D1_DATABASE_ID__', d1Id)
    .replace('__CF_ACCESS_TEAM_DOMAIN__', teamDomain)
    .replace('__CF_ACCESS_AUD__', aud);
}

async function applySchema(path) {
  await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
    'wrangler', 'd1', 'execute', D1_NAME, '--remote', '--file', path, '--yes', '--config', GENERATED_CONFIG
  ]);
}

async function tableExists(d1Id, table) {
  const result = await d1Query(d1Id, "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=?1 LIMIT 1", [table]);
  return Boolean(result?.[0]?.results?.[0]?.ok);
}

async function applySchemaIfNeeded(d1Id, path, sentinelTable) {
  if (sentinelTable && await tableExists(d1Id, sentinelTable)) {
    console.log(`Skipping ${path}; ${sentinelTable} already exists.`);
    return;
  }
  await applySchema(path);
}

console.log('[dev 1/10] Creating/reusing isolated development resources…');
const d1Id = await ensureD1();
await ensureR2Bucket(HISTORY_BUCKET);
await ensureR2Bucket(MAPS_BUCKET);
await ensureQueue(EVENT_QUEUE);
await ensureQueue(DLQ);
await ensureR2Lifecycle();

console.log('[dev 2/10] Checking Zero Trust organization…');
const teamDomain = await zeroTrustOrganization();

console.log('[dev 3/10] Building same-origin parent assets and type-checking…');
await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:parent-assets']);
await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'typecheck']);
await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsc', '-p', 'tsconfig.web.json', '--noEmit']);

const template = await fs.readFile(TEMPLATE, 'utf8');
if (!template.includes('"name": "brick-family-v1-dev"') || !template.includes('"main": "src/worker-v10.ts"')) {
  throw new Error('Development Wrangler template does not target the isolated worker-v10 stack.');
}
await fs.writeFile(GENERATED_CONFIG, renderWrangler(template, d1Id, teamDomain, 'development-bootstrap-not-valid'));

console.log('[dev 4/10] Applying development schema/migrations…');
await applySchemaIfNeeded(d1Id, SCHEMAS[0], 'devices');
await ensurePhase2Columns(d1Id);
await applySchemaIfNeeded(d1Id, SCHEMAS[1], 'device_health_samples');
await ensurePhase4Columns(d1Id);
await applySchemaIfNeeded(d1Id, SCHEMAS[2], 'safety_events');
await ensurePhase4Columns(d1Id);
await applySchemaIfNeeded(d1Id, SCHEMAS[3], 'health_incidents');
await applySchemaIfNeeded(d1Id, SCHEMAS[4], 'admin_audit');
await applySchemaIfNeeded(d1Id, SCHEMAS[5], 'evidence_ingest_state');
await applySchemaIfNeeded(d1Id, SCHEMAS[6], 'phase5_hypothesis_frames');
await applySchemaIfNeeded(d1Id, SCHEMAS[7], 'phase5_learned_places');
await applySchemaIfNeeded(d1Id, SCHEMAS[8], 'device_location_control');

console.log('[dev 5/10] Bootstrapping isolated worker with parent auth locked…');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const bootstrap = await run(npx, ['wrangler', 'deploy', '--config', GENERATED_CONFIG], { capture: true });
const hostMatch = String(bootstrap).match(/https:\/\/([a-zA-Z0-9.-]+\.workers\.dev)/);
if (!hostMatch) throw new Error('Development worker hostname was not detected after deploy.');
const workerHost = hostMatch[1];
if (!workerHost.startsWith(`${WORKER_NAME}.`)) console.log(`Development worker host: ${workerHost}`);

console.log('[dev 6/10] Protecting development /parent* with Cloudflare Access…');
const access = await ensureAccess(workerHost);

console.log('[dev 7/10] Writing verified development Access configuration…');
await fs.writeFile(GENERATED_CONFIG, renderWrangler(template, d1Id, teamDomain, access.aud));

console.log('[dev 8/10] Final-deploying worker-v10…');
await run(npx, ['wrangler', 'deploy', '--config', GENERATED_CONFIG]);

console.log('[dev 9/10] Capturing exact deployment provenance…');
const sourceGitSha = process.env.GITHUB_SHA || String(await run('git', ['rev-parse', 'HEAD'], { capture: true })).trim();
const state = {
  releaseState: 'development-beta',
  environment: 'development',
  v1ProgramPhase: '6C-parent-beta',
  sourceGitSha,
  schemaVersion: 11,
  workerEntry: 'src/worker-v10.ts',
  workerName: WORKER_NAME,
  workerHost,
  currentAppVersion: CURRENT_APP_VERSION,
  resources: {
    DB: D1_NAME,
    DB_ID: d1Id,
    HISTORY_BUCKET,
    MAPS_BUCKET,
    EVENT_QUEUE,
    DLQ
  },
  access: {
    mode: 'cloudflare-access-rs256',
    appId: access.appId,
    destination: access.destination,
    teamDomain
  },
  privateMap: { bucket: MAPS_BUCKET, key: 'basemap/singapore.pmtiles', installed: false },
  configuredAt: new Date().toISOString()
};
await fs.writeFile('setup-development-state.json', JSON.stringify(state, null, 2));

console.log('[dev 10/10] Development stack ready.');
console.log(`Source Git SHA:    ${sourceGitSha}`);
console.log(`Parent beta:       https://${workerHost}/parent`);
console.log(`Child beta API:    https://${workerHost}`);
console.log(`D1:                ${D1_NAME}`);
console.log(`History R2:        ${HISTORY_BUCKET}`);
console.log(`Map R2:            ${MAPS_BUCKET}`);
console.log(`Event queue:       ${EVENT_QUEUE}`);
console.log(`DLQ:               ${DLQ}`);
