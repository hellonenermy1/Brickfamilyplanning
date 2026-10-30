-- Phase 5B no-R2 history/object storage backend.
-- Compressed history chunks stay in the main Brick D1 database.

CREATE TABLE IF NOT EXISTS blob_objects (
  namespace TEXT NOT NULL,
  object_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  content_type TEXT,
  content_encoding TEXT,
  metadata_json TEXT,
  byte_length INTEGER NOT NULL,
  body BLOB NOT NULL,
  PRIMARY KEY(namespace, object_key)
);

CREATE INDEX IF NOT EXISTS idx_blob_objects_expiry
  ON blob_objects(namespace, expires_at);

CREATE INDEX IF NOT EXISTS idx_blob_objects_prefix
  ON blob_objects(namespace, object_key);
