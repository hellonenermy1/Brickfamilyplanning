PRAGMA foreign_keys = ON;

-- Historical desired_enabled remains only as the last command target for migration/audit. New code
-- uses command_status/result columns and never treats it as a persistent desired-state policy.
ALTER TABLE device_location_control ADD COLUMN command_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE device_location_control ADD COLUMN completed_at INTEGER;
ALTER TABLE device_location_control ADD COLUMN result_actual_enabled INTEGER CHECK (result_actual_enabled IS NULL OR result_actual_enabled IN (0,1));
ALTER TABLE device_location_control ADD COLUMN result_success INTEGER CHECK (result_success IS NULL OR result_success IN (0,1));
ALTER TABLE device_location_control ADD COLUMN result_reason TEXT;

CREATE TABLE IF NOT EXISTS device_live_track_control (
  device_id TEXT PRIMARY KEY,
  command_id TEXT NOT NULL UNIQUE,
  requested_active INTEGER NOT NULL CHECK (requested_active IN (0,1)),
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  command_status TEXT NOT NULL CHECK (command_status IN ('pending','completed','failed','expired')),
  last_actual_active INTEGER CHECK (last_actual_active IS NULL OR last_actual_active IN (0,1)),
  completed_at INTEGER,
  result_reason TEXT,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS device_wifi_schedules (
  id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
  target_enabled INTEGER NOT NULL CHECK (target_enabled IN (0,1)),
  local_minute_of_day INTEGER NOT NULL CHECK (local_minute_of_day BETWEEN 0 AND 1439),
  days_mask INTEGER NOT NULL CHECK (days_mask BETWEEN 1 AND 127),
  grace_minutes INTEGER NOT NULL CHECK (grace_minutes BETWEEN 1 AND 120),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(device_id,id),
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS device_wifi_schedule_result (
  device_id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL,
  target_enabled INTEGER NOT NULL CHECK (target_enabled IN (0,1)),
  actual_enabled INTEGER CHECK (actual_enabled IS NULL OR actual_enabled IN (0,1)),
  status TEXT NOT NULL,
  attempted_at INTEGER NOT NULL,
  detail TEXT,
  received_at INTEGER NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS device_capability_profile (
  device_id TEXT PRIMARY KEY,
  profile_version INTEGER NOT NULL,
  profile_json TEXT NOT NULL,
  device_updated_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS screen_time_daily (
  device_id TEXT NOT NULL,
  local_day TEXT NOT NULL,
  total_foreground_ms INTEGER NOT NULL,
  session_count INTEGER NOT NULL,
  summary_json TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  PRIMARY KEY(device_id,local_day),
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS commute_summaries (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  distance_m REAL NOT NULL,
  duration_ms INTEGER NOT NULL,
  transport_mode TEXT NOT NULL,
  mode_confidence REAL NOT NULL,
  start_label TEXT,
  end_label TEXT,
  provenance TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(device_id,started_at,ended_at),
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_commute_device_time ON commute_summaries(device_id,started_at DESC);

CREATE TABLE IF NOT EXISTS provider_cache (
  provider TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(provider,cache_key)
);
