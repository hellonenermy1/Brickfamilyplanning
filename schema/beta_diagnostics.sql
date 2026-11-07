-- Dedicated BETA_DB only. Never run against Brick's primary DB.
-- Diagnostics are disposable, retained 35 days, excluded from the 38-table safety backup.
CREATE TABLE IF NOT EXISTS beta_requests(nonce TEXT PRIMARY KEY, device_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS beta_latest(device_id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS beta_challenges(device_id TEXT PRIMARY KEY, token TEXT NOT NULL, expires_at INTEGER NOT NULL, queue_at INTEGER, portal_at INTEGER);
CREATE TABLE IF NOT EXISTS beta_runs(device_id TEXT NOT NULL, run_id TEXT NOT NULL, metadata TEXT NOT NULL, readiness TEXT, dropped INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(device_id,run_id));
CREATE TABLE IF NOT EXISTS beta_records(device_id TEXT NOT NULL, run_id TEXT NOT NULL, record_id INTEGER NOT NULL, payload TEXT NOT NULL, received_at INTEGER NOT NULL, PRIMARY KEY(device_id,run_id,record_id));
CREATE TABLE IF NOT EXISTS beta_reviews(device_id TEXT NOT NULL, run_id TEXT NOT NULL, payload TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(device_id,run_id));
CREATE INDEX IF NOT EXISTS beta_records_retention ON beta_records(received_at);
CREATE INDEX IF NOT EXISTS beta_requests_expiry ON beta_requests(expires_at);
CREATE INDEX IF NOT EXISTS beta_records_device_time ON beta_records(device_id,received_at DESC,record_id DESC);
