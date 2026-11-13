import {runStagedExternalWriter} from './staged-external-writer.mjs';
import {validateBetaConfig} from './beta-deployment-contract.mjs';
import fs from 'node:fs/promises';
import {runExternalProcess as run} from './external-process-completion.mjs';
import { createHash,pbkdf2Sync,randomBytes,publicEncrypt,createPublicKey } from 'node:crypto';
import os from 'node:os';
import pathModule from 'node:path';
import { applyDevelopmentSchema16, revokePriorDevelopmentSessions } from './phase8d-development-schema16.mjs';

const API = 'https://api.cloudflare.com/client/v4';
const WORKER_NAME = 'brick-family-beta';
const D1_NAME = 'brick-family-beta';
const CURRENT_APP_VERSION = '1.0.0-beta.1';
const TEMPLATE = 'wrangler.beta.template.jsonc';
const GENERATED_CONFIG = 'wrangler.beta.jsonc';
const STATE = 'beta-setup-state.json';
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
  'schema/013_phase6c_request_maintenance.sql',
  'schema/014_phase6c_virtual_history.sql',
  'schema/015_phase8_device_identity.sql',
  'schema/016_p8b_remediation.sql',
  'schema/017_p8b_provider_rate.sql',
  'schema/018_p8b_pin_pairing.sql',
  'schema/019_cardfree_retention.sql',
  'schema/020_commute_paging.sql',
  'schema/021_cardfree_cleanup.sql',
  'schema/022_cardfree_watchdog.sql',
  'schema/019_phase2_parent_credentials.sql'
];

if(process.env.GITHUB_REF_NAME!=='beta/backend-portal'||!/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA??''))throw Error('Exact beta branch/source required');
validateBetaConfig(JSON.parse(await fs.readFile(TEMPLATE,'utf8')));
const token = process.env.CLOUDFLARE_API_TOKEN;
const explicitAccount = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required.');
// Explicit operator-supplied high-entropy token. Never publish or log the plaintext/hash.
let devAccessToken = process.env.BRICK_DEV_PARENT_ACCESS_TOKEN || '';
let provisionLogin=!!devAccessToken;let generatedLogin=false;
const parentPublicKey=createPublicKey({key:JSON.parse(await fs.readFile('beta/parent-login-public-key.json','utf8')),format:'jwk'});
if (devAccessToken && !/^[A-Za-z0-9!@#$%^&*()_+={}\[\]:;,.?~-]{15,128}$/.test(devAccessToken)) {
  throw new Error('Parent passphrase must contain 15–128 supported characters; refuse weak short PINs.');
}

async function cf(path, init = {}) {
  if(/\/(?:r2|queues|access|subscriptions|billing)(?:\/|\?|$)/.test(path))throw Error('No-card provisioner refuses non-D1 service API');
  const method = init.method ?? 'GET';
  // Exact endpoint, bounded read: do not follow authorization-bearing redirects
  // or permit indefinite remote waits while a writer reservation is held.
  const response = await fetch(API + path, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers || {})
    }
  });
  if (response.redirected || response.url && response.url !== API + path)
    throw new Error('Cloudflare API response target changed');
  if (!response.ok) throw new Error(`Cloudflare API ${response.status} for ${path}`);
  // Cloudflare may return 201 when a resource is created, never for a GET.
  if (response.status !== 200 && !(method === 'POST' && response.status === 201))
    throw new Error('Cloudflare API unexpected success status');
  const body = await response.json().catch(() => null);
  if (!body || body.success !== true || !Object.hasOwn(body, 'result'))
    throw new Error('Cloudflare API invalid response envelope');
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
await runStagedExternalWriter('deployment',{sourceSha:process.env.GITHUB_SHA,accountId,databaseId:null,workerName:WORKER_NAME,workerHost:null},async(targets)=>{
if(!devAccessToken){
 let names=[];
 try{names=await cf(`/accounts/${accountId}/workers/scripts/${WORKER_NAME}/secrets`);}catch(e){if(!String(e.message).includes('Cloudflare API 404 '))throw e;}
 if(!Array.isArray(names))throw Error('Worker secret inventory unavailable');
 if(!names.some(x=>x.name==='DEV_PARENT_LOGIN_HASH')){
  devAccessToken=randomBytes(32).toString('base64url');provisionLogin=true;generatedLogin=true;
  const encrypted=publicEncrypt({key:parentPublicKey,oaepHash:'sha256'},Buffer.from(devAccessToken));
  await fs.writeFile('beta-parent-login.encrypted.json',JSON.stringify({format:'brick-parent-bootstrap-v1',algorithm:'RSA-OAEP-SHA256',ciphertext:encrypted.toString('base64')}));
 }
}


async function ensureD1(name=D1_NAME) {
  const databases = await cf(`/accounts/${accountId}/d1/database?per_page=100`);
  let db = databases.find(x => x.name === name);
  // A staged, source-pinned deployment may reuse only its declared databases.
  // Creating/replacing one changes that resource identity and needs a new reviewed pin.
  targets.database(db?.uuid);
  if (!db) {
    db = await cf(`/accounts/${accountId}/d1/database`, {
      method: 'POST',
      body: JSON.stringify({ name, primary_location_hint: 'apac' })
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
  const rendered=template
    .replace('__D1_DATABASE_ID__', d1Id)
    .replace('__BETA_D1_DATABASE_ID__',betaD1Id)
    .replace('__BETA_SOURCE_SHA__',process.env.GITHUB_SHA)
    .replace('__BRICK_MAP_SOURCE__', mapSource);
  validateBetaConfig(JSON.parse(rendered),{rendered:true});return rendered;
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
    if (path === 'schema/016_p8b_remediation.sql') {
      const directory = await fs.mkdtemp(pathModule.join(os.tmpdir(), 'brick-dev-schema16-'));
      try {
        await applyDevelopmentSchema16({
          source: await fs.readFile(path, 'utf8'),
          columns: async () => (await d1Query(d1Id, 'PRAGMA table_info(device_location_control)'))[0].results.map(row => row.name),
          execute: sql => d1Query(d1Id, sql),
          applyRemainder: async sql => {
            const file = pathModule.join(directory, '016-reentrant.sql');
            await fs.writeFile(file, sql); await applySchema(file);
          }
        });
      } finally { await fs.rm(directory, { recursive: true, force: true }); }
    } else await applySchema(path);
    await d1Query(d1Id, 'INSERT OR REPLACE INTO brick_dev_migrations(name,applied_at) VALUES(?1,?2)', [path, Date.now()]);
  }
}

console.log('[card-free dev 1/6] Creating/reusing D1 only…');
const d1Id = await ensureD1();
const betaD1Id=await ensureD1('brick-family-beta-diagnostics');
if(d1Id===betaD1Id)throw Error('Separate diagnostic DB required');
const mapSource = await findMapSource();

console.log('[card-free dev 2/6] Building same-origin assets and type-checking…');
await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:parent-assets']);
await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'typecheck']);
await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsc', '-p', 'tsconfig.web.json', '--noEmit']);

const template = await fs.readFile(TEMPLATE, 'utf8');
if (!template.includes('"name": "brick-family-beta"') || !template.includes('"main": "src/worker-beta-cardfree.ts"')) throw new Error('Development template targets wrong worker.');
validateBetaConfig(JSON.parse(template));
await fs.writeFile(GENERATED_CONFIG, renderWrangler(template, d1Id, mapSource));

console.log('[card-free dev 3/6] Applying Phase 1-6 + D1 object/session/maintenance schema…');
await applyMigrations(d1Id);
await run('npx',['wrangler','d1','execute','brick-family-beta-diagnostics','--remote','--file','schema/beta_diagnostics.sql','--yes','--config',GENERATED_CONFIG]);
await run(process.execPath, ['scripts/ensure-beta-d1-columns.mjs']);

console.log('[card-free dev 4/6] Removing obsolete one-time parent bootstrap tokens…');
await d1Query(d1Id, 'DELETE FROM dev_parent_login_tokens');
// Existing parent sessions must survive routine deployments when the credential is unchanged.
// Revoke them only AFTER a newly provisioned Worker verifier was installed successfully.

console.log('[card-free dev 5/6] Deploying isolated worker-v10…');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const deployOutput = await run(npx, ['wrangler', 'deploy', '--strict', '--config', GENERATED_CONFIG], { capture: true });
const hostMatch = String(deployOutput).match(/https:\/\/([a-zA-Z0-9.-]+\.workers\.dev)/);
if (!hostMatch) throw new Error('Development worker hostname was not detected after deploy.');
const workerHost = hostMatch[1];
targets.workerHost(workerHost);

// Provision the hash as a private Worker secret, never as a public Wrangler var.
// If secret provisioning fails, the new login route fails closed.
if(provisionLogin){
// PBKDF2 is required for human-chosen passphrases. 32-byte randomly generated
// bootstrap tokens still use the legacy SHA-256 verifier only for compatibility.
const loginHash = generatedLogin
 ? createHash('sha256').update(devAccessToken, 'utf8').digest('hex')
 : (() => {
    const salt=randomBytes(16);
    const digest=pbkdf2Sync(devAccessToken,salt,240000,32,'sha256');
    return 'pbkdf2-sha256:240000:'+salt.toString('base64url')+':'+digest.toString('base64url');
   })();
await run(npx, ['wrangler', 'secret', 'put', 'DEV_PARENT_LOGIN_HASH', '--config', GENERATED_CONFIG], {input:loginHash+'\n',quiet:true});
// The new verifier is active: expire previous sessions and live login cookies now.
await revokePriorDevelopmentSessions((sql, params) => d1Query(d1Id, sql, params));


}
console.log('[card-free dev 6/6] Writing non-secret deployment state…');
const sourceGitSha = process.env.GITHUB_SHA || 'local-unverified';
const state = {
  sourceGitSha,
  environment: 'beta-cardfree',
  releaseState: 'development-beta-cardfree',
  workerEntry: 'src/worker-beta-cardfree.ts',
  workerName: WORKER_NAME,
  workerHost,
  currentAppVersion: CURRENT_APP_VERSION,
  schemaVersion: 19,
  appliedSchemas: SCHEMAS,
  storageMode: 'd1-chunked-no-r2',
  queueMode: 'direct-synchronous-no-cloudflare-queue',
  parentAuthMode: 'd1-session-v1-no-zero-trust',
  parentLoginMode: 'worker-secret-pbkdf2-or-legacy-generated-token',
  parentCredential:generatedLogin?'GENERATED_ENCRYPTED_FOR_USER':provisionLogin?'CONFIGURED_ACTIONS_SECRET':'PRESERVED_WORKER_SECRET',
  priorSessionsRevoked: provisionLogin,
  schedulerMode: 'sqlite-do-alarm-with-d1-lease-and-request-fallback',
  mapMode: 'same-origin-worker-range-proxy',
  mapSource,
  accountId, d1Id, betaD1Id, betaReleaseId:'brick-beta-20261105-01', diagnosticRetentionDays:35,
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
console.log('Private high-entropy development login hash configured as Cloudflare secret; token never logged.');
});
