-- Brick Phase 6C development beta: card-free object storage compatibility layer.
-- This is DEVELOPMENT ONLY. Production Phase 6 continues to use R2.

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
