-- Phase 5B no-R2 private map storage.
-- Applied to the separate brick-family-v1-map D1 database.

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
