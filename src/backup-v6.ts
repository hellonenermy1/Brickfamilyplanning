export type BackupEnv = { DB: D1Database; HISTORY: R2Bucket };

const BACKUP_PREFIX = "backups/d1/";
const BACKUP_RETENTION_MS = 30 * 86_400_000;
const PAGE = 1000;
const TABLES = [
  "devices",
  "geofences",
  "geofence_state",
  "trips",
  "retention_settings",
  "safety_events",
  "health_incidents",
  "crash_reports",
  "audit_log",
  "device_replay_state"
] as const;

async function readTable(db: D1Database, table: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += PAGE) {
    // Table names are from the fixed constant allow-list above, never request input.
    const page = await db.prepare(`SELECT * FROM ${table} LIMIT ?1 OFFSET ?2`).bind(PAGE, offset).all<Record<string, unknown>>();
    out.push(...page.results);
    if (page.results.length < PAGE) return out;
    if (out.length > 500_000) throw new Error(`backup row safety limit exceeded for ${table}`);
  }
}

async function gzipJson(value: unknown): Promise<ArrayBuffer> {
  const raw = new TextEncoder().encode(JSON.stringify(value));
  const compressed = new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(compressed).arrayBuffer();
}

async function cleanupOldBackups(bucket: R2Bucket, now: number) {
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: BACKUP_PREFIX, cursor, limit: 1000 });
    const stale = page.objects.filter(o => now - o.uploaded.getTime() > BACKUP_RETENTION_MS).map(o => o.key);
    if (stale.length) await bucket.delete(stale);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

export async function snapshotD1ToR2(env: BackupEnv, now = Date.now()) {
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const table of TABLES) tables[table] = await readTable(env.DB, table);
  const snapshot = {
    format: "brick-d1-snapshot-v1",
    createdAt: now,
    excludes: [
      "device_events: derivable packet-delivery evidence; detailed routes are already in R2 history",
      "device_health_samples: high-volume operational telemetry retained separately in D1",
      "pairing_tokens: short-lived credentials are intentionally not backed up"
    ],
    tables
  };
  const body = await gzipJson(snapshot);
  const day = new Date(now).toISOString().slice(0, 10);
  const key = `${BACKUP_PREFIX}${day}.json.gz`;
  await env.HISTORY.put(key, body, {
    httpMetadata: { contentType: "application/json", contentEncoding: "gzip" },
    customMetadata: { format: "brick-d1-snapshot-v1", createdAt: String(now), retentionDays: "30" }
  });
  await cleanupOldBackups(env.HISTORY, now);
  return { key, bytes: body.byteLength, createdAt: now };
}
