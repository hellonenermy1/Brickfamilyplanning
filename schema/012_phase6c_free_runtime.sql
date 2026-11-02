-- Brick Phase 6C development beta: fully card-free runtime compatibility layer.
-- DEVELOPMENT ONLY. Production Phase 6 continues to use R2, Queues and Cloudflare Access.

CREATE TABLE IF NOT EXISTS dev_object_store (
  key TEXT PRIMARY KEY,
  size INTEGER NOT NULL CHECK(size >= 0),
  etag TEXT NOT NULL,
  uploaded_at INTEGER NOT NULL,
  http_metadata_json TEXT NOT NULL DEFAULT '{}',
  custom_metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_dev_object_store_uploaded
  ON dev_object_store(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_dev_object_store_key_uploaded
  ON dev_object_store(key, uploaded_at);

CREATE TABLE IF NOT EXISTS dev_object_chunks (
  key TEXT NOT NULL,
  chunk_index INTEGER NOT NULL CHECK(chunk_index >= 0),
  body BLOB NOT NULL,
  PRIMARY KEY(key, chunk_index),
  FOREIGN KEY(key) REFERENCES dev_object_store(key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dev_object_chunks_key
  ON dev_object_chunks(key, chunk_index);

-- One-time bootstrap links are hashed before storage. The plaintext token exists only in the
-- deployment run output long enough for the parent to establish a browser session.
CREATE TABLE IF NOT EXISTS dev_parent_login_tokens (
  token_hash TEXT PRIMARY KEY CHECK(length(token_hash)=64),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  CHECK(expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_dev_parent_login_tokens_expiry
  ON dev_parent_login_tokens(expires_at, consumed_at);

-- Browser session IDs are also stored only as SHA-256 hashes. No password or reusable plaintext
-- credential is stored in D1.
CREATE TABLE IF NOT EXISTS dev_parent_sessions (
  session_hash TEXT PRIMARY KEY CHECK(length(session_hash)=64),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  CHECK(expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_dev_parent_sessions_expiry
  ON dev_parent_sessions(expires_at, revoked_at);
