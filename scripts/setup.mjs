import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import readline from 'node:readline';

const API = 'https://api.cloudflare.com/client/v4';
const D1_NAME = 'brick-family-v1';
const HISTORY_BUCKET = 'brick-family-v1-history';
const MAPS_BUCKET = 'brick-family-v1-maps';
const EVENT_QUEUE = 'brick-family-v1-events';
const DLQ = 'brick-family-v1-dlq';
const CURRENT_APP_VERSION = '0.6.0-phase6-rc';
const ACCESS_APP_NAME = 'Brick Parent Dashboard';

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(q, a => { rl.close(); resolve(a.trim()); }));
}
function askHidden(q) {
  if (!process.stdin.isTTY) return ask(q);
  process.stdout.write(q);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const onData = ch => {
      if (ch === '\u0003') { process.stdin.setRawMode(false); process.stdin.pause(); reject(new Error('Cancelled')); return; }
      if (ch === '\r' || ch === '\n') { process.stdin.off('data', onData); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); resolve(value); return; }
      if (ch === '\u007f') { value = value.slice(0, -1); return; }
      value += ch;
    };
    process.stdin.on('data', onData);
  });
}

let token = process.env.CLOUDFLARE_API_TOKEN || await askHidden('Cloudflare scoped API token (hidden): ');
if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required. Do not use a Global API key.');

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
    const detail = JSON.stringify(body.errors || body);
    throw new Error(`Cloudflare API ${response.status}: ${detail}`);
  }
  return body.result;
}

async function chooseAccount() {
  if (process.env.CLOUDFLARE_ACCOUNT_ID) return process.env.CLOUDFLARE_ACCOUNT_ID;
  const accounts = await cf('/accounts?per_page=50');
  if (!accounts.length) throw new Error('No Cloudflare account is visible to this API token.');
  if (accounts.length === 1) return accounts[0].id;
  console.log('\nCloudflare accounts:');
  accounts.forEach((a, i) => console.log(`  ${i + 1}. ${a.name} (${a.id})`));
  const n = Number(await ask('Choose account number: '));
  if (!Number.isInteger(n) || n < 1 || n > accounts.length) throw new Error('Invalid account selection.');
  return accounts[n - 1].id;
}

const accountId = await chooseAccount();
process.env.CLOUDFLARE_API_TOKEN = token;
process.env.CLOUDFLARE_ACCOUNT_ID = accountId;

async function ensureD1() {
  const list = await cf(`/accounts/${accountId}/d1/database?per_page=100`);
  let db = list.find(x => x.name === D1_NAME);
  if (!db) db = await cf(`/accounts/${accountId}/d1/database`, { method: 'POST', body: JSON.stringify({ name: D1_NAME, primary_location_hint: 'apac' }) });
  return db.uuid;
}

async function ensureR2Bucket(name) {
  try { await cf(`/accounts/${accountId}/r2/buckets/${name}`); }
  catch (error) {
    const msg = String(error);
    if (msg.includes('10042') || /enable R2/i.test(msg)) {
      throw new Error('Cloudflare R2 is not enabled for this account. Enable R2 in Storage & databases > R2, then rerun deployment.');
    }
    try {
      await cf(`/accounts/${accountId}/r2/buckets`, { method: 'POST', body: JSON.stringify({ name, locationHint: 'apac', storageClass: 'Standard' }) });
    } catch (createError) {
      throw new Error(`Could not create R2 bucket ${name}: ${String(createError)}`);
    }
  }
}

async function ensureR2Lifecycle() {
  const day = 86_400;
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
  let app = apps.find(a => a.type === 'self_hosted' && appDestinations(a).includes(destination));
  if (!app) {
    app = await cf(`/accounts/${accountId}/access/apps`, {
      method: 'POST',
      body: JSON.stringify({
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
      })
    });
  }
  if (!app?.aud) throw new Error('Cloudflare Access application has no AUD tag; refusing to deploy a Worker that cannot verify Access JWTs.');
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

console.log('[14/14] Final deploy with exact Access issuer/AUD verification…');
await fs.writeFile('wrangler.jsonc', renderWrangler(template, d1Id, teamDomain, access.aud));
await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', 'deploy', '--config', 'wrangler.jsonc']);

await fs.writeFile('setup-state.json', JSON.stringify({
  phase: 6,
  releaseState: 'candidate-not-real-device-qualified',
  accountId,
  workerHost,
  d1Id,
  currentRelease: CURRENT_APP_VERSION,
  resources: { D1_NAME, HISTORY_BUCKET, MAPS_BUCKET, EVENT_QUEUE, DLQ },
  access: { appId: access.appId, destination: access.destination, teamDomain, aud: access.aud },
  retention: { rawHistoryDays: 30, trustedHistoryDays: 90, defaultSafetyEventDays: 180, healthSampleDays: 35, healthIncidentDays: 365, crashReportDays: 365, auditLogDays: 90 },
  privateMap: { bucket: MAPS_BUCKET, key: 'basemap/singapore.pmtiles', installed: false },
  configuredAt: new Date().toISOString()
}, null, 2));

console.log(`\nBrick Phase 6 candidate cloud setup complete.\nParent dashboard: https://${workerHost}/parent\nChild API base:     https://${workerHost}\nHistory R2:         ${HISTORY_BUCKET}\nPrivate map R2:     ${MAPS_BUCKET}\nEvent Queue:        ${EVENT_QUEUE}\nDead Letter Queue:  ${DLQ}\nCloudflare Access:  ${access.destination}\nCurrent app release:${CURRENT_APP_VERSION}\n\nRun npm run map:install once to provision the Singapore OSM-derived PMTiles archive. The live parent map has no third-party tile/geocoder fallback.\n\nThe API token was not written to disk. This is still a release candidate until the required real OPPO/ColorOS endurance qualification is completed.`);
