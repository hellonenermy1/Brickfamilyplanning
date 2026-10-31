CREATE TABLE IF NOT EXISTS evidence_batches (
  device_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  protocol INTEGER NOT NULL,
  record_count INTEGER NOT NULL,
  byte_length INTEGER NOT NULL,
  payload_sha256 TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  PRIMARY KEY(device_id, batch_id),
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_evidence_batches_device_time
  ON evidence_batches(device_id, received_at DESC);

CREATE TABLE IF NOT EXISTS evidence_records (
  device_id TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  record_id TEXT NOT NULL,
  provider INTEGER NOT NULL,
  family INTEGER NOT NULL,
  capability INTEGER NOT NULL,
  health INTEGER NOT NULL,
  quality INTEGER NOT NULL,
  independence_group TEXT NOT NULL,
  elapsed_realtime_ms INTEGER NOT NULL,
  wall_time_ms INTEGER NOT NULL,
  payload_sha256 TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  PRIMARY KEY(device_id, epoch, sequence),
  UNIQUE(device_id, record_id),
  UNIQUE(device_id, record_id, epoch, sequence),
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_evidence_records_device_time
  ON evidence_records(device_id, wall_time_ms DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_records_provider_time
  ON evidence_records(device_id, provider, wall_time_ms DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_records_family_time
  ON evidence_records(device_id, family, wall_time_ms DESC);

CREATE TABLE IF NOT EXISTS evidence_batch_records (
  device_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  PRIMARY KEY(device_id, batch_id, record_id),
  FOREIGN KEY(device_id, batch_id) REFERENCES evidence_batches(device_id, batch_id) ON DELETE CASCADE,
  FOREIGN KEY(device_id, record_id, epoch, sequence)
    REFERENCES evidence_records(device_id, record_id, epoch, sequence) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS device_evidence_state (
  device_id TEXT PRIMARY KEY,
  last_epoch INTEGER NOT NULL DEFAULT 0,
  last_sequence INTEGER NOT NULL DEFAULT 0,
  last_received_at INTEGER,
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evidence_provider_health (
  device_id TEXT NOT NULL,
  provider INTEGER NOT NULL,
  capability INTEGER NOT NULL,
  health INTEGER NOT NULL,
  reason TEXT,
  last_epoch INTEGER NOT NULL,
  last_sequence INTEGER NOT NULL,
  observed_wall_ms INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  PRIMARY KEY(device_id, provider),
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
);

-- Phase 4 foundation only. No Atlas learning algorithm is implemented by this migration.
CREATE TABLE IF NOT EXISTS atlas_models (
  device_id TEXT NOT NULL,
  model_key TEXT NOT NULL,
  model_version INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL DEFAULT 'empty',
  r2_key TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(device_id, model_key),
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
);

-- Phase 5 foundation only. No Witness Mesh behavior is implemented by this migration.
CREATE TABLE IF NOT EXISTS witness_authorizations (
  device_id TEXT NOT NULL,
  witness_device_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(device_id, witness_device_id),
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE,
  FOREIGN KEY(witness_device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ground_receivers (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  radius_m REAL,
  public_key_spki_b64 TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
);

-- Phase 6 foundation only. No parent command API is exposed in Phase 2.
CREATE TABLE IF NOT EXISTS device_commands (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  command_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  acknowledged_at INTEGER,
  result_json TEXT,
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_device_commands_pending
  ON device_commands(device_id, status, created_at);

-- Phase 5/7 foundation only. Raw/realtime/refined history remain separate by design.
CREATE TABLE IF NOT EXISTS refined_history_runs (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  from_ms INTEGER NOT NULL,
  to_ms INTEGER NOT NULL,
  model_version TEXT NOT NULL,
  r2_key TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_refined_history_device_time
  ON refined_history_runs(device_id, from_ms, to_ms);
