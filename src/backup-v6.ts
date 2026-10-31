export type BackupEnv = { DB: D1Database; HISTORY: R2Bucket };

const BACKUP_PREFIX = "backups/d1/";
const BACKUP_RETENTION_MS = 30 * 86_400_000;
const PAGE = 1000;
export const BACKUP_TABLES = [
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

type BackupSnapshot = {
  format: "brick-d1-snapshot-v1";
  createdAt: number;
  excludes: string[];
  tables: Record<string, Record<string, unknown>[]>;
};

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

async function sha256Hex(body: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", body));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function validateBackupBody(body: ArrayBuffer, expectedSha256?: string): Promise<BackupSnapshot> {
  if (!body.byteLength) throw new Error("backup body is empty");
  if (expectedSha256 !== undefined) {
    if (!/^[0-9a-f]{64}$/i.test(expectedSha256)) throw new Error("invalid expected backup hash");
    const actual = await sha256Hex(body);
    if (actual.toLowerCase() !== expectedSha256.toLowerCase()) throw new Error("backup integrity hash mismatch");
  }

  let value: unknown;
  try {
    const decompressed = new Blob([body]).stream().pipeThrough(new DecompressionStream("gzip"));
    value = JSON.parse(await new Response(decompressed).text());
  } catch {
    throw new Error("backup gzip/JSON is unreadable");
  }
  if (!isRecord(value) || value.format !== "brick-d1-snapshot-v1") throw new Error("unsupported backup format");
  if (typeof value.createdAt !== "number" || !Number.isSafeInteger(value.createdAt) || value.createdAt <= 0) throw new Error("invalid backup timestamp");
  if (!Array.isArray(value.excludes) || !value.excludes.every(x => typeof x === "string")) throw new Error("invalid backup exclusions");
  if (!isRecord(value.tables)) throw new Error("invalid backup tables");

  const tableNames = Object.keys(value.tables).sort();
  const expectedNames = [...BACKUP_TABLES].sort();
  if (tableNames.length !== expectedNames.length || tableNames.some((name, i) => name !== expectedNames[i])) {
    throw new Error("backup table set does not match Brick V1");
  }
  for (const table of BACKUP_TABLES) {
    const rows = value.tables[table];
    if (!Array.isArray(rows) || !rows.every(isRecord)) throw new Error(`invalid backup table ${table}`);
  }
  return value as unknown as BackupSnapshot;
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
  for (const table of BACKUP_TABLES) tables[table] = await readTable(env.DB, table);
  const snapshot: BackupSnapshot = {
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
  const bodySha256 = await sha256Hex(body);
  // Validate what we are about to store before publishing the object. This catches serialization/compression
  // regressions in production rather than discovering them during a recovery event.
  await validateBackupBody(body, bodySha256);
  const day = new Date(now).toISOString().slice(0, 10);
  const key = `${BACKUP_PREFIX}${day}.json.gz`;
  await env.HISTORY.put(key, body, {
    httpMetadata: { contentType: "application/json", contentEncoding: "gzip" },
    customMetadata: {
      format: "brick-d1-snapshot-v1",
      createdAt: String(now),
      retentionDays: "30",
      sha256: bodySha256
    }
  });
  await cleanupOldBackups(env.HISTORY, now);
  return { key, bytes: body.byteLength, createdAt: now, sha256: bodySha256 };
}
