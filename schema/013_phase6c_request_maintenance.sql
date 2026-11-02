-- Phase 6C card-free beta: replace Cloudflare Cron triggers with request-driven maintenance leases.
CREATE TABLE IF NOT EXISTS dev_maintenance_state (
  task TEXT PRIMARY KEY,
  last_run_at INTEGER NOT NULL
);
