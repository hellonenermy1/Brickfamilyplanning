CREATE TABLE IF NOT EXISTS pairing_pin_sessions (
  id TEXT PRIMARY KEY,
  pin_hash TEXT NOT NULL UNIQUE,
  device_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  claimed_at INTEGER,
  pending_public_key_spki_b64 TEXT,
  claim_secret_hash TEXT,
  confirmed_at INTEGER,
  device_id TEXT,
  cancelled_at INTEGER,
  CHECK (length(id) BETWEEN 8 AND 64),
  CHECK (length(device_name) BETWEEN 1 AND 64),
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_pairing_pin_active_hash
  ON pairing_pin_sessions(pin_hash, expires_at, claimed_at, confirmed_at, cancelled_at);
CREATE INDEX IF NOT EXISTS idx_pairing_pin_parent_status
  ON pairing_pin_sessions(created_at DESC, expires_at);
