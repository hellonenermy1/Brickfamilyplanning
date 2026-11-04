import { BACKUP_TABLES, validateBackupBody } from "./backup-v6";
import { EXTRA_RESTORE_SPECS } from "./recovery-extra-specs";
import { canonicalizeHistoricalDeviceRows } from "./phase8-device-identity";

type RestoreEnv = { DB: D1Database };
type Snapshot = Awaited<ReturnType<typeof validateBackupBody>>;
type Row = Record<string, unknown>;

type TableSpec = {
  columns: readonly string[];
  required: readonly string[];
};

const RESTORE_ORDER = [
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

const SPECS: Record<(typeof RESTORE_ORDER)[number], TableSpec> = {
  ...EXTRA_RESTORE_SPECS,
  devices: {
    columns: ["id", "name", "public_key_spki_b64", "created_at", "last_seen_at", "revoked_at", "last_epoch", "last_sequence", "last_health_at", "health_status", "recovery_count", "pending_records", "app_version"],
    required: ["id", "name", "public_key_spki_b64", "created_at"]
  },
  device_location_control: {
    columns: ["device_id", "desired_enabled", "command_id", "issued_at", "updated_at", "last_actual_enabled", "last_actual_at", "last_acked_command_id", "command_status", "completed_at", "result_actual_enabled", "result_success", "result_reason"],
    required: ["device_id", "desired_enabled", "command_id", "issued_at", "updated_at"]
  },
  geofences: {
    columns: ["id", "device_id", "name", "latitude", "longitude", "radius_m", "enabled", "created_at"],
    required: ["id", "device_id", "name", "latitude", "longitude", "radius_m", "enabled", "created_at"]
  },
  geofence_state: {
    columns: ["geofence_id", "device_id", "stable_state", "candidate_state", "candidate_since", "candidate_count", "last_distance_m", "updated_at", "last_epoch", "last_sequence"],
    required: ["geofence_id", "device_id", "stable_state", "updated_at"]
  },
  ble_anchors: {
    columns: ["geofence_id", "device_id", "beacon_uuid", "created_at", "updated_at"],
    required: ["geofence_id", "device_id", "beacon_uuid", "created_at", "updated_at"]
  },
  trips: {
    columns: ["id", "device_id", "state", "destination_name", "destination_latitude", "destination_longitude", "destination_radius_m", "expected_arrival_at", "started_at", "ended_at", "arrival_candidate_since", "arrival_candidate_count", "last_alert_at", "stationary_since", "last_stop_alert_at", "last_eval_epoch", "last_eval_sequence", "last_distance_to_destination_m", "last_location_at"],
    required: ["id", "device_id", "state", "started_at"]
  },
  retention_settings: {
    columns: ["device_id", "safety_event_days", "updated_at"],
    required: ["device_id", "safety_event_days", "updated_at"]
  },
  safety_events: {
    columns: ["id", "device_id", "kind", "device_created_at", "server_created_at", "latitude", "longitude", "accuracy_m", "detail_json"],
    required: ["id", "device_id", "kind", "device_created_at", "server_created_at", "detail_json"]
  },
  health_incidents: {
    columns: ["id", "device_id", "kind", "severity", "started_at", "last_seen_at", "ended_at", "alerted_at", "auto_recovered", "detail_json"],
    required: ["id", "device_id", "kind", "severity", "started_at", "last_seen_at", "auto_recovered", "detail_json"]
  },
  crash_reports: {
    columns: ["report_id", "device_id", "app_version", "module", "exception_signature", "device_created_at", "received_at"],
    required: ["report_id", "device_id", "app_version", "module", "exception_signature", "device_created_at", "received_at"]
  },
  audit_log: {
    columns: ["id", "event_type", "method", "path", "status", "created_at", "detail_json"],
    required: ["id", "event_type", "method", "path", "status", "created_at", "detail_json"]
  },
  device_replay_state: {
    columns: ["device_id", "last_health_sequence", "updated_at"],
    required: ["device_id", "last_health_sequence", "updated_at"]
  },
  device_live_track_control: {
    columns: ["device_id","command_id","requested_active","issued_at","expires_at","command_status","last_actual_active","completed_at","result_reason"],
    required: ["device_id","command_id","requested_active","issued_at","expires_at","command_status"]
  },
  device_wifi_schedules: {
    columns: ["id","device_id","enabled","target_enabled","local_minute_of_day","days_mask","grace_minutes","updated_at"],
    required: ["id","device_id","enabled","target_enabled","local_minute_of_day","days_mask","grace_minutes","updated_at"]
  },
  device_wifi_schedule_result: {
    columns: ["device_id","schedule_id","target_enabled","actual_enabled","status","attempted_at","detail","received_at"],
    required: ["device_id","schedule_id","target_enabled","status","attempted_at","received_at"]
  },
  device_capability_profile: {
    columns: ["device_id","profile_version","profile_json","device_updated_at","received_at"],
    required: ["device_id","profile_version","profile_json","device_updated_at","received_at"]
  },
  screen_time_daily: {
    columns: ["device_id","local_day","total_foreground_ms","session_count","summary_json","received_at"],
    required: ["device_id","local_day","total_foreground_ms","session_count","summary_json","received_at"]
  },
  commute_summaries: {
    columns: ["id","device_id","started_at","ended_at","distance_m","duration_ms","transport_mode","mode_confidence","start_label","end_label","provenance","created_at"],
    required: ["id","device_id","started_at","ended_at","distance_m","duration_ms","transport_mode","mode_confidence","provenance","created_at"]
  }
};

const BATCH_SIZE = 100;

function isBindable(value: unknown): value is string | number | null | ArrayBuffer {
  return value === null || typeof value === "string" || typeof value === "number" || value instanceof ArrayBuffer;
}

function validatedColumns(table: (typeof RESTORE_ORDER)[number], row: Row): string[] {
  const spec = SPECS[table];
  const keys = Object.keys(row);
  if (!keys.length) throw new Error(`backup row for ${table} is empty`);
  const allowed = new Set(spec.columns);
  for (const key of keys) if (!allowed.has(key)) throw new Error(`backup row for ${table} contains unknown column ${key}`);
  for (const key of spec.required) if (!(key in row)) throw new Error(`backup row for ${table} is missing required column ${key}`);
  const columns = spec.columns.filter(column => column in row);
  for (const column of columns) if (!isBindable(row[column])) throw new Error(`backup value for ${table}.${column} is not D1-bindable`);
  return columns;
}

async function tableCount(db: D1Database, table: string): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
  const value = Number(row?.n ?? 0);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`invalid row count for ${table}`);
  return value;
}

async function assertFreshTarget(db: D1Database) {
  for (const table of BACKUP_TABLES) {
    if (await tableCount(db, table) !== 0) throw new Error(`restore target is not empty: ${table}`);
  }
}

function statementFor(db: D1Database, table: (typeof RESTORE_ORDER)[number], row: Row): D1PreparedStatement {
  const columns = validatedColumns(table, row);
  const placeholders = columns.map((_, i) => `?${i + 1}`).join(",");
  const sql = `INSERT INTO ${table} (${columns.join(",")}) VALUES (${placeholders})`;
  return db.prepare(sql).bind(...columns.map(column => row[column] as string | number | null | ArrayBuffer));
}

async function executeFreshRestore(db: D1Database, snapshot: Snapshot) {
  const expected = new Map<string, number>();
  let batch: D1PreparedStatement[] = [];

  const flush = async () => {
    if (!batch.length) return;
    await db.batch(batch);
    batch = [];
  };

  for (const table of RESTORE_ORDER) {
    const rows = snapshot.tables[table];
    expected.set(table, rows.length);
    for (const row of rows) {
      batch.push(statementFor(db, table, row));
      if (batch.length >= BATCH_SIZE) await flush();
    }
    // Keep foreign-key dependency stages separate and make failures easier to diagnose.
    await flush();
  }

  for (const table of RESTORE_ORDER) {
    const actual = await tableCount(db, table);
    const wanted = expected.get(table) ?? 0;
    if (actual !== wanted) throw new Error(`restore verification failed for ${table}: expected ${wanted}, got ${actual}`);
  }
  return Object.fromEntries(expected);
}

/**
 * Restoring history must never reissue commands left pending during a disaster.
 * Only explicit NEW post-recovery user requests may trigger one-shot actions.
 */
function retirePendingCommands(snapshot: Snapshot) {
  const at = Date.now();
  for (const row of snapshot.tables.device_location_control) {
    if (row.command_status == null || row.command_status === "pending") {
      row.command_status = "expired";
      row.completed_at = at;
      row.result_success = 0;
      row.result_reason = "cancelled_on_disaster_restore";
    }
  }
  for (const row of snapshot.tables.device_commands) {
    if (row.status === "pending") {
      row.status = "expired"; row.result_json = JSON.stringify({ reason: "cancelled_on_disaster_restore" });
    }
  }
  for (const row of snapshot.tables.device_live_track_control) {
    if (row.command_status === "pending") {
      row.command_status = "expired";
      row.completed_at = at;
      row.result_reason = "cancelled_on_disaster_restore";
    }
  }
}

/**
 * Restores a Brick logical D1 snapshot only into a newly created, empty database whose current
 * migrations have already been applied. This function is intentionally not exposed as an HTTP
 * route. If any batch fails, discard the fresh target database and start the drill/recovery again;
 * Brick never attempts an in-place destructive overwrite of the live production database.
 */
export async function restoreBackupToFreshD1(env: RestoreEnv, body: ArrayBuffer, expectedSha256?: string) {
  const snapshot = await validateBackupBody(body, expectedSha256);
  // Old snapshots may predate canonical Base64 storage. Normalize the same DER SPKI to the current
  // representation before it reaches the text UNIQUE index, and reject semantic duplicate keys so a
  // recovery cannot recreate two logical devices for one cryptographic identity.
  snapshot.tables.devices = await canonicalizeHistoricalDeviceRows(snapshot.tables.devices);
  retirePendingCommands(snapshot);
  await assertFreshTarget(env.DB);
  const restoredRows = await executeFreshRestore(env.DB, snapshot);
  return { format: snapshot.format, createdAt: snapshot.createdAt, restoredRows,
    coverageComplete: (snapshot.missingTables ?? []).length === 0, missingTables: snapshot.missingTables ?? [] };
}

export const RESTORE_TABLE_ORDER = RESTORE_ORDER;
