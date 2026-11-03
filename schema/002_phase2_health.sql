CREATE TABLE IF NOT EXISTS device_health_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_health_events_device_time
  ON device_health_events(device_id, created_at DESC);
