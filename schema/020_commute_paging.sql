-- Card-free derived history scan: stable keyset order; no data deletion/table change.
CREATE INDEX IF NOT EXISTS idx_dev_history_commute_cursor ON dev_location_history(device_id,wall_time_ms,sequence,epoch);
