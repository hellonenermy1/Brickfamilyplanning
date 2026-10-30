PRAGMA foreign_keys = ON;

ALTER TABLE devices ADD COLUMN last_health_sequence INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_devices_health_sequence
  ON devices(id, last_health_sequence);
