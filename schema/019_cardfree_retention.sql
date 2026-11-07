-- Card-free D1 only: preserve bounded cleanup by original receipt time.
CREATE INDEX IF NOT EXISTS idx_dev_location_history_created
  ON dev_location_history(created_at);
