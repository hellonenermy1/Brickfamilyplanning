CREATE TABLE IF NOT EXISTS safety_events (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  device_created_at INTEGER NOT NULL,
  server_created_at INTEGER NOT NULL,
  latitude REAL,
  longitude REAL,
  accuracy_m REAL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(device_id) REFERENCES devices(id)
);
CREATE INDEX IF NOT EXISTS idx_safety_events_device_time ON safety_events(device_id, server_created_at DESC);
CREATE INDEX IF NOT EXISTS idx_safety_events_kind_time ON safety_events(kind, server_created_at DESC);

CREATE TABLE IF NOT EXISTS geofences (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  radius_m REAL NOT NULL CHECK(radius_m >= 25 AND radius_m <= 5000),
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(device_id) REFERENCES devices(id)
);
CREATE INDEX IF NOT EXISTS idx_geofences_device ON geofences(device_id, enabled);

CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  state TEXT NOT NULL,
  destination_name TEXT,
  destination_latitude REAL,
  destination_longitude REAL,
  expected_arrival_at INTEGER,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  FOREIGN KEY(device_id) REFERENCES devices(id)
);
CREATE INDEX IF NOT EXISTS idx_trips_device_state ON trips(device_id, state, started_at DESC);
