// Explicit allowlist generated from the audited 001–018 schema; CI verifies schema parity.
export const EXTRA_RESTORE_SPECS = {
  "device_events": {
    "columns": [
      "id",
      "device_id",
      "epoch",
      "sequence",
      "kind",
      "created_at"
    ],
    "required": [
      "id",
      "device_id",
      "epoch",
      "sequence",
      "kind",
      "created_at"
    ]
  },
  "device_health_events": {
    "columns": [
      "id",
      "device_id",
      "status",
      "reason",
      "created_at"
    ],
    "required": [
      "id",
      "device_id",
      "status",
      "reason",
      "created_at"
    ]
  },
  "device_health_samples": {
    "columns": [
      "id",
      "device_id",
      "received_at",
      "service_active",
      "location_enabled",
      "location_subscribed",
      "fine_location_permission",
      "background_location_permission",
      "activity_recognition_permission",
      "battery_optimization_exempt",
      "background_restricted",
      "network",
      "network_validated",
      "power_save_mode",
      "pending_records",
      "pending_safety_events",
      "oldest_pending_age_ms",
      "location_age_ms",
      "ack_age_ms",
      "battery_pct",
      "charging",
      "recovery_count",
      "position_available",
      "health_status",
      "health_reason",
      "app_version"
    ],
    "required": [
      "id",
      "device_id",
      "received_at",
      "service_active",
      "location_enabled",
      "location_subscribed",
      "network",
      "pending_records",
      "recovery_count",
      "position_available",
      "health_status",
      "health_reason"
    ]
  },
  "evidence_batches": {
    "columns": [
      "device_id",
      "batch_id",
      "protocol",
      "record_count",
      "byte_length",
      "payload_sha256",
      "r2_key",
      "received_at"
    ],
    "required": [
      "device_id",
      "batch_id",
      "protocol",
      "record_count",
      "byte_length",
      "payload_sha256",
      "r2_key",
      "received_at"
    ]
  },
  "evidence_records": {
    "columns": [
      "device_id",
      "epoch",
      "sequence",
      "record_id",
      "provider",
      "family",
      "capability",
      "health",
      "quality",
      "independence_group",
      "elapsed_realtime_ms",
      "wall_time_ms",
      "payload_sha256",
      "first_seen_at"
    ],
    "required": [
      "device_id",
      "epoch",
      "sequence",
      "record_id",
      "provider",
      "family",
      "capability",
      "health",
      "quality",
      "independence_group",
      "elapsed_realtime_ms",
      "wall_time_ms",
      "payload_sha256",
      "first_seen_at"
    ]
  },
  "evidence_batch_records": {
    "columns": [
      "device_id",
      "batch_id",
      "record_id",
      "epoch",
      "sequence"
    ],
    "required": [
      "device_id",
      "batch_id",
      "record_id",
      "epoch",
      "sequence"
    ]
  },
  "device_evidence_state": {
    "columns": [
      "device_id",
      "last_epoch",
      "last_sequence",
      "last_received_at"
    ],
    "required": [
      "device_id"
    ]
  },
  "evidence_provider_health": {
    "columns": [
      "device_id",
      "provider",
      "capability",
      "health",
      "reason",
      "last_epoch",
      "last_sequence",
      "observed_wall_ms",
      "received_at"
    ],
    "required": [
      "device_id",
      "provider",
      "capability",
      "health",
      "last_epoch",
      "last_sequence",
      "observed_wall_ms",
      "received_at"
    ]
  },
  "atlas_models": {
    "columns": [
      "device_id",
      "model_key",
      "model_version",
      "state",
      "r2_key",
      "updated_at"
    ],
    "required": [
      "device_id",
      "model_key",
      "updated_at"
    ]
  },
  "witness_authorizations": {
    "columns": [
      "device_id",
      "witness_device_id",
      "enabled",
      "created_at",
      "updated_at"
    ],
    "required": [
      "device_id",
      "witness_device_id",
      "created_at",
      "updated_at"
    ]
  },
  "ground_receivers": {
    "columns": [
      "id",
      "device_id",
      "name",
      "latitude",
      "longitude",
      "radius_m",
      "public_key_spki_b64",
      "enabled",
      "created_at",
      "updated_at"
    ],
    "required": [
      "id",
      "device_id",
      "name",
      "created_at",
      "updated_at"
    ]
  },
  "device_commands": {
    "columns": [
      "id",
      "device_id",
      "command_type",
      "payload_json",
      "created_at",
      "expires_at",
      "status",
      "acknowledged_at",
      "result_json"
    ],
    "required": [
      "id",
      "device_id",
      "command_type",
      "created_at",
      "expires_at"
    ]
  },
  "refined_history_runs": {
    "columns": [
      "id",
      "device_id",
      "from_ms",
      "to_ms",
      "model_version",
      "r2_key",
      "created_at"
    ],
    "required": [
      "id",
      "device_id",
      "from_ms",
      "to_ms",
      "model_version",
      "created_at"
    ]
  },
  "witness_aliases": {
    "columns": [
      "alias",
      "child_device_id",
      "slot",
      "valid_from_ms",
      "valid_to_ms",
      "source_record_id",
      "created_at",
      "expires_at"
    ],
    "required": [
      "alias",
      "child_device_id",
      "slot",
      "valid_from_ms",
      "valid_to_ms",
      "source_record_id",
      "created_at",
      "expires_at"
    ]
  },
  "witness_sightings": {
    "columns": [
      "record_id",
      "alias",
      "witness_device_id",
      "child_device_id",
      "observed_wall_ms",
      "witness_latitude",
      "witness_longitude",
      "witness_accuracy_m",
      "rssi",
      "tx_power",
      "proximity_allowance_m",
      "uncertainty_m",
      "authorised",
      "received_at"
    ],
    "required": [
      "record_id",
      "alias",
      "witness_device_id",
      "observed_wall_ms",
      "witness_latitude",
      "witness_longitude",
      "witness_accuracy_m",
      "proximity_allowance_m",
      "uncertainty_m",
      "received_at"
    ]
  },
  "ground_sightings": {
    "columns": [
      "receiver_id",
      "sighting_id",
      "alias",
      "child_device_id",
      "observed_wall_ms",
      "receiver_latitude",
      "receiver_longitude",
      "receiver_radius_m",
      "rssi",
      "tx_power",
      "proximity_allowance_m",
      "uncertainty_m",
      "resolved",
      "payload_sha256",
      "received_at"
    ],
    "required": [
      "receiver_id",
      "sighting_id",
      "alias",
      "observed_wall_ms",
      "receiver_latitude",
      "receiver_longitude",
      "receiver_radius_m",
      "proximity_allowance_m",
      "uncertainty_m",
      "payload_sha256",
      "received_at"
    ]
  },
  "learned_place_models": {
    "columns": [
      "device_id",
      "geofence_id",
      "model_version",
      "trusted_visits",
      "last_trusted_visit_ms",
      "last_match_ms",
      "state",
      "updated_at"
    ],
    "required": [
      "device_id",
      "geofence_id",
      "updated_at"
    ]
  },
  "phase5_refined_intervals": {
    "columns": [
      "id",
      "device_id",
      "from_ms",
      "to_ms",
      "model_version",
      "source_r2_key",
      "refined_r2_key",
      "created_at"
    ],
    "required": [
      "id",
      "device_id",
      "from_ms",
      "to_ms",
      "model_version",
      "created_at"
    ]
  },
  "phase5_hypothesis_frames": {
    "columns": [
      "device_id",
      "record_id",
      "wall_time_ms",
      "r2_key",
      "created_at",
      "refined_run_id"
    ],
    "required": [
      "device_id",
      "record_id",
      "wall_time_ms",
      "r2_key",
      "created_at"
    ]
  },
  "phase5_precise_endpoints": {
    "columns": [
      "device_id",
      "epoch",
      "sequence",
      "wall_time_ms",
      "latitude",
      "longitude",
      "uncertainty_m",
      "created_at"
    ],
    "required": [
      "device_id",
      "epoch",
      "sequence",
      "wall_time_ms",
      "latitude",
      "longitude",
      "uncertainty_m",
      "created_at"
    ]
  }
} as const;
