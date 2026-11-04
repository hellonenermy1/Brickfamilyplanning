import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { P8B_LOCATION_CONTROL_COLUMNS, stripHandledLocationControlAlters } from './phase8d-schema-compat.mjs';

const API = 'https://api.cloudflare.com/client/v4';
const D1_NAME = 'brick-family-v1';
const HISTORY_BUCKET = 'brick-family-v1-history';
const MAPS_BUCKET = 'brick-family-v1-maps';
const EVENT_QUEUE = 'brick-family-v1-events';
const DLQ = 'brick-family-v1-dlq';
const ACCESS_APP_NAME = 'Brick Parent Dashboard';
const CURRENT_APP_VERSION = '1.0.0-rc.1';
const GENERATED_CONFIG = 'wrangler.jsonc';
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
  'schema/015_phase8_device_identity.sql',
  'schema/016_p8b_remediation.sql',
  'schema/017_p8b_provider_rate.sql',
  'schema/018_p8b_pin_pairing.sql'
];

const token = process.env.CLOUDFLARE_API_TOKEN;
const explicitAccount = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required. Use a scoped API token; never commit a Global API key.');

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
  if (!Array.isArray(accounts) || accounts.length === 0) throw new Error('No Cloudflare accounts are visible to this scoped token.');
  if (explicitAccount) {
    const found = accounts.find(a => a.id === explicitAccount);
    if (!found) throw new Error('CLOUDFLARE_ACCOUNT_ID is not visible to the supplied scoped token.');
    return found.id;
  }
  if (accounts.length !== 1) throw new Error(`Token can access ${accounts.length} accounts. Set CLOUDFLARE_ACCOUNT_ID explicitly; Brick will not guess.`);
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
  if (!db?.uuid) throw new Error('D1 database was not created or returned no UUID.');
  return db.uuid;
}

async function ensureR2Bucket(name) {
  try {
    await cf(`/accounts/${accountId}/r2/buckets/${name}`);
    return;
  } catch (error) {
    const message = String(error);
    if (/10042|enable R2/i.test(message)) throw new Error('Cloudflare R2 is not enabled for this account. Enable R2, then rerun deployment.');
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
      { id: 'brick-raw-history-30d', enabled: true, conditions: { prefix: 'history/raw/' }, deleteObjectsTransition: { condition: { type: 'Age', maxAge: 30 * day } } },
      { id: 'brick-trusted-history-90d', enabled: true, conditions: { prefix: 'history/trusted/' }, deleteObjectsTransition: { condition: { type: 'Age', maxAge: 90 * day } } },
      { id: 'brick-raw-evidence-30d', enabled: true, conditions: { prefix: 'evidence/raw/' }, deleteObjectsTransition: { condition: { type: 'Age', maxAge: 30 * day } } },
      { id: 'brick-abort-multipart-7d', enabled: true, conditions: { prefix: '' }, abortMultipartUploadsTransition: { condition: { type: 'Age', maxAge: 7 * day } } }
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
  catch (error) { throw new Error(`Cloudflare Zero Trust/Access is not initialized for this account. ${String(error)}`); }
  const value = Array.isArray(org) ? org[0] : org;
  if (!value?.auth_domain) throw new Error('Cloudflare Zero Trust organization has no auth_domain.');
  const domain = String(value.auth_domain).replace(/^https?:\/\//i, '').replace(/\/$/, '');
  if (!/^[a-z0-9.-]+\.cloudflareaccess\.com$/i.test(domain)) throw new Error(`Unexpected Cloudflare Access auth_domain: ${domain}`);
  return `https://${domain.toLowerCase()}`;
}

async function ensureCloudflareIdp() {
  const idps = await cf(`/accounts/${accountId}/access/identity_providers`);
  if (idps.some(x => x.type === 'cloudflare')) return;
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
  const candidates = apps.filter(a => a.type === 'self_hosted' && (a.name === ACCESS_APP_NAME || appDestinations(a).includes(destination)));
  if (candidates.length > 1) throw new Error(`Multiple Brick Access applications match ${destination}; refusing to guess which policy to mutate.`);

  const desired = {
    type: 'self_hosted',
    name: ACCESS_APP_NAME,
    session_duration: '24h',
    app_launcher_visible: false,
    allow_iframe: false,
    enable_binding_cookie: true,
    http_only_cookie_attribute: true,
    same_site_cookie_attribute: 'lax',
    path_cookie_attribute: true,
    destinations: [{ type: 'public', uri: destination }],
    policies: [{
      name: 'Brick parents — Cloudflare account members',
      decision: 'allow',
      precedence: 1,
      include: [{ cloudflare_account_member: { account_id: accountId } }]
    }]
  };

  const app = candidates.length === 0
    ? await cf(`/accounts/${accountId}/access/apps`, { method: 'POST', body: JSON.stringify(desired) })
    : await cf(`/accounts/${accountId}/access/apps/${candidates[0].id}`, { method: 'PUT', body: JSON.stringify(desired) });

  if (!app?.id || !app?.aud) throw new Error('Cloudflare Access application has no ID/AUD after reconciliation.');
  if (!appDestinations(app).includes(destination)) throw new Error('Cloudflare Access application did not retain the exact /parent* destination.');
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
    p.on('exit', code => code === 0 ? resolve(out + err) : reject(new Error(`${cmd} exited ${code}`)));
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

console.log('\n[1/20] Creating/reusing D1, R2 and Queue resources…');
const d1Id = await ensureD1();
await ensureR2Bucket(HISTORY_BUCKET);
await ensureR2Bucket(MAPS_BUCKET);
await ensureQueue(EVENT_QUEUE);
await ensureQueue(DLQ);

console.log('[2/20] Applying R2 history/evidence retention and multipart cleanup…');
await ensureR2Lifecycle();

console.log('[3/20] Verifying Cloudflare Zero Trust organization…');
const teamDomain = await zeroTrustOrganization();

console.log('[4/20] Installing locked Node dependencies…');
await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--no-audit', '--no-fund']);

console.log('[5/20] Building same-origin parent assets…');
await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:parent-assets']);

console.log('[6/20] Type-checking Worker and browser module…');
await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'typecheck']);
await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsc', '-p', 'tsconfig.web.json', '--noEmit']);

const template = await fs.readFile('wrangler.template.jsonc', 'utf8');
if (!template.includes('"main": "src/worker-p8b.ts"')) throw new Error('Brick V1 setup requires wrangler.template.jsonc to target worker-p8b.ts.');
await fs.writeFile(GENERATED_CONFIG, renderWrangler(template, d1Id, teamDomain, 'phase8-bootstrap-not-valid'));

console.log('[7/20] Applying base schema…');
await applySchema(SCHEMAS[0]);
console.log('[8/20] Applying Phase 2 health migration…');
await ensurePhase2Columns(d1Id);
await applySchema(SCHEMAS[1]);
console.log('[9/20] Applying Phase 4 safety/history migration…');
await ensurePhase4Columns(d1Id);
await applySchema(SCHEMAS[2]);
await ensurePhase4Columns(d1Id);
console.log('[10/20] Applying Phase 5 operations migration…');
await applySchema(SCHEMAS[3]);
console.log('[11/20] Applying Phase 5C/6 hardening migration…');
await applySchema(SCHEMAS[4]);
console.log('[12/20] Applying V1 evidence/data-foundation migration…');
await applySchema(SCHEMAS[5]);
console.log('[13/20] Applying V1 Phase 5 fusion migration…');
await applySchema(SCHEMAS[6]);
console.log('[14/20] Applying Phase 5B closure migration…');
await applySchema(SCHEMAS[7]);
console.log('[15/20] Applying V1 Phase 6 location-control migration…');
await applySchema(SCHEMAS[8]);
console.log('[16/20] Applying Phase 8 permanent device-identity migration…');
await applySchema(SCHEMAS[9]);

// Migration 016 contains five non-idempotent SQLite ADD COLUMN statements. Repair only those
// schema-defined columns individually, then run the *remaining exact migration* (all CREATE
// statements) from a temporary SQL file. A repeated setup cannot abort on duplicate columns.
console.log('[16b/20] Reconciling Phase 8B commands, Wi-Fi, screen time and commute schema…');
await ensureColumns(d1Id, 'device_location_control', P8B_LOCATION_CONTROL_COLUMNS);
const schema016 = stripHandledLocationControlAlters(await fs.readFile(SCHEMAS[10], 'utf8'));
const temporarySchemaFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'brick-v1-p8b-schema-'));
try {
  const temporarySchemaFile = path.join(temporarySchemaFolder, '016_p8b_idempotent.sql');
  await fs.writeFile(temporarySchemaFile, schema016);
  await applySchema(temporarySchemaFile);
} finally {
  await fs.rm(temporarySchemaFolder, { recursive: true, force: true });
}
await applySchema(SCHEMAS[11]);
await applySchema(SCHEMAS[12]);

// All tables and constraints required by worker-p8b now exist before the first activation. The
// placeholder Access AUD deliberately fails parent JWT verification until the exact hostname is
// reconciled with Cloudflare Access below; child APIs can continue operating with their own keys.
console.log('[17/20] Activating schema-compatible worker-p8b with parent access locked down…');
const bootstrap = await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', 'deploy', '--config', GENERATED_CONFIG], { capture: true });
const hostMatch = String(bootstrap).match(/https:\/\/([a-zA-Z0-9.-]+\.workers\.dev)/);
if (!hostMatch) throw new Error('Worker deployed, but the workers.dev hostname was not detected. Refusing to configure Access against a guessed hostname.');
const workerHost = hostMatch[1];

console.log('[18/20] Reconciling Cloudflare Access for /parent*…');
const access = await ensureAccess(workerHost);

console.log('[19/20] Writing cryptographically verified Access configuration…');
await fs.writeFile(GENERATED_CONFIG, renderWrangler(template, d1Id, teamDomain, access.aud));

console.log('[20/20] Final-deploying worker-p8b with verified Access configuration…');
await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', 'deploy', '--config', GENERATED_CONFIG]);

let sourceGitSha = process.env.GITHUB_SHA?.trim() || '';
if (!/^[0-9a-f]{40}$/i.test(sourceGitSha)) {
  const captured = await run('git', ['rev-parse', 'HEAD'], { capture: true });
  sourceGitSha = String(captured).trim().split(/\s+/).pop() || '';
}
if (!/^[0-9a-f]{40}$/i.test(sourceGitSha)) throw new Error('Could not determine exact source Git SHA for deployment provenance.');

const state = {
  phase: 8,
  v1ProgramPhase: 8,
  phaseSlice: '8d-cloud-p8b-backend-candidate',
  releaseState: 'candidate-not-real-device-qualified',
  sourceGitSha,
  schemaVersion: 18,
  appliedSchemas: SCHEMAS,
  accountId,
  d1Id,
  workerHost,
  currentRelease: CURRENT_APP_VERSION,
  workerEntry: 'src/worker-p8b.ts',
  resources: { D1_NAME, HISTORY_BUCKET, MAPS_BUCKET, EVENT_QUEUE, DLQ },
  access: { mode: 'cloudflare-access-rs256', appId: access.appId, aud: access.aud, teamDomain, destination: access.destination },
  retention: {
    rawHistoryDays: 30,
    trustedHistoryDays: 90,
    rawEvidenceDays: 30,
    defaultSafetyEventDays: 180,
    healthSampleDays: 35,
    healthIncidentDays: 365,
    crashReportDays: 365,
    auditLogDays: 90
  },
  privateMap: { bucket: MAPS_BUCKET, key: 'basemap/singapore.pmtiles', installed: false },
  configuredAt: new Date().toISOString()
};
await fs.writeFile('setup-state.json', JSON.stringify(state, null, 2));

console.log('\nBrick Phase 8 cloud-hardening candidate setup completed.');
console.log(`Source Git SHA:    ${sourceGitSha}`);
console.log(`Parent dashboard: https://${workerHost}/parent`);
console.log(`Child API base:   https://${workerHost}`);
console.log(`Current release:  ${CURRENT_APP_VERSION}`);
console.log('Production schema chain through P8B 018 was reconciled before worker-p8b activation.');
console.log('R2 history/maps + Queues/DLQ + Cloudflare Access are real Cloudflare resources.');
console.log('This remains a release candidate until Phase 8 CI acceptance and required real OPPO/ColorOS qualification are completed.');
