import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

const API = 'https://api.cloudflare.com/client/v4';
const WORKER_NAME = 'brick-family-v1-dev';
const D1_NAME = 'brick-family-v1-dev';
const CURRENT_APP_VERSION = '0.6.0-phase6c-beta5-cardfree';
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
  'schema/012_phase6c_free_runtime.sql',
  'schema/013_phase6c_request_maintenance.sql'
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

function renderWrangler(template, d1Id, mapSource) {
  return template
    .replace('__D1_DATABASE_ID__', d1Id)
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

console.log('[card-free dev 1/6] Creating/reusing D1 only…');
const d1Id = await ensureD1();
const mapSource = await findMapSource();

console.log('[card-free dev 2/6] Building same-origin assets and type-checking…');
await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:parent-assets']);
await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'typecheck']);
await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsc', '-p', 'tsconfig.web.json', '--noEmit']);

const template = await fs.readFile(TEMPLATE, 'utf8');
if (!template.includes('"name": "brick-family-v1-dev"') || !template.includes('"main": "src/worker-v10.ts"')) throw new Error('Development template targets wrong worker.');
if (template.includes('r2_buckets') || template.includes('"queues"') || template.includes('CF_ACCESS_') || template.includes('"triggers"')) {
  throw new Error('Card-free development template must not bind R2, Queues, Cloudflare Access, or Cron triggers.');
}
if (!template.includes('"DEV_PARENT_AUTH_MODE": "d1-session-v1"')) throw new Error('D1 parent session auth is not enabled in the development template.');
if (!template.includes('"DEV_PARENT_PIN_HASH": "931967fb6beab2e36f903438e73707c7e34bfec84c2492bb5cabc197e7bbc77d"')) throw new Error('Expected reusable development parent PIN hash is missing.');
if (!template.includes('"name": "PARENT_LOGIN_RATE"')) throw new Error('Development parent login rate limiter is missing.');
await fs.writeFile(GENERATED_CONFIG, renderWrangler(template, d1Id, mapSource));

console.log('[card-free dev 3/6] Applying Phase 1-6 + D1 object/session/maintenance schema…');
await applyMigrations(d1Id);

console.log('[card-free dev 4/6] Removing obsolete one-time parent bootstrap tokens…');
await d1Query(d1Id, 'DELETE FROM dev_parent_login_tokens');

console.log('[card-free dev 5/6] Deploying isolated worker-v10…');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const deployOutput = await run(npx, ['wrangler', 'deploy', '--strict', '--config', GENERATED_CONFIG], { capture: true });
const hostMatch = String(deployOutput).match(/https:\/\/([a-zA-Z0-9.-]+\.workers\.dev)/);
if (!hostMatch) throw new Error('Development worker hostname was not detected after deploy.');
const workerHost = hostMatch[1];

console.log('[card-free dev 6/6] Writing non-secret deployment state…');
const sourceGitSha = process.env.GITHUB_SHA || 'local-unverified';
const state = {
  sourceGitSha,
  environment: 'development',
  releaseState: 'development-beta-cardfree',
  workerEntry: 'src/worker-v10.ts',
  workerName: WORKER_NAME,
  workerHost,
  currentAppVersion: CURRENT_APP_VERSION,
  storageMode: 'd1-chunked-no-r2',
  queueMode: 'direct-synchronous-no-cloudflare-queue',
  parentAuthMode: 'd1-session-v1-no-zero-trust',
  parentLoginMode: 'reusable-6-digit-pin-v1',
  schedulerMode: 'request-driven-d1-lease-no-cron',
  mapMode: 'same-origin-worker-range-proxy',
  mapSource,
  resources: { DB: D1_NAME, objectStore: 'dev_object_store + dev_object_chunks', map: 'remote PMTiles proxy' },
  recovery: { d1TimeTravelDays: 7, inDatabaseSnapshots: true },
  configuredAt: new Date().toISOString()
};
await fs.writeFile(STATE, JSON.stringify(state, null, 2));

console.log('Brick Phase 6C fully card-free development setup completed.');
console.log(`Source Git SHA:    ${sourceGitSha}`);
console.log(`Parent dashboard: https://${workerHost}/parent`);
console.log(`Child beta API:   https://${workerHost}`);
console.log(`Storage:          ${state.storageMode}`);
console.log(`Parent auth:      ${state.parentAuthMode}`);
console.log(`Parent login:     ${state.parentLoginMode}`);
console.log(`Scheduler:        ${state.schedulerMode}`);
console.log(`Map:              ${state.mapMode}`);
console.log('Reusable parent beta PIN is configured; plaintext PIN is intentionally not written to logs.');
