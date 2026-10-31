import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

const API = 'https://api.cloudflare.com/client/v4';
const D1_NAME = 'brick-family-v1';
const HISTORY_BUCKET = 'brick-family-v1-history';
const MAPS_BUCKET = 'brick-family-v1-maps';
const EVENT_QUEUE = 'brick-family-v1-events';
const DLQ = 'brick-family-v1-dlq';
const ACCESS_APP_NAME = 'Brick Parent Dashboard';
const CURRENT_APP_VERSION = '0.6.0-phase6-rc';

const token = process.env.CLOUDFLARE_API_TOKEN;
const explicitAccount = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required. Use a scoped API token; do not use or commit a Global API key.');

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
  if (accounts.length !== 1) {
    throw new Error(`Token can access ${accounts.length} accounts. Set CLOUDFLARE_ACCOUNT_ID explicitly so Brick never deploys to a guessed account.`);
  }
  return accounts[0].id;
}

const accountId = await selectAccount();

async function ensureD1() {
  const databases = await cf(`/accounts/${accountId}/d1/database?per_page=100`);
  let db = databases.find(x => x.name === D1_NAME);
  if (!db) db = await cf(`/accounts/${accountId}/d1/database`, { method: 'POST', body: JSON.stringify({ name: D1_NAME }) });
  if (!db?.uuid) throw new Error('D1 database was not created or returned no UUID.');
  return db.uuid;
}

async function ensureR2Bucket(name) {
  try {
    await cf(`/accounts/${accountId}/r2/buckets/${name}`);
  } catch {
    await cf(`/accounts/${accountId}/r2/buckets`, { method: 'POST', body: JSON.stringify({ name, locationHint: 'apac' }) });
  }
}

async function ensureR2Lifecycle() {
  const day = 86400;
  await cf(`/accounts/${accountId}/r2/buckets/${HISTORY_BUCKET}/lifecycle`, {
    method: 'PUT',
    body: JSON.stringify({ rules: [
      { id: 'brick-raw-history-30d', enabled: true, conditions: { prefix: 'history/raw/' }, deleteObjectsTransition: { condition: { type: 'Age', maxAge: 30 * day } } },
      { id: 'brick-trusted-history-90d', enabled: true, conditions: { prefix: 'history/trusted/' }, deleteObjectsTransition: { condition: { type: 'Age', maxAge: 90 * day } } },
      { id: 'brick-abort-multipart-7d', enabled: true, conditions: { prefix: '' }, abortMultipartUploadsTransition: { condition: { type: 'Age', maxAge: 7 * day } } }
    ] })
  });
}

async function ensureQueue(name) {
  const list = await cf(`/accounts/${accountId}/queues?per_page=100`);
  if (!list.some(x => x.queue_name === name)) {
    await cf(`/accounts/${accountId}/queues`, { method: 'POST', body: JSON.stringify({ queue_name: name }) });
  }
}

async function zeroTrustOrganization() {
  let org;
  try { org = await cf(`/accounts/${accountId}/access/organizations`); }
  catch (error) {
    throw new Error(`Cloudflare Zero Trust/Access is not initialized for this account. Complete Zero Trust onboarding in the Cloudflare dashboard, then rerun. ${String(error)}`);
  }
  const value = Array.isArray(org) ? org[0] : org;
  if (!value?.auth_domain) throw new Error('Cloudflare Zero Trust organization exists but has no auth_domain. Fix Zero Trust setup before deploying Brick.');
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
  if (candidates.length > 1) {
    throw new Error(`Multiple Brick Access applications match ${destination}. Refusing to guess which security policy to mutate; remove the duplicate Access app and rerun.`);
  }

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

  let app;
  if (candidates.length === 0) {
    app = await cf(`/accounts/${accountId}/access/apps`, {
      method: 'POST',
      body: JSON.stringify(desired)
    });
  } else {
    // A one-click rerun must converge old dashboard state to the audited policy instead of silently
    // trusting whatever was configured previously. Cloudflare's Access Applications API supports
    // PUT updates for self-hosted applications, including destinations and inline policies.
    app = await cf(`/accounts/${accountId}/access/apps/${candidates[0].id}`, {
      method: 'PUT',
      body: JSON.stringify(desired)
    });
  }

  if (!app?.id || !app?.aud) throw new Error('Cloudflare Access application has no ID/AUD tag after reconciliation; refusing to deploy a Worker that cannot verify Access JWTs.');
  if (!appDestinations(app).includes(destination)) throw new Error('Cloudflare Access application update did not retain the exact /parent* destination.');
  return { appId: app.id, aud: app.aud, destination };
}

function run(cmd, args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { shell: process.platform === 'win32', env: { ...process.env }, stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit' });
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
  await ensureColumns(d1Id, 'devices', [["last_health_at", "INTEGER"], ["health_status", "TEXT NOT NULL DEFAULT 'unknown'"], ["recovery_count", "INTEGER NOT NULL DEFAULT 0"], ["pending_records", "INTEGER NOT NULL DEFAULT 0"], ["app_version", "TEXT"]]);
}
async function ensurePhase4Columns(d1Id) {
  const tables = await d1Query(d1Id, "SELECT name FROM sqlite_master WHERE type='table'");
  const names = new Set((tables?.[0]?.results || []).map(r => r.name));
  if (names.has('geofence_state')) await ensureColumns(d1Id, 'geofence_state', [["last_epoch", "INTEGER NOT NULL DEFAULT 0"], ["last_sequence", "INTEGER NOT NULL DEFAULT 0"]]);
  if (names.has('trips')) await ensureColumns(d1Id, 'trips', [
    ["destination_radius_m", "REAL NOT NULL DEFAULT 120"], ["arrival_candidate_since", "INTEGER"], ["arrival_candidate_count", "INTEGER NOT NULL DEFAULT 0"], ["last_alert_at", "INTEGER"],
    ["stationary_since", "INTEGER"], ["last_stop_alert_at", "INTEGER"], ["last_eval_epoch", "INTEGER NOT NULL DEFAULT 0"], ["last_eval_sequence", "INTEGER NOT NULL DEFAULT 0"],
    ["last_distance_to_destination_m", "REAL"], ["last_location_at", "INTEGER"]
  ]);
}

function renderWrangler(template, d1Id, teamDomain, aud) {
  return template
    .replace('__D1_DATABASE_ID__', d1Id)
    .replace('__CF_ACCESS_TEAM_DOMAIN__', teamDomain)
    .replace('__CF_ACCESS_AUD__', aud);
}

console.log('\n[1/14] Creating/reusing D1, R2 and Queue resources…');
const d1Id = await ensureD1();
await ensureR2Bucket(HISTORY_BUCKET);
await ensureR2Bucket(MAPS_BUCKET);
await ensureQueue(EVENT_QUEUE);
await ensureQueue(DLQ);

console.log('[2/14] Applying R2 retention and multipart cleanup…');
await ensureR2Lifecycle();

console.log('[3/14] Verifying Cloudflare Zero Trust organization…');
const teamDomain = await zeroTrustOrganization();

console.log('[4/14] Installing locked Node dependencies…');
await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--no-audit', '--no-fund']);

console.log('[5/14] Building same-origin parent assets…');
await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:parent-assets']);

console.log('[6/14] Type-checking Worker and browser module…');
await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'typecheck']);
await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsc', '-p', 'tsconfig.web.json', '--noEmit']);

const template = await fs.readFile('wrangler.template.jsonc', 'utf8');
await fs.writeFile('wrangler.jsonc', renderWrangler(template, d1Id, teamDomain, 'phase6-bootstrap-not-valid'));

console.log('[7/14] Applying base schema…');
await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', 'd1', 'execute', D1_NAME, '--remote', '--file', 'schema/001_init.sql', '--yes', '--config', 'wrangler.jsonc']);
console.log('[8/14] Applying Phase 2 health migration…');
await ensurePhase2Columns(d1Id);
await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', 'd1', 'execute', D1_NAME, '--remote', '--file', 'schema/002_phase2_health.sql', '--yes', '--config', 'wrangler.jsonc']);
console.log('[9/14] Applying Phase 4 safety/history migration…');
await ensurePhase4Columns(d1Id);
await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', 'd1', 'execute', D1_NAME, '--remote', '--file', 'schema/003_phase4_safety.sql', '--yes', '--config', 'wrangler.jsonc']);
await ensurePhase4Columns(d1Id);
console.log('[10/14] Applying Phase 5 operations migration…');
await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', 'd1', 'execute', D1_NAME, '--remote', '--file', 'schema/004_phase5_operations.sql', '--yes', '--config', 'wrangler.jsonc']);
console.log('[11/14] Applying Phase 5C/6 hardening migration…');
await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', 'd1', 'execute', D1_NAME, '--remote', '--file', 'schema/007_phase5c_hardening.sql', '--yes', '--config', 'wrangler.jsonc']);

console.log('[12/14] Bootstrap-deploying Worker to obtain its production hostname…');
const bootstrap = await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', 'deploy', '--config', 'wrangler.jsonc'], { capture: true });
const match = bootstrap.match(/https:\/\/([a-zA-Z0-9.-]+\.workers\.dev)/);
if (!match) throw new Error('Worker deployed, but the workers.dev hostname was not detected. Refusing to configure Access against a guessed hostname.');
const workerHost = match[1];

console.log('[13/14] Protecting /parent* with Cloudflare Access and obtaining its AUD…');
const access = await ensureAccess(workerHost);

console.log('[14/14] Final deploy with cryptographically verified Access configuration…');
await fs.writeFile('wrangler.jsonc', renderWrangler(template, d1Id, teamDomain, access.aud));
await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', 'deploy', '--config', 'wrangler.jsonc']);

const state = {
  phase: 6,
  phaseSlice: '6-strict-access-r2-queues',
  accountId,
  d1Id,
  workerHost,
  resources: {
    D1_NAME,
    HISTORY_BUCKET,
    MAPS_BUCKET,
    EVENT_QUEUE,
    DLQ
  },
  access: { mode: 'cloudflare-access-rs256', appId: access.appId, aud: access.aud, teamDomain, destination: access.destination },
  currentRelease: CURRENT_APP_VERSION,
  releaseState: 'candidate-not-real-device-qualified',
  configuredAt: new Date().toISOString()
};
await fs.writeFile('setup-state.json', JSON.stringify(state, null, 2));
console.log('\nBrick Phase 6 strict cloud setup completed.');
console.log(`Parent dashboard: https://${workerHost}/parent`);
console.log(`Child API base:   https://${workerHost}`);
console.log(`Access issuer:    ${teamDomain}`);
console.log(`Access AUD:       ${access.aud}`);
console.log('R2 history/maps + Queues/DLQ are real Cloudflare resources.');
