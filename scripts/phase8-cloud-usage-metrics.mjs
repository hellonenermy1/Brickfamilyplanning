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

const databases = await cf(`/accounts/${accountId}/d1/database?per_page=100`);
const database = Array.isArray(databases) ? databases.find(db => db?.name === d1Name) : null;
if (!database?.uuid) throw new Error(`Production D1 database ${d1Name} was not found`);
const dbInfo = await cf(`/accounts/${accountId}/d1/database/${database.uuid}`);

// Queue/R2 helpers exist in the repository, but Phase 8 must measure deployment truth rather than
// assuming every planned binding exists. Queue inventory is authoritative for what is deployed now.
const queues = await cf(`/accounts/${accountId}/queues?per_page=100`);
const queueByName = new Map((Array.isArray(queues) ? queues : []).map(q => [q.queue_name, q]));

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
const d1Totals = d1Groups.reduce((acc, g) => {
  for (const key of ['readQueries', 'writeQueries', 'rowsRead', 'rowsWritten', 'queryBatchResponseBytes', 'queryBatchTimeMs']) {
    acc[key] += Number(g?.sum?.[key] || 0);
  }
  acc.queryBatchTimeMsP90Max = Math.max(acc.queryBatchTimeMsP90Max, Number(g?.quantiles?.queryBatchTimeMsP90 || 0));
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
  const operations = (account.r2OperationsAdaptiveGroups || []).map(g => ({
    actionType: g?.dimensions?.actionType || null,
    actionStatus: g?.dimensions?.actionStatus || null,
    requests: Number(g?.sum?.requests || 0)
  }));
  const latestStorage = account.r2StorageAdaptiveGroups?.[0] || null;
  r2[bucketName] = {
    // GraphQL cannot distinguish an existing idle bucket from an absent bucket when both return no
    // samples, so keep the state honest instead of inventing a deployment claim.
    deploymentState: (operations.length > 0 || latestStorage) ? 'OBSERVED_IN_ANALYTICS' : 'NOT_OBSERVED_IN_WINDOW',
    operations,
    latestStorage
  };
}

const queueMetrics = {};
for (const name of queueNames) {
  const queue = queueByName.get(name);
  if (!queue?.queue_id) {
    queueMetrics[name] = {
      deployed: false,
      queueId: null,
      realtimeBacklog: null,
      operations: []
    };
    continue;
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
    queueId,
    realtimeBacklog: realtime,
    operations: data?.viewer?.accounts?.[0]?.queueMessageOperationsAdaptiveGroups || []
  };
}

const evidence = {
  version: 3,
  sourceGitSha: process.env.GITHUB_SHA || null,
  measuredAt: new Date().toISOString(),
  windowDays: days,
  windowStart: startTime,
  windowEnd: endTime,
  worker: {
    name: workerName,
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
    id: database.uuid,
    restFileSizeBytes: Number(dbInfo?.file_size || 0),
    analyticsDatabaseSizeBytesMax: d1AnalyticsStorageMaxBytes,
    version: dbInfo?.version || null,
    ...d1Totals
  },
  r2,
  queues: queueMetrics,
  deploymentTruth: {
    queuesDeployed: queueNames.filter(name => queueMetrics[name]?.deployed === true),
    queuesNotDeployed: queueNames.filter(name => queueMetrics[name]?.deployed === false),
    rule: 'Undeployed planned services are recorded as absent and are not assigned invented operation/storage budgets.'
  },
  notes: [
    'GraphQL analytics can be adaptively sampled and are operational evidence, not a billing invoice.',
    'D1 storage uses d1StorageAdaptiveGroups databaseSizeBytes plus REST file size as a point-in-time cross-check.',
    'Queue inventory comes from the live account; undeployed queues are recorded explicitly rather than treated as an error.',
    'R2 no-sample windows are labeled NOT_OBSERVED_IN_WINDOW because analytics alone cannot distinguish absent from idle.',
    'This file contains no API token or authentication secret.'
  ]
};

await fs.writeFile(outPath, JSON.stringify(evidence, null, 2));
console.log(`Phase 8 Cloudflare usage/deployment-truth evidence written for ${days} day(s).`);
