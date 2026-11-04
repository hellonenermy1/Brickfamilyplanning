export type BackupEnv = { DB: D1Database; HISTORY: R2Bucket };

const BACKUP_PREFIX = "backups/d1/";
const BACKUP_RETENTION_MS = 30 * 86_400_000;
// Cloudflare D1 batch() is one transaction. One atomic SELECT per table avoids torn
// snapshots when a multi-table update commits during the scheduled backup.
const MAX_TABLE_ROWS = 500_000;
// Explicit supported recovery envelope, not a Cloudflare quota assertion. Keep
// producer and decoder limits aligned so a published backup is recoverable.
export const MAX_BACKUP_COMPRESSED_BYTES = 8 * 1024 * 1024;
export const MAX_BACKUP_DECODED_BYTES = 16 * 1024 * 1024;
class BackupSizeLimitError extends Error {}

async function boundedDecodedBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BACKUP_DECODED_BYTES) {
        await reader.cancel().catch(() => {});
        throw new BackupSizeLimitError("backup decoded byte limit exceeded");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return joined;
}
export const BACKUP_TABLES = [
  "devices",
  "device_location_control",
  "geofences",
  "geofence_state",
  "ble_anchors",
  "trips",
  "retention_settings",
  "safety_events",
  "health_incidents",
  "crash_reports",
  "audit_log",
  "device_replay_state",
  "device_live_track_control",
  "device_wifi_schedules",
  "device_wifi_schedule_result",
  "device_capability_profile",
  "screen_time_daily",
  "commute_summaries",
  "device_events",
  "device_health_events",
  "device_health_samples",
  "evidence_batches",
  "evidence_records",
  "evidence_batch_records",
  "device_evidence_state",
  "evidence_provider_health",
  "atlas_models",
  "witness_authorizations",
  "ground_receivers",
  "device_commands",
  "refined_history_runs",
  "witness_aliases",
  "witness_sightings",
  "ground_sightings",
  "learned_place_models",
  "phase5_refined_intervals",
  "phase5_hypothesis_frames",
  "phase5_precise_endpoints"
] as const;
const V2_TABLES = BACKUP_TABLES.slice(0, 18);
const PRE_P8B_TABLES = BACKUP_TABLES.slice(0, 12);
// Every declared table is classified; never revive short-lived credentials/rate/cache state.
export const TRANSIENT_RECOVERY_TABLES = ["pairing_tokens", "pairing_pin_sessions", "provider_rate_window", "provider_cache"] as const;
export const DEVELOPMENT_RECOVERY_TABLES = ["dev_object_store", "dev_object_chunks", "dev_parent_login_tokens", "dev_parent_sessions", "dev_maintenance_state", "dev_location_history"] as const;
const LEGACY_V1_TABLES = PRE_P8B_TABLES.filter(table => table !== "device_location_control");

type BackupSnapshot = {
  format: "brick-d1-snapshot-v1" | "brick-d1-snapshot-v2" | "brick-d1-snapshot-v3";
  missingTables?: string[];
  createdAt: number;
  excludes: string[];
  tables: Record<string, Record<string, unknown>[]>;
};

async function readAtomicTables(db: D1Database): Promise<Record<string, Record<string, unknown>[]>> {
  // All 38 read statements are executed within ONE transaction on the D1 primary.
  // Paging independently is unsafe: a concurrent transaction can update different
  // tables between reads and create a backup that never existed as one coherent state.
  // The extra row fails closed instead of silently truncating large tables.
  const queries = BACKUP_TABLES.map(table =>
    db.prepare(`SELECT * FROM ${table} LIMIT ?1`).bind(MAX_TABLE_ROWS + 1)
  );
  const pages = await db.batch<Record<string, unknown>>(queries);
  if (pages.length !== BACKUP_TABLES.length) throw new Error("atomic D1 backup did not return every table");
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (let i = 0; i < BACKUP_TABLES.length; i++) {
    const rows = pages[i]?.results;
    if (!Array.isArray(rows) || rows.length > MAX_TABLE_ROWS)
      throw new Error(`atomic D1 backup table missing or exceeds row safety limit: ${BACKUP_TABLES[i]}`);
    tables[BACKUP_TABLES[i]] = rows;
  }
  return tables;
}

async function gzipJson(value: unknown): Promise<ArrayBuffer> {
  const raw = new TextEncoder().encode(JSON.stringify(value));
  if (raw.byteLength > MAX_BACKUP_DECODED_BYTES) throw new BackupSizeLimitError("backup decoded byte limit exceeded");
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

function sameNames(actual: string[], expected: readonly string[]) {
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((name, i) => name === wanted[i]);
}

export async function validateBackupBody(body: ArrayBuffer, expectedSha256?: string): Promise<BackupSnapshot> {
  if (!body.byteLength) throw new Error("backup body is empty");
  if (body.byteLength > MAX_BACKUP_COMPRESSED_BYTES) throw new BackupSizeLimitError("backup compressed byte limit exceeded");
  if (expectedSha256 !== undefined) {
    if (!/^[0-9a-f]{64}$/i.test(expectedSha256)) throw new Error("invalid expected backup hash");
    const actual = await sha256Hex(body);
    if (actual.toLowerCase() !== expectedSha256.toLowerCase()) throw new Error("backup integrity hash mismatch");
  }

  let value: unknown;
  try {
    const decompressed = new Blob([body]).stream().pipeThrough(new DecompressionStream("gzip"));
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await boundedDecodedBytes(decompressed)));
  } catch (error) {
    if (error instanceof BackupSizeLimitError) throw error;
    throw new Error("backup gzip/JSON is unreadable");
  }
  if (!isRecord(value) || !["brick-d1-snapshot-v1", "brick-d1-snapshot-v2", "brick-d1-snapshot-v3"].includes(String(value.format))) throw new Error("unsupported backup format");
  if (typeof value.createdAt !== "number" || !Number.isSafeInteger(value.createdAt) || value.createdAt <= 0) throw new Error("invalid backup timestamp");
  if (!Array.isArray(value.excludes) || !value.excludes.every(x => typeof x === "string")) throw new Error("invalid backup exclusions");
  if (!isRecord(value.tables)) throw new Error("invalid backup tables");

  const tables = value.tables as Record<string, unknown>;
  const tableNames = Object.keys(tables).sort();
  const current = sameNames(tableNames, BACKUP_TABLES);
  const preP8B = sameNames(tableNames, PRE_P8B_TABLES);
  const legacy = sameNames(tableNames, LEGACY_V1_TABLES);
  if (value.format === "brick-d1-snapshot-v3") {
    if (!current) throw new Error("v3 backup must contain all durable production tables");
    value.missingTables = [];
  } else {
    if (value.format === "brick-d1-snapshot-v2") {
      if (!sameNames(tableNames, V2_TABLES)) throw new Error("v2 backup must contain all Phase 8B durable tables");
    } else if (!preP8B && !legacy) throw new Error("v1 backup table set does not match historical schema");
    // Compatibility is not complete recovery: retain an explicit missing-table
    // result so an old snapshot cannot silently pass the current acceptance gate.
    value.missingTables = BACKUP_TABLES.filter(table => !(table in tables));
    for (const table of BACKUP_TABLES) if (!(table in tables)) tables[table] = [];
  }

  for (const table of BACKUP_TABLES) {
    const rows = tables[table];
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
  const tables = await readAtomicTables(env.DB);
  const snapshot: BackupSnapshot = {
    format: "brick-d1-snapshot-v3",
    createdAt: now,
    excludes: [
      "pairing_tokens: short-lived credentials are intentionally not backed up",
      "pairing_pin_sessions: one-time pairing credentials are never restored",
      "provider_rate_window: transient rate counters are never restored",
      "provider_cache: reconstructible external cache is never restored"
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
      format: "brick-d1-snapshot-v3",
      createdAt: String(now),
      retentionDays: "30",
      sha256: bodySha256
    }
  });
  await cleanupOldBackups(env.HISTORY, now);
  return { key, bytes: body.byteLength, createdAt: now, sha256: bodySha256 };
}
