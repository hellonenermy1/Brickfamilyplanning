ALTER TABLE devices ADD COLUMN last_health_at INTEGER;
ALTER TABLE devices ADD COLUMN health_status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE devices ADD COLUMN recovery_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE devices ADD COLUMN pending_records INTEGER NOT NULL DEFAULT 0;
ALTER TABLE devices ADD COLUMN app_version TEXT;

CREATE TABLE IF NOT EXISTS device_health_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_health_events_device_time
  ON device_health_events(device_id, created_at DESC);
