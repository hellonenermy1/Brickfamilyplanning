-- Phase 5B no-R2 storage backend.
-- Stores compressed history chunks and the private PMTiles archive in D1 so Brick can run on Workers Free without enabling R2.

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

CREATE TABLE IF NOT EXISTS map_manifest (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  total_bytes INTEGER NOT NULL,
  chunk_bytes INTEGER NOT NULL,
  chunk_count INTEGER NOT NULL,
  sha256_hex TEXT NOT NULL,
  metadata_json TEXT,
  installed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS map_chunks (
  chunk_index INTEGER PRIMARY KEY,
  body BLOB NOT NULL,
  byte_length INTEGER NOT NULL,
  sha256_hex TEXT NOT NULL
);
