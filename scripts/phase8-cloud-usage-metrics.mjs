import fs from 'node:fs/promises';

const API = 'https://api.cloudflare.com/client/v4';
const GRAPHQL = `${API}/graphql`;
const token = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const days = Math.max(1, Math.min(31, Number(process.env.BRICK_METRICS_DAYS || 7)));
const outPath = process.env.BRICK_METRICS_EVIDENCE_PATH || 'phase8-cloud-usage-metrics.json';
const workerName = 'brick-family-v1';
const d1Name = 'brick-family-v1';
const r2Buckets = ['brick-family-v1-history', 'brick-family-v1-maps'];
const queueNames = ['brick-family-v1-events', 'brick-family-v1-dlq'];

if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required');
if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID is required');

async function cf(path, init = {}) {
  const response = await fetch(API + path, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers || {})
    },
    signal: AbortSignal.timeout(30_000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    throw new Error(`Cloudflare API ${response.status} ${path}: ${JSON.stringify(body.errors || body)}`);
  }
  return body.result;
}

async function gql(query, variables) {
  const response = await fetch(GRAPHQL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.errors?.length) {
    throw new Error(`Cloudflare GraphQL failed: HTTP ${response.status} ${JSON.stringify(body.errors || body)}`);
  }
  return body.data;
}

const end = new Date();
const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
const startTime = start.toISOString();
const endTime = end.toISOString();
const startDate = startTime.slice(0, 10);
const endDate = endTime.slice(0, 10);

// Establish deployment truth from the canonical Worker's live bindings first. This avoids requiring
// account-level Queue/R2 APIs for resources that are planned in source but are not actually attached
// to the deployed cardless Worker. Cloudflare's Worker settings endpoint is authoritative for active
// script bindings and does not require us to infer deployment from a no-sample analytics window.
const workerSettings = await cf(`/accounts/${accountId}/workers/scripts/${workerName}/settings`);
const bindings = Array.isArray(workerSettings?.bindings) ? workerSettings.bindings : [];
const d1Bindings = bindings.filter(binding => binding?.type === 'd1');
const r2Bindings = bindings.filter(binding => binding?.type === 'r2_bucket');
const queueBindings = bindings.filter(binding => binding?.type === 'queue');

const databases = await cf(`/accounts/${accountId}/d1/database?per_page=100`);
const database = Array.isArray(databases) ? databases.find(db => db?.name === d1Name) : null;
if (!database?.uuid) throw new Error(`Production D1 database ${d1Name} was not found`);
const dbInfo = await cf(`/accounts/${accountId}/d1/database/${database.uuid}`);

const canonicalD1Binding = d1Bindings.find(binding => binding?.name === 'DB');
const boundDatabaseId = canonicalD1Binding?.database_id || canonicalD1Binding?.id || null;
if (!canonicalD1Binding || boundDatabaseId !== database.uuid) {
  throw new Error('Canonical Worker DB binding does not point at production D1 brick-family-v1');
}

const workerQuery = `
query BrickWorker($accountTag: string!, $scriptName: string!, $start: Time!, $end: Time!) {
  viewer { accounts(filter: { accountTag: $accountTag }) {
    workersInvocationsAdaptive(limit: 1, filter: { scriptName: $scriptName, datetime_geq: $start, datetime_leq: $end }) {
      sum { requests errors subrequests }
      quantiles { cpuTimeP50 cpuTimeP99 }
    }
  }}
}`;
const workerData = await gql(workerQuery, { accountTag: accountId, scriptName: workerName, start: startTime, end: endTime });
const worker = workerData?.viewer?.accounts?.[0]?.workersInvocationsAdaptive?.[0] || null;

const d1Query = `
query BrickD1($accountTag: string!, $databaseId: string!, $start: Date!, $end: Date!) {
  viewer { accounts(filter: { accountTag: $accountTag }) {
    d1AnalyticsAdaptiveGroups(limit: 10000, filter: { date_geq: $start, date_leq: $end, databaseId: $databaseId }) {
      sum { readQueries writeQueries rowsRead rowsWritten queryBatchResponseBytes queryBatchTimeMs }
      quantiles { queryBatchTimeMsP90 }
    }
  }}
}`;
const d1Data = await gql(d1Query, { accountTag: accountId, databaseId: database.uuid, start: startDate, end: endDate });
const d1Groups = d1Data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups || [];
const d1Totals = d1Groups.reduce((acc, group) => {
  for (const key of ['readQueries', 'writeQueries', 'rowsRead', 'rowsWritten', 'queryBatchResponseBytes', 'queryBatchTimeMs']) {
    acc[key] += Number(group?.sum?.[key] || 0);
  }
  acc.queryBatchTimeMsP90Max = Math.max(acc.queryBatchTimeMsP90Max, Number(group?.quantiles?.queryBatchTimeMsP90 || 0));
  return acc;
}, { readQueries: 0, writeQueries: 0, rowsRead: 0, rowsWritten: 0, queryBatchResponseBytes: 0, queryBatchTimeMs: 0, queryBatchTimeMsP90Max: 0 });

const d1StorageQuery = `
query BrickD1Storage($accountTag: string!, $databaseId: string!, $start: Date!, $end: Date!) {
  viewer { accounts(filter: { accountTag: $accountTag }) {
    d1StorageAdaptiveGroups(limit: 10000, filter: { date_geq: $start, date_leq: $end, databaseId: $databaseId }) {
      max { databaseSizeBytes }
    }
  }}
}`;
const d1StorageData = await gql(d1StorageQuery, { accountTag: accountId, databaseId: database.uuid, start: startDate, end: endDate });
const d1StorageGroups = d1StorageData?.viewer?.accounts?.[0]?.d1StorageAdaptiveGroups || [];
const d1AnalyticsStorageMaxBytes = d1StorageGroups.reduce(
  (max, group) => Math.max(max, Number(group?.max?.databaseSizeBytes || 0)),
  0
);

const r2 = {};
for (const bucketName of r2Buckets) {
  const binding = r2Bindings.find(item => item?.bucket_name === bucketName);
  if (!binding) {
    r2[bucketName] = {
      deploymentState: 'NOT_BOUND_TO_CANONICAL_WORKER',
      boundToCanonicalWorker: false,
      operations: [],
      latestStorage: null
    };
    continue;
  }

  const r2Query = `
  query BrickR2($accountTag: string!, $bucketName: string!, $start: Time!, $end: Time!) {
    viewer { accounts(filter: { accountTag: $accountTag }) {
      r2OperationsAdaptiveGroups(limit: 10000, filter: { bucketName: $bucketName, datetime_geq: $start, datetime_leq: $end }) {
        sum { requests }
        dimensions { actionType actionStatus }
      }
      r2StorageAdaptiveGroups(limit: 1, filter: { bucketName: $bucketName, datetime_geq: $start, datetime_leq: $end }, orderBy: [datetime_DESC]) {
        max { objectCount uploadCount payloadSize metadataSize }
        dimensions { datetime }
      }
    }}
  }`;
  const data = await gql(r2Query, { accountTag: accountId, bucketName, start: startTime, end: endTime });
  const account = data?.viewer?.accounts?.[0] || {};
  const operations = (account.r2OperationsAdaptiveGroups || []).map(group => ({
    actionType: group?.dimensions?.actionType || null,
    actionStatus: group?.dimensions?.actionStatus || null,
    requests: Number(group?.sum?.requests || 0)
  }));
  const latestStorage = account.r2StorageAdaptiveGroups?.[0] || null;
  r2[bucketName] = {
    deploymentState: 'BOUND_TO_CANONICAL_WORKER',
    boundToCanonicalWorker: true,
    observedInAnalyticsWindow: operations.length > 0 || Boolean(latestStorage),
    operations,
    latestStorage
  };
}

const queueMetrics = {};
const boundQueueNames = new Set(queueBindings.map(binding => binding?.queue_name).filter(Boolean));
const hasAnyBrickQueueBinding = queueNames.some(name => boundQueueNames.has(name));
let queueByName = new Map();

// Account Queue inventory/metrics are needed only when the live Worker actually uses Brick Queues.
// On the cardless deployment they are intentionally skipped instead of failing an otherwise valid
// production audit because an unused product API is not entitled by the audit token/account.
if (hasAnyBrickQueueBinding) {
  const queues = await cf(`/accounts/${accountId}/queues?per_page=100`);
  queueByName = new Map((Array.isArray(queues) ? queues : []).map(queue => [queue.queue_name, queue]));
}

for (const name of queueNames) {
  const bound = boundQueueNames.has(name);
  const queue = queueByName.get(name);
  if (!bound) {
    queueMetrics[name] = {
      deployed: false,
      boundToCanonicalWorker: false,
      deploymentState: 'NOT_BOUND_TO_CANONICAL_WORKER',
      queueId: null,
      realtimeBacklog: null,
      operations: []
    };
    continue;
  }
  if (!queue?.queue_id) {
    throw new Error(`Canonical Worker is bound to ${name}, but live Queue inventory does not contain it`);
  }

  const queueId = queue.queue_id;
  const realtime = await cf(`/accounts/${accountId}/queues/${queueId}/metrics`);
  const queueQuery = `
  query BrickQueue($accountTag: string!, $queueId: string!, $start: Time!, $end: Time!) {
    viewer { accounts(filter: { accountTag: $accountTag }) {
      queueMessageOperationsAdaptiveGroups(limit: 10000, filter: { queueId: $queueId, datetime_geq: $start, datetime_leq: $end }) {
        count
        sum { billableOperations bytes }
        avg { lagTime retryCount }
        max { messageSize }
        dimensions { actionType outcome }
      }
    }}
  }`;
  const data = await gql(queueQuery, { accountTag: accountId, queueId, start: startTime, end: endTime });
  queueMetrics[name] = {
    deployed: true,
    boundToCanonicalWorker: true,
    deploymentState: 'BOUND_TO_CANONICAL_WORKER',
    queueId,
    realtimeBacklog: realtime,
    operations: data?.viewer?.accounts?.[0]?.queueMessageOperationsAdaptiveGroups || []
  };
}

const safeBindingSummary = bindings
  .filter(binding => ['d1', 'r2_bucket', 'queue', 'durable_object_namespace'].includes(binding?.type))
  .map(binding => ({
    name: binding.name || null,
    type: binding.type || null,
    resourceName: binding.queue_name || binding.bucket_name || null
  }));

const evidence = {
  version: 4,
  sourceGitSha: process.env.GITHUB_SHA || null,
  measuredAt: new Date().toISOString(),
  windowDays: days,
  windowStart: startTime,
  windowEnd: endTime,
  worker: {
    name: workerName,
    settingsVerified: true,
    activeBindingSummary: safeBindingSummary,
    observedInWindow: worker !== null,
    requests: Number(worker?.sum?.requests || 0),
    errors: Number(worker?.sum?.errors || 0),
    subrequests: Number(worker?.sum?.subrequests || 0),
    cpuTimeP50: Number(worker?.quantiles?.cpuTimeP50 || 0),
    cpuTimeP99: Number(worker?.quantiles?.cpuTimeP99 || 0)
  },
  d1: {
    name: d1Name,
    deployed: true,
    boundToCanonicalWorker: true,
    id: database.uuid,
    restFileSizeBytes: Number(dbInfo?.file_size || 0),
    analyticsDatabaseSizeBytesMax: d1AnalyticsStorageMaxBytes,
    version: dbInfo?.version || null,
    ...d1Totals
  },
  r2,
  queues: queueMetrics,
  deploymentTruth: {
    source: 'live Worker script/version settings bindings; account Queue inventory only when actively bound',
    r2Bound: r2Buckets.filter(name => r2[name]?.boundToCanonicalWorker === true),
    r2NotBound: r2Buckets.filter(name => r2[name]?.boundToCanonicalWorker !== true),
    queuesDeployed: queueNames.filter(name => queueMetrics[name]?.deployed === true),
    queuesNotDeployed: queueNames.filter(name => queueMetrics[name]?.deployed === false),
    rule: 'Planned services not bound to the canonical deployed Worker are recorded as inactive and are not assigned invented usage/storage metrics.'
  },
  notes: [
    'GraphQL analytics can be adaptively sampled and are operational evidence, not a billing invoice.',
    'D1 storage uses d1StorageAdaptiveGroups databaseSizeBytes plus REST file size as a point-in-time cross-check.',
    'Worker binding metadata is the primary truth for whether the production Brick Worker actively uses D1, R2 or Queue producer resources.',
    'Queue inventory/metrics are queried only if the canonical Worker has a Brick Queue binding; unused cardless-plan Queue APIs cannot invalidate D1/Worker evidence.',
    'No-sample analytics windows are not treated as proof that a bound resource is absent.',
    'This file contains no API token, secret binding values or authentication secret.'
  ]
};

await fs.writeFile(outPath, JSON.stringify(evidence, null, 2));
console.log(`Phase 8 Cloudflare usage/deployment-truth evidence written for ${days} day(s).`);
