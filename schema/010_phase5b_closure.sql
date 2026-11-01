-- Phase 5B closure: durable inputs/indexes for Phase 5 backward smoothing.
-- Raw/realtime/trusted history remains untouched. Refined outputs are separate R2 objects indexed by
-- the existing phase5_refined_intervals table from schema/009_v1_phase5_fusion.sql.

CREATE TABLE IF NOT EXISTS phase5_hypothesis_frames (
  device_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  wall_time_ms INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  refined_run_id TEXT,
  PRIMARY KEY(device_id, record_id),
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_phase5_hypothesis_device_time
  ON phase5_hypothesis_frames(device_id, wall_time_ms);
CREATE INDEX IF NOT EXISTS idx_phase5_hypothesis_unrefined
  ON phase5_hypothesis_frames(device_id, refined_run_id, wall_time_ms);

CREATE TABLE IF NOT EXISTS phase5_precise_endpoints (
  device_id TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  wall_time_ms INTEGER NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  uncertainty_m REAL NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(device_id, epoch, sequence),
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_phase5_precise_endpoint_time
  ON phase5_precise_endpoints(device_id, wall_time_ms);
