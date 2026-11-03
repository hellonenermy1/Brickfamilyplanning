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

const queues = await cf(`/accounts/${accountId}/queues?per_page=100`);
const queueByName = new Map((Array.isArray(queues) ? queues : []).map(q => [q.queue_name, q]));
for (const name of queueNames) {
  if (!queueByName.get(name)?.queue_id) throw new Error(`Queue ${name} was not found`);
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
const d1Totals = d1Groups.reduce((acc, g) => {
  for (const key of ['readQueries', 'writeQueries', 'rowsRead', 'rowsWritten', 'queryBatchResponseBytes', 'queryBatchTimeMs']) {
    acc[key] += Number(g?.sum?.[key] || 0);
  }
  acc.queryBatchTimeMsP90Max = Math.max(acc.queryBatchTimeMsP90Max, Number(g?.quantiles?.queryBatchTimeMsP90 || 0));
  return acc;
}, { readQueries: 0, writeQueries: 0, rowsRead: 0, rowsWritten: 0, queryBatchResponseBytes: 0, queryBatchTimeMs: 0, queryBatchTimeMsP90Max: 0 });

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
  r2[bucketName] = {
    operations: (account.r2OperationsAdaptiveGroups || []).map(g => ({
      actionType: g?.dimensions?.actionType || null,
      actionStatus: g?.dimensions?.actionStatus || null,
      requests: Number(g?.sum?.requests || 0)
    })),
    latestStorage: account.r2StorageAdaptiveGroups?.[0] || null
  };
}

const queueMetrics = {};
for (const name of queueNames) {
  const queueId = queueByName.get(name).queue_id;
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
    realtimeBacklog: realtime,
    operations: data?.viewer?.accounts?.[0]?.queueMessageOperationsAdaptiveGroups || []
  };
}

const evidence = {
  version: 1,
  sourceGitSha: process.env.GITHUB_SHA || null,
  measuredAt: new Date().toISOString(),
  windowDays: days,
  windowStart: startTime,
  windowEnd: endTime,
  worker: {
    name: workerName,
    requests: Number(worker?.sum?.requests || 0),
    errors: Number(worker?.sum?.errors || 0),
    subrequests: Number(worker?.sum?.subrequests || 0),
    cpuTimeP50: Number(worker?.quantiles?.cpuTimeP50 || 0),
    cpuTimeP99: Number(worker?.quantiles?.cpuTimeP99 || 0)
  },
  d1: {
    name: d1Name,
    id: database.uuid,
    fileSizeBytes: Number(dbInfo?.file_size || 0),
    version: dbInfo?.version || null,
    ...d1Totals
  },
  r2,
  queues: queueMetrics,
  notes: [
    'GraphQL analytics can be adaptively sampled and are operational evidence, not a billing invoice.',
    'Queue realtime backlog metrics are best-effort and may be approximate.',
    'This file contains no API token or authentication secret.'
  ]
};

await fs.writeFile(outPath, JSON.stringify(evidence, null, 2));
console.log(`Phase 8 Cloudflare usage evidence written for ${days} day(s).`);
