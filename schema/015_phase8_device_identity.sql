-- Phase 8 device identity hardening.
-- Revoked device rows are intentionally retained, so this unique index makes the P-256 SPKI a
-- permanent enrollment identity. Pairing canonicalizes SPKI Base64 before lookup/insert.
-- If historical duplicate keys exist, this migration MUST fail rather than silently select one.
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_public_key_spki_unique
ON devices(public_key_spki_b64);
