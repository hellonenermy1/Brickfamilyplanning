-- Brick V1 Phase 5: authorised Witness/Ground observations and refined-fusion metadata.

CREATE TABLE IF NOT EXISTS witness_aliases (
  alias TEXT PRIMARY KEY CHECK(length(alias)=16),
  child_device_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  valid_from_ms INTEGER NOT NULL,
  valid_to_ms INTEGER NOT NULL,
  source_record_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE(child_device_id, slot),
  FOREIGN KEY(child_device_id) REFERENCES devices(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_witness_alias_child_time
  ON witness_aliases(child_device_id, valid_from_ms, valid_to_ms);
CREATE INDEX IF NOT EXISTS idx_witness_alias_expiry
  ON witness_aliases(expires_at);

CREATE TABLE IF NOT EXISTS witness_sightings (
  record_id TEXT PRIMARY KEY,
  alias TEXT NOT NULL,
  witness_device_id TEXT NOT NULL,
  child_device_id TEXT,
  observed_wall_ms INTEGER NOT NULL,
  witness_latitude REAL NOT NULL,
  witness_longitude REAL NOT NULL,
  witness_accuracy_m REAL NOT NULL,
  rssi INTEGER,
  tx_power INTEGER,
  proximity_allowance_m REAL NOT NULL,
  uncertainty_m REAL NOT NULL,
  authorised INTEGER NOT NULL DEFAULT 0,
  received_at INTEGER NOT NULL,
  FOREIGN KEY(witness_device_id) REFERENCES devices(id) ON DELETE CASCADE,
  FOREIGN KEY(child_device_id) REFERENCES devices(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_witness_sightings_alias_time
  ON witness_sightings(alias, observed_wall_ms DESC);
CREATE INDEX IF NOT EXISTS idx_witness_sightings_child_time
  ON witness_sightings(child_device_id, authorised, observed_wall_ms DESC);
CREATE INDEX IF NOT EXISTS idx_witness_sightings_unresolved
  ON witness_sightings(authorised, child_device_id, received_at);

CREATE TABLE IF NOT EXISTS ground_sightings (
  receiver_id TEXT NOT NULL,
  sighting_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  child_device_id TEXT NOT NULL,
  observed_wall_ms INTEGER NOT NULL,
  receiver_latitude REAL NOT NULL,
  receiver_longitude REAL NOT NULL,
  receiver_radius_m REAL NOT NULL,
  rssi INTEGER,
  proximity_allowance_m REAL NOT NULL,
  uncertainty_m REAL NOT NULL,
  payload_sha256 TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  PRIMARY KEY(receiver_id, sighting_id),
  FOREIGN KEY(receiver_id) REFERENCES ground_receivers(id) ON DELETE CASCADE,
  FOREIGN KEY(child_device_id) REFERENCES devices(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ground_sightings_child_time
  ON ground_sightings(child_device_id, observed_wall_ms DESC);

CREATE TABLE IF NOT EXISTS learned_place_models (
  device_id TEXT NOT NULL,
  geofence_id TEXT NOT NULL,
  model_version INTEGER NOT NULL DEFAULT 1,
  trusted_visits INTEGER NOT NULL DEFAULT 0,
  last_trusted_visit_ms INTEGER,
  last_match_ms INTEGER,
  state TEXT NOT NULL DEFAULT 'learning',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(device_id, geofence_id),
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE,
  FOREIGN KEY(geofence_id) REFERENCES geofences(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS phase5_refined_intervals (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  from_ms INTEGER NOT NULL,
  to_ms INTEGER NOT NULL,
  model_version TEXT NOT NULL,
  source_r2_key TEXT,
  refined_r2_key TEXT,
  created_at INTEGER NOT NULL,
  CHECK(to_ms >= from_ms),
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_phase5_refined_device_time
  ON phase5_refined_intervals(device_id, from_ms, to_ms);
