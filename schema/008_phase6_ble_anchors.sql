ALTER TABLE geofences ADD COLUMN ble_uuid TEXT;
CREATE INDEX IF NOT EXISTS idx_geofences_ble_uuid ON geofences(device_id, ble_uuid) WHERE ble_uuid IS NOT NULL;
