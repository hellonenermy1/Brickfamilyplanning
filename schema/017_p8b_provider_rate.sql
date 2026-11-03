PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS provider_rate_window (
  provider TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 0),
  updated_at INTEGER NOT NULL
);
