-- Card-free bounded oldest-first cleanup and object-reference guards only.
CREATE INDEX IF NOT EXISTS idx_p5_frames_retention ON phase5_hypothesis_frames(created_at,device_id,record_id);
CREATE INDEX IF NOT EXISTS idx_p5_frames_object ON phase5_hypothesis_frames(r2_key);
CREATE INDEX IF NOT EXISTS idx_p5_runs_retention ON phase5_refined_intervals(to_ms,id);
CREATE INDEX IF NOT EXISTS idx_p5_runs_object ON phase5_refined_intervals(refined_r2_key);
CREATE INDEX IF NOT EXISTS idx_p5_endpoints_retention ON phase5_precise_endpoints(created_at);
CREATE INDEX IF NOT EXISTS idx_safety_global_retention ON safety_events(server_created_at);
CREATE INDEX IF NOT EXISTS idx_pairing_expiry ON pairing_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_events_global_retention ON device_events(created_at);
CREATE INDEX IF NOT EXISTS idx_crashes_retention ON crash_reports(received_at);
CREATE INDEX IF NOT EXISTS idx_health_retention ON device_health_samples(received_at);
CREATE INDEX IF NOT EXISTS idx_incident_retention ON health_incidents(ended_at);
CREATE INDEX IF NOT EXISTS idx_dev_parent_revoked ON dev_parent_sessions(revoked_at);
