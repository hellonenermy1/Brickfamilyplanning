-- Phase 5B no-R2 history + compact dedupe backend.
-- One row per device/hour is append-updated as new locations arrive.
-- Raw wire packets expire after 30 days; trusted-only compact records expire after 90 days.
-- Exact location dedupe stores 20 sequence bits per WITHOUT ROWID record to avoid hot-path index amplification.

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

CREATE TABLE IF NOT EXISTS location_seen_blocks (
  device_id TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  block_index INTEGER NOT NULL,
  mask INTEGER NOT NULL,
  received_count INTEGER NOT NULL,
  min_offset INTEGER NOT NULL,
  max_offset INTEGER NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY(device_id, epoch, block_index)
) WITHOUT ROWID;
