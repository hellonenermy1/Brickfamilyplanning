-- Phase 5B no-R2 history backend.
-- One row per device/hour is append-updated as new locations arrive.
-- Raw wire packets expire after 30 days; trusted-only compact records expire after 90 days.

CREATE TABLE IF NOT EXISTS history_hours (
  device_id TEXT NOT NULL,
  hour_start INTEGER NOT NULL,
  raw_blob BLOB,
  trusted_blob BLOB NOT NULL,
  point_count INTEGER NOT NULL DEFAULT 0,
  raw_expires_at INTEGER NOT NULL,
  trusted_expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(device_id, hour_start)
);

CREATE INDEX IF NOT EXISTS idx_history_hours_retention
  ON history_hours(trusted_expires_at, raw_expires_at);
