-- Card-free bounded watchdog eligibility and device-scoped due-alert seeks.
CREATE INDEX IF NOT EXISTS idx_watchdog_active_devices ON devices(revoked_at,id);
CREATE INDEX IF NOT EXISTS idx_watchdog_due_incidents ON health_incidents(device_id,ended_at,alerted_at,started_at,id);
