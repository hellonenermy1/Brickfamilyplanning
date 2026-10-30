CREATE TABLE IF NOT EXISTS crash_reports (
  report_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  app_version TEXT NOT NULL,
  module TEXT NOT NULL,
  exception_signature TEXT NOT NULL,
  device_created_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  FOREIGN KEY(device_id) REFERENCES devices(id)
);

CREATE INDEX IF NOT EXISTS idx_crash_reports_device_time
  ON crash_reports(device_id, received_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_audit_log_time
  ON audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS device_replay_state (
  device_id TEXT PRIMARY KEY,
  last_health_sequence INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
);
