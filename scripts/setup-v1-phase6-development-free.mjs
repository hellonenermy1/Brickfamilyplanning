import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

const API = 'https://api.cloudflare.com/client/v4';
const WORKER_NAME = 'brick-family-v1-dev';
const D1_NAME = 'brick-family-v1-dev';
const ACCESS_APP_NAME = 'Brick Parent Dashboard Development';
const CURRENT_APP_VERSION = '0.6.0-phase6c-beta2-free';
const TEMPLATE = 'wrangler.development.template.jsonc';
const GENERATED_CONFIG = 'wrangler.development.jsonc';
const STATE = 'setup-development-state.json';
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
  'schema/012_phase6c_free_runtime.sql'
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
  if (accounts.length !== 1) throw new Error(`Token can access ${accounts.length} accounts. Re-run with the account-id input.`);
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

async function d1Query(d1Id, sql, params = []) {
  return cf(`/accounts/${accountId}/d1/database/${d1Id}/query`, {
    method: 'POST', body: JSON.stringify({ sql, params })
  });
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
      decision: 'allow', precedence: 1,
      include: [{ cloudflare_account_member: { account_id: accountId } }]
    }]
  };
  const app = candidates.length === 0
    ? await cf(`/accounts/${accountId}/access/apps`, { method: 'POST', body: JSON.stringify(desired) })
    : await cf(`/accounts/${accountId}/access/apps/${candidates[0].id}`, { method: 'PUT', body: JSON.stringify(desired) });
  if (!app?.id || !app?.aud) throw new Error('Development Access app has no ID/AUD.');
  if (!appDestinations(app).includes(destination)) throw new Error('Development Access app did not retain exact /parent* destination.');
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
    p.on('exit', code => code === 0 ? resolve(out + err) : reject(new Error(`${cmd} exited ${code}${err ? `: ${err.slice(-1600)}` : ''}`)));
  });
}

function ymd(date) { return date.toISOString().slice(0, 10).replaceAll('-', ''); }
async function findMapSource() {
  if (process.env.BRICK_MAP_SOURCE) return process.env.BRICK_MAP_SOURCE;
  for (let days = 1; days <= 14; days++) {
    const d = new Date(Date.now() - days * 86_400_000);
    const url = `https://build.protomaps.com/${ymd(d)}.pmtiles`;
    try {
      const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      if (response.ok) return url;
    } catch {}
  }
  throw new Error('Could not find a recent Protomaps daily PMTiles build. Set BRICK_MAP_SOURCE and rerun.');
}

function renderWrangler(template, d1Id, teamDomain, aud, mapSource) {
  return template
    .replace('__D1_DATABASE_ID__', d1Id)
    .replace('__CF_ACCESS_TEAM_DOMAIN__', teamDomain)
    .replace('__CF_ACCESS_AUD__', aud)
    .replace('__BRICK_MAP_SOURCE__', mapSource);
}

async function applySchema(path) {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  await run(npx, ['wrangler', 'd1', 'execute', D1_NAME, '--remote', '--file', path, '--yes', '--config', GENERATED_CONFIG]);
}

async function ensureMigrationTable(d1Id) {
  await d1Query(d1Id, "CREATE TABLE IF NOT EXISTS brick_dev_migrations(name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
}

async function applyMigrations(d1Id) {
  await ensureMigrationTable(d1Id);
  for (const path of SCHEMAS) {
    const done = await d1Query(d1Id, 'SELECT 1 AS ok FROM brick_dev_migrations WHERE name=?1 LIMIT 1', [path]);
    if (done?.[0]?.results?.[0]?.ok) {
      console.log(`Skipping ${path}; already recorded.`);
      continue;
    }
    await applySchema(path);
    await d1Query(d1Id, 'INSERT OR REPLACE INTO brick_dev_migrations(name,applied_at) VALUES(?1,?2)', [path, Date.now()]);
  }
}

console.log('[free dev 1/8] Creating/reusing D1 only…');
const d1Id = await ensureD1();
const mapSource = await findMapSource();

console.log('[free dev 2/8] Checking Zero Trust organization…');
const teamDomain = await zeroTrustOrganization();

console.log('[free dev 3/8] Building same-origin assets and type-checking…');
await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:parent-assets']);
await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'typecheck']);
await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsc', '-p', 'tsconfig.web.json', '--noEmit']);

const template = await fs.readFile(TEMPLATE, 'utf8');
if (!template.includes('"name": "brick-family-v1-dev"') || !template.includes('"main": "src/worker-v10.ts"')) throw new Error('Development template targets wrong worker.');
if (template.includes('r2_buckets') || template.includes('"queues"')) throw new Error('Development template must not bind R2 or Queues.');
await fs.writeFile(GENERATED_CONFIG, renderWrangler(template, d1Id, teamDomain, 'development-bootstrap-not-valid', mapSource));

console.log('[free dev 4/8] Applying Phase 1-6 + no-R2 D1 schema…');
await applyMigrations(d1Id);

console.log('[free dev 5/8] Bootstrapping isolated worker with parent auth locked…');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const bootstrap = await run(npx, ['wrangler', 'deploy', '--config', GENERATED_CONFIG], { capture: true });
const hostMatch = String(bootstrap).match(/https:\/\/([a-zA-Z0-9.-]+\.workers\.dev)/);
if (!hostMatch) throw new Error('Development worker hostname was not detected after deploy.');
const workerHost = hostMatch[1];

console.log('[free dev 6/8] Protecting /parent* with Cloudflare Access…');
const access = await ensureAccess(workerHost);
await fs.writeFile(GENERATED_CONFIG, renderWrangler(template, d1Id, teamDomain, access.aud, mapSource));

console.log('[free dev 7/8] Final-deploying card-free worker-v10…');
await run(npx, ['wrangler', 'deploy', '--strict', '--config', GENERATED_CONFIG]);

console.log('[free dev 8/8] Writing non-secret deployment state…');
const sourceGitSha = process.env.GITHUB_SHA || 'local-unverified';
const state = {
  sourceGitSha,
  environment: 'development',
  releaseState: 'development-beta-free',
  workerEntry: 'src/worker-v10.ts',
  workerName: WORKER_NAME,
  workerHost,
  currentAppVersion: CURRENT_APP_VERSION,
  storageMode: 'd1-chunked-no-r2',
  queueMode: 'direct-synchronous-no-cloudflare-queue',
  mapMode: 'same-origin-worker-range-proxy',
  mapSource,
  resources: { DB: D1_NAME, objectStore: 'dev_object_store + dev_object_chunks', map: 'remote PMTiles proxy' },
  access: { mode: 'cloudflare-access-rs256', appId: access.appId, destination: access.destination },
  recovery: { d1TimeTravelDays: 7, inDatabaseSnapshots: true },
  configuredAt: new Date().toISOString()
};
await fs.writeFile(STATE, JSON.stringify(state, null, 2));

console.log('Brick Phase 6C card-free development setup completed.');
console.log(`Source Git SHA:    ${sourceGitSha}`);
console.log(`Parent dashboard: https://${workerHost}/parent`);
console.log(`Child beta API:   https://${workerHost}`);
console.log(`Storage:          ${state.storageMode}`);
console.log(`Map:              ${state.mapMode}`);
