-- Phase 2 parent-owned passphrase rotation.
-- Exactly one salted PBKDF2 verifier may supersede the bootstrap Worker secret.
-- No plaintext parent secret, session cookie, or Android/device data is stored here.
CREATE TABLE IF NOT EXISTS dev_parent_credentials (
  id TEXT PRIMARY KEY NOT NULL CHECK (id = 'primary'),
  verifier TEXT NOT NULL CHECK (length(verifier) BETWEEN 80 AND 256),
  rotated_at INTEGER NOT NULL CHECK (rotated_at > 0)
);
