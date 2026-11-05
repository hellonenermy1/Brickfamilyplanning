// Shared by the actual beta provisioner and its native post-provisioning fixtures.
export const BETA_COMPAT_COLUMNS = {
 devices:[['last_health_at','INTEGER'],['health_status',"TEXT NOT NULL DEFAULT 'unknown'"],['recovery_count','INTEGER NOT NULL DEFAULT 0'],['pending_records','INTEGER NOT NULL DEFAULT 0'],['app_version','TEXT']],
 geofence_state:[['last_epoch','INTEGER NOT NULL DEFAULT 0'],['last_sequence','INTEGER NOT NULL DEFAULT 0']],
 trips:[['destination_radius_m','REAL NOT NULL DEFAULT 120'],['arrival_candidate_since','INTEGER'],['arrival_candidate_count','INTEGER NOT NULL DEFAULT 0'],['last_alert_at','INTEGER'],['stationary_since','INTEGER'],['last_stop_alert_at','INTEGER'],['last_eval_epoch','INTEGER NOT NULL DEFAULT 0'],['last_eval_sequence','INTEGER NOT NULL DEFAULT 0'],['last_distance_to_destination_m','REAL'],['last_location_at','INTEGER']]
};
