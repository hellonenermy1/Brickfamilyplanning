CREATE TABLE IF NOT EXISTS device_health_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  service_active INTEGER NOT NULL,
  location_enabled INTEGER NOT NULL,
  location_subscribed INTEGER NOT NULL,
  fine_location_permission INTEGER,
  background_location_permission INTEGER,
  activity_recognition_permission INTEGER,
  battery_optimization_exempt INTEGER,
  background_restricted INTEGER,
  network TEXT NOT NULL,
  network_validated INTEGER,
  power_save_mode INTEGER,
  pending_records INTEGER NOT NULL,
  pending_safety_events INTEGER NOT NULL DEFAULT 0,
  oldest_pending_age_ms INTEGER,
  location_age_ms INTEGER,
  ack_age_ms INTEGER,
  battery_pct INTEGER,
  charging INTEGER,
  recovery_count INTEGER NOT NULL,
  position_available INTEGER NOT NULL,
  health_status TEXT NOT NULL,
  health_reason TEXT NOT NULL,
  app_version TEXT,
  FOREIGN KEY(device_id) REFERENCES devices(id)
);

CREATE INDEX IF NOT EXISTS idx_health_samples_device_time
  ON device_health_samples(device_id, received_at DESC);

CREATE TABLE IF NOT EXISTS health_incidents (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  ended_at INTEGER,
  alerted_at INTEGER,
  auto_recovered INTEGER NOT NULL DEFAULT 0,
  detail_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(device_id) REFERENCES devices(id)
);

CREATE INDEX IF NOT EXISTS idx_health_incidents_device_time
  ON health_incidents(device_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_incidents_open
  ON health_incidents(device_id, ended_at, started_at DESC);
