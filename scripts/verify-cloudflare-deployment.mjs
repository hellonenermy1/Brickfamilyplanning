import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const API = 'https://api.cloudflare.com/client/v4';
const EXPECTED_WORKER = 'brick-family-v1';
const EXPECTED_RELEASE = '0.6.0-phase6-rc';
const EXPECTED_RELEASE_STATE = 'candidate-not-real-device-qualified';
const EXPECTED_V1_PROGRAM_PHASE = 2;
const EXPECTED_EVIDENCE_PROTOCOL = 1;
const HISTORY_BUCKET = 'brick-family-v1-history';
const MAPS_BUCKET = 'brick-family-v1-maps';
const EVENT_QUEUE = 'brick-family-v1-events';
const DLQ = 'brick-family-v1-dlq';
const DAY_SECONDS = 86_400;
const REQUIRED_TABLES = [
  'devices', 'device_health_samples', 'health_incidents', 'safety_events', 'geofences',
  'trips', 'crash_reports', 'audit_log', 'device_replay_state', 'ble_anchors',
  'evidence_batches', 'evidence_records', 'evidence_batch_records', 'device_evidence_state',
  'evidence_provider_health', 'atlas_models', 'witness_authorizations', 'ground_receivers',
  'device_commands', 'refined_history_runs'
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
  if (Array.isArray(policy.exclude) && policy.exclude.length !== 0) return false;
  if (Array.isArray(policy.require) && policy.require.length !== 0) return false;
  const rule = policy.include[0]?.cloudflare_account_member;
  return rule?.account_id === accountId;
}

function ruleById(lifecycle, id) {
  const rules = Array.isArray(lifecycle?.rules) ? lifecycle.rules : [];
  return rules.find(rule => rule?.id === id);
}

function requireAgeRule(lifecycle, id, prefix, seconds, transitionKey) {
  const rule = ruleById(lifecycle, id);
  assert(rule, `R2 lifecycle rule is missing: ${id}`);
  assert(rule.enabled === true, `R2 lifecycle rule is disabled: ${id}`);
  assert(rule.conditions?.prefix === prefix, `R2 lifecycle prefix drifted for ${id}`);
  const condition = rule?.[transitionKey]?.condition;
  assert(condition?.type === 'Age' && Number(condition?.maxAge) === seconds, `R2 lifecycle age drifted for ${id}`);
}

async function manualFetch(url, init = {}) {
  return fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
}

function requireAccessDenial(response, label) {
  const allowed = new Set([302, 303, 307, 401, 403]);
  assert(allowed.has(response.status), `${label} did not return an Access/auth denial (HTTP ${response.status})`);
}

const state = JSON.parse(await fs.readFile('setup-state.json', 'utf8'));
const sourceGitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert(/^[0-9a-f]{40}$/.test(sourceGitSha), 'could not determine exact checked-out Git SHA');
assert(state?.phase === 6, 'underlying audited release baseline is not Phase 6');
assert(state?.v1ProgramPhase === EXPECTED_V1_PROGRAM_PHASE, 'setup-state V1 program phase is not 2');
assert(state?.v1Phase2EvidenceProtocol === EXPECTED_EVIDENCE_PROTOCOL, 'setup-state evidence protocol is not v1');
assert(Number(state?.retention?.rawEvidenceDays) === 30, 'setup-state raw evidence retention is not 30 days');
assert(state?.releaseState === EXPECTED_RELEASE_STATE, 'setup-state release qualification state is not explicitly unqualified');
assert(state?.currentRelease === EXPECTED_RELEASE, 'setup-state current release does not match the audited APK release');
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

// Resource existence, lifecycle, and schema checks.
await cf(`/accounts/${accountId}/r2/buckets/${HISTORY_BUCKET}`);
await cf(`/accounts/${accountId}/r2/buckets/${MAPS_BUCKET}`);
const historyLifecycle = await cf(`/accounts/${accountId}/r2/buckets/${HISTORY_BUCKET}/lifecycle`);
requireAgeRule(historyLifecycle, 'brick-raw-history-30d', 'history/raw/', 30 * DAY_SECONDS, 'deleteObjectsTransition');
requireAgeRule(historyLifecycle, 'brick-trusted-history-90d', 'history/trusted/', 90 * DAY_SECONDS, 'deleteObjectsTransition');
requireAgeRule(historyLifecycle, 'brick-raw-evidence-30d', 'evidence/raw/', 30 * DAY_SECONDS, 'deleteObjectsTransition');
requireAgeRule(historyLifecycle, 'brick-abort-multipart-7d', '', 7 * DAY_SECONDS, 'abortMultipartUploadsTransition');

const queues = await cf(`/accounts/${accountId}/queues?per_page=100`);
assert(Array.isArray(queues) && queues.some(q => q.queue_name === EVENT_QUEUE), 'primary Queue is missing');
assert(Array.isArray(queues) && queues.some(q => q.queue_name === DLQ), 'dead-letter Queue is missing');
const d1 = await cf(`/accounts/${accountId}/d1/database/${state.d1Id}/query`, {
  method: 'POST',
  body: JSON.stringify({ sql: "SELECT name FROM sqlite_master WHERE type='table'" })
});
const tableNames = new Set((d1?.[0]?.results || []).map(row => row.name));
for (const table of REQUIRED_TABLES) assert(tableNames.has(table), `required D1 table is missing: ${table}`);

const schemaRows = await cf(`/accounts/${accountId}/d1/database/${state.d1Id}/query`, {
  method: 'POST',
  body: JSON.stringify({ sql: "SELECT name,sql FROM sqlite_master WHERE type='table' AND name IN ('crash_reports','device_replay_state','evidence_records','evidence_provider_health')" })
});
const schemaByName = new Map((schemaRows?.[0]?.results || []).map(row => [row.name, String(row.sql || '')]));
const crashSchema = schemaByName.get('crash_reports') || '';
assert(crashSchema && !/latitude|longitude|stack_trace/i.test(crashSchema), 'crash-report schema contains forbidden location/stack fields');
const replaySchema = schemaByName.get('device_replay_state') || '';
assert(/last_health_sequence/i.test(replaySchema), 'health replay-state schema is incomplete');
const evidenceSchema = schemaByName.get('evidence_records') || '';
assert(/independence_group/i.test(evidenceSchema) && /payload_sha256/i.test(evidenceSchema), 'evidence record schema is incomplete');
assert(/UNIQUE\s*\(\s*device_id\s*,\s*record_id\s*\)/i.test(evidenceSchema), 'evidence record-id idempotency constraint is missing');
const providerHealthSchema = schemaByName.get('evidence_provider_health') || '';
assert(/last_epoch/i.test(providerHealthSchema) && /last_sequence/i.test(providerHealthSchema), 'provider-health monotonic ordering fields are missing');

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
const exactDestination = Array.isArray(app?.destinations) ? app.destinations.find(d => d?.uri === `${state.workerHost}/parent*`) : null;
assert(exactDestination && (!Array.isArray(exactDestination.overrides) || exactDestination.overrides.length === 0), 'Access destination has unexpected path overrides');

const policies = await cf(`/accounts/${accountId}/access/apps/${state.access.appId}/policies?per_page=100`);
assert(Array.isArray(policies) && policies.length === 1, 'Access application must have exactly one policy');
assert(policyIsExactAccountMemberAllow(policies[0]), 'Access policy is not the exact Cloudflare-account-member allow policy');
assert(!policies.some(p => ['bypass', 'non_identity'].includes(p?.decision)), 'Access contains a bypass/non-identity policy');

// Public-edge smoke tests. Redirects are not followed so a Cloudflare Access login page cannot
// masquerade as a successful parent response.
const origin = `https://${state.workerHost}`;
const health = await manualFetch(`${origin}/healthz`, { headers: { Accept: 'application/json' } });
assert(health.status === 200, `public Worker health check failed (HTTP ${health.status})`);
let healthBody;
try { healthBody = await health.json(); } catch { fail('public Worker health check returned invalid JSON'); }
assert(healthBody?.ok === true && healthBody?.env === 'production', 'public Worker health check does not identify the production Brick runtime');

const parent = await manualFetch(`${origin}/parent`);
requireAccessDenial(parent, 'unauthenticated /parent');
const mapStatus = await manualFetch(`${origin}/parent/map/status`);
requireAccessDenial(mapStatus, 'unauthenticated map status');
const parentRelease = await manualFetch(`${origin}/parent/api/release`);
requireAccessDenial(parentRelease, 'unauthenticated parent API');

const invalidPair = await manualFetch(`${origin}/api/pair/complete`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}'
});
assert(invalidPair.status === 400 || invalidPair.status === 429, `invalid public pairing request did not fail closed (HTTP ${invalidPair.status})`);
const invalidDevice = await manualFetch(`${origin}/api/device/deployment-smoke/location`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}'
});
assert(invalidDevice.status === 401 || invalidDevice.status === 429, `unsigned fake-device location request did not fail closed (HTTP ${invalidDevice.status})`);

// Keep path validation and authentication as separate evidence. A non-v4 path must fail as 400;
// then a syntactically valid but nonexistent v4 device must reach the auth boundary and fail 401
// (or 429 if the public requester bucket is already exhausted).
const invalidEvidencePath = await manualFetch(`${origin}/api/device/deployment-smoke/evidence`, {
  method: 'POST',
  headers: { 'content-type': 'application/vnd.brick.evidence' },
  body: new Uint8Array([0x42])
});
assert(invalidEvidencePath.status === 400, `invalid evidence device path did not fail as 400 (HTTP ${invalidEvidencePath.status})`);
const fakeEvidenceDeviceId = '00000000-0000-4000-8000-000000000001';
const unauthorizedEvidence = await manualFetch(`${origin}/api/device/${fakeEvidenceDeviceId}/evidence`, {
  method: 'POST',
  headers: { 'content-type': 'application/vnd.brick.evidence' },
  body: new Uint8Array([0x42])
});
assert(unauthorizedEvidence.status === 401 || unauthorizedEvidence.status === 429, `unsigned fake-v4 evidence request did not fail closed at auth (HTTP ${unauthorizedEvidence.status})`);

// The workflow performs a strict, tagged deploy immediately before this verifier. Keep the exact
// source SHA in non-secret evidence so the APK/backend freeze can prove which source was deployed.
const verifiedAt = new Date().toISOString();
const report = {
  ok: true,
  phase: 6,
  v1ProgramPhase: EXPECTED_V1_PROGRAM_PHASE,
  evidenceProtocol: EXPECTED_EVIDENCE_PROTOCOL,
  sourceGitSha,
  workerName: EXPECTED_WORKER,
  workerHost: state.workerHost,
  release: { current: EXPECTED_RELEASE, qualificationState: EXPECTED_RELEASE_STATE },
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
    requiredTables: REQUIRED_TABLES,
    historyLifecycleVerified: true,
    rawEvidenceRetentionDays: 30
  },
  publicSmoke: {
    healthz: health.status,
    parent: parent.status,
    mapStatus: mapStatus.status,
    parentRelease: parentRelease.status,
    invalidPair: invalidPair.status,
    invalidDevice: invalidDevice.status,
    invalidEvidencePath: invalidEvidencePath.status,
    unauthorizedEvidence: unauthorizedEvidence.status
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
console.log(`Brick V1 Phase 2 deployment verified for ${sourceGitSha} at https://${state.workerHost}`);
