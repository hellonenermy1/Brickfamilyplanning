PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS device_location_control (
  device_id TEXT PRIMARY KEY,
  desired_enabled INTEGER NOT NULL CHECK (desired_enabled IN (0,1)),
  command_id TEXT NOT NULL UNIQUE,
  issued_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_actual_enabled INTEGER CHECK (last_actual_enabled IS NULL OR last_actual_enabled IN (0,1)),
  last_actual_at INTEGER,
  last_acked_command_id TEXT,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_location_control_updated
  ON device_location_control(updated_at DESC);
