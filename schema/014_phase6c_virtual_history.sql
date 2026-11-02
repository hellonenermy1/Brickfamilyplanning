-- Phase 6C card-free beta: write-efficient location history.
-- Each accepted fix is appended once. The R2-compatible development adapter synthesizes the
-- production 15-minute raw/trusted objects on read, avoiding repeated segment rewrites.
CREATE TABLE IF NOT EXISTS dev_location_history (
  device_id TEXT NOT NULL,
  safe_device_id TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  wall_time_ms INTEGER NOT NULL,
  segment_start_ms INTEGER NOT NULL,
  trusted_packet_json TEXT NOT NULL,
  raw_packet_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(device_id, epoch, sequence)
);

CREATE INDEX IF NOT EXISTS idx_dev_location_history_segment
  ON dev_location_history(safe_device_id, segment_start_ms, epoch, sequence);
CREATE INDEX IF NOT EXISTS idx_dev_location_history_time
  ON dev_location_history(device_id, wall_time_ms, epoch, sequence);
