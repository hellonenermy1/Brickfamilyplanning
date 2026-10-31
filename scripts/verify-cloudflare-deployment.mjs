import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const API = 'https://api.cloudflare.com/client/v4';
const EXPECTED_WORKER = 'brick-family-v1';
const HISTORY_BUCKET = 'brick-family-v1-history';
const MAPS_BUCKET = 'brick-family-v1-maps';
const EVENT_QUEUE = 'brick-family-v1-events';
const DLQ = 'brick-family-v1-dlq';
const REQUIRED_TABLES = [
  'devices', 'device_health_samples', 'health_incidents', 'safety_events', 'geofences',
  'trips', 'crash_reports', 'audit_log', 'device_replay_state', 'ble_anchors'
];

const token = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const requirePrivateMap = String(process.env.BRICK_REQUIRE_PRIVATE_MAP || 'false').toLowerCase() === 'true';
if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required for deployment verification.');
if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID is required for deployment verification.');

function fail(message) { throw new Error(`Brick deployment verification failed: ${message}`); }
function assert(condition, message) { if (!condition) fail(message); }

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

function appDestinations(app) {
  if (Array.isArray(app?.destinations)) return app.destinations.map(d => d?.uri).filter(Boolean);
  return app?.domain ? [app.domain] : [];
}

function policyIsExactAccountMemberAllow(policy) {
  if (!policy || policy.decision !== 'allow' || Number(policy.precedence ?? 1) !== 1) return false;
  if (!Array.isArray(policy.include) || policy.include.length !== 1) return false;
  const rule = policy.include[0]?.cloudflare_account_member;
  return rule?.account_id === accountId;
}

async function manualFetch(url, init = {}) {
  return fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
}

const state = JSON.parse(await fs.readFile('setup-state.json', 'utf8'));
const sourceGitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert(/^[0-9a-f]{40}$/.test(sourceGitSha), 'could not determine exact checked-out Git SHA');
assert(state?.phase === 6, 'setup-state phase is not 6');
assert(state?.accountId === accountId, 'setup-state account does not match workflow account');
assert(typeof state?.d1Id === 'string' && state.d1Id.length > 10, 'D1 ID is missing');
assert(typeof state?.workerHost === 'string' && /^[a-z0-9.-]+\.workers\.dev$/i.test(state.workerHost), 'workers.dev hostname is missing or invalid');
assert(state?.access?.appId && state?.access?.aud && state?.access?.destination, 'Access state is incomplete');
assert(state.access.destination === `${state.workerHost}/parent*`, 'Access destination does not exactly protect /parent*');
assert(state?.resources?.HISTORY_BUCKET === HISTORY_BUCKET, 'history R2 binding state is wrong');
assert(state?.resources?.MAPS_BUCKET === MAPS_BUCKET, 'map R2 binding state is wrong');
assert(state?.resources?.EVENT_QUEUE === EVENT_QUEUE, 'event queue state is wrong');
assert(state?.resources?.DLQ === DLQ, 'DLQ state is wrong');
if (requirePrivateMap) {
  assert(state?.privateMap?.installed === true, 'private map was required but setup-state does not show a completed install');
  assert(Number(state?.privateMap?.bytes) > 1_000_000, 'private map install is unexpectedly small');
}

// Resource existence and schema checks.
await cf(`/accounts/${accountId}/r2/buckets/${HISTORY_BUCKET}`);
await cf(`/accounts/${accountId}/r2/buckets/${MAPS_BUCKET}`);
const queues = await cf(`/accounts/${accountId}/queues?per_page=100`);
assert(Array.isArray(queues) && queues.some(q => q.queue_name === EVENT_QUEUE), 'primary Queue is missing');
assert(Array.isArray(queues) && queues.some(q => q.queue_name === DLQ), 'dead-letter Queue is missing');
const d1 = await cf(`/accounts/${accountId}/d1/database/${state.d1Id}/query`, {
  method: 'POST',
  body: JSON.stringify({ sql: "SELECT name FROM sqlite_master WHERE type='table'" })
});
const tableNames = new Set((d1?.[0]?.results || []).map(row => row.name));
for (const table of REQUIRED_TABLES) assert(tableNames.has(table), `required D1 table is missing: ${table}`);

// Access must be the exact self-hosted application and policy that setup intends.
const app = await cf(`/accounts/${accountId}/access/apps/${state.access.appId}`);
assert(app?.type === 'self_hosted', 'Access application is not self_hosted');
assert(app?.aud === state.access.aud, 'Access AUD drifted from setup-state');
assert(appDestinations(app).includes(`${state.workerHost}/parent*`), 'Access application destination drifted');
assert(app?.session_duration === '24h', 'Access session duration is not 24h');
assert(app?.allow_iframe === false, 'Access application unexpectedly allows iframe embedding');
assert(app?.app_launcher_visible === false, 'Access application unexpectedly appears in App Launcher');
assert(app?.enable_binding_cookie === true, 'Access binding cookie is not enabled');
assert(app?.http_only_cookie_attribute === true, 'Access cookie is not HttpOnly');
assert(String(app?.same_site_cookie_attribute || '').toLowerCase() === 'lax', 'Access SameSite cookie attribute is not lax');
assert(app?.path_cookie_attribute === true, 'Access path cookie attribute is not enabled');

const policies = await cf(`/accounts/${accountId}/access/apps/${state.access.appId}/policies?per_page=100`);
assert(Array.isArray(policies) && policies.length === 1, 'Access application must have exactly one policy');
assert(policyIsExactAccountMemberAllow(policies[0]), 'Access policy is not the exact Cloudflare-account-member allow policy');
assert(!policies.some(p => ['bypass', 'non_identity'].includes(p?.decision)), 'Access contains a bypass/non-identity policy');

// Public-edge smoke tests. Redirects are not followed so a Cloudflare Access login page cannot
// masquerade as a successful parent response.
const origin = `https://${state.workerHost}`;
const parent = await manualFetch(`${origin}/parent`);
assert(parent.status !== 200 && parent.status < 500, `unauthenticated /parent was not denied safely (HTTP ${parent.status})`);
const mapStatus = await manualFetch(`${origin}/parent/map/status`);
assert(mapStatus.status !== 200 && mapStatus.status < 500, `unauthenticated map status was not denied safely (HTTP ${mapStatus.status})`);
const parentRelease = await manualFetch(`${origin}/parent/api/release`);
assert(parentRelease.status !== 200 && parentRelease.status < 500, `unauthenticated parent API was not denied safely (HTTP ${parentRelease.status})`);
const invalidPair = await manualFetch(`${origin}/api/pair/complete`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}'
});
assert(invalidPair.status >= 400 && invalidPair.status < 500, `invalid public pairing request did not fail closed (HTTP ${invalidPair.status})`);
const invalidDevice = await manualFetch(`${origin}/api/device/deployment-smoke/location`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}'
});
assert(invalidDevice.status >= 400 && invalidDevice.status < 500, `unsigned fake-device request did not fail closed (HTTP ${invalidDevice.status})`);

// The workflow performs a strict, tagged deploy immediately before this verifier. Keep the exact
// source SHA in non-secret evidence so the APK/backend freeze can prove which source was deployed.
const verifiedAt = new Date().toISOString();
const report = {
  ok: true,
  phase: 6,
  sourceGitSha,
  workerName: EXPECTED_WORKER,
  workerHost: state.workerHost,
  access: {
    appId: state.access.appId,
    aud: state.access.aud,
    destination: state.access.destination,
    policyCount: policies.length
  },
  resources: {
    d1Id: state.d1Id,
    historyBucket: HISTORY_BUCKET,
    mapsBucket: MAPS_BUCKET,
    eventQueue: EVENT_QUEUE,
    dlq: DLQ,
    requiredTables: REQUIRED_TABLES
  },
  publicSmoke: {
    parent: parent.status,
    mapStatus: mapStatus.status,
    parentRelease: parentRelease.status,
    invalidPair: invalidPair.status,
    invalidDevice: invalidDevice.status
  },
  privateMapRequired: requirePrivateMap,
  privateMapInstalled: Boolean(state?.privateMap?.installed),
  verifiedAt
};

state.sourceGitSha = sourceGitSha;
state.deploymentVerifiedAt = verifiedAt;
state.deploymentVerification = { ok: true, evidenceFile: 'deployment-verification.json' };
await fs.writeFile('setup-state.json', JSON.stringify(state, null, 2));
await fs.writeFile('deployment-verification.json', JSON.stringify(report, null, 2));
console.log(`Brick Phase 6 deployment verified for ${sourceGitSha} at https://${state.workerHost}`);
