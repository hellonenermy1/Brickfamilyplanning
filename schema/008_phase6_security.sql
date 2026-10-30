PRAGMA foreign_keys = ON;

-- setup.mjs adds last_health_sequence to existing installations before this migration.
-- New installations already receive the column from 001_init.sql.
CREATE INDEX IF NOT EXISTS idx_devices_health_sequence
  ON devices(id, last_health_sequence);
