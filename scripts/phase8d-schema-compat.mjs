/**
 * Phase 8D: never re-run SQLite ADD COLUMN statements on an already-upgraded D1.
 * Applies only the five explicitly audited ALTER statements from schema/016.
 * All CREATE TABLE / CREATE INDEX statements remain in the original migration.
 * This is a pure transformation; actual deployed D1 remains untouched by tests.
 */
export const P8B_LOCATION_CONTROL_COLUMNS = Object.freeze([
  ["command_status", "TEXT NOT NULL DEFAULT 'pending'"],
  ["completed_at", "INTEGER"],
  ["result_actual_enabled", "INTEGER CHECK (result_actual_enabled IS NULL OR result_actual_enabled IN (0,1))"],
  ["result_success", "INTEGER CHECK (result_success IS NULL OR result_success IN (0,1))"],
  ["result_reason", "TEXT"]
]);

export function stripHandledLocationControlAlters(source) {
  if (typeof source !== "string" || !source.includes("CREATE TABLE IF NOT EXISTS device_live_track_control")) {
    throw new Error("P8B schema 016 does not match its audited migration contract");
  }
  const pattern = /^\s*ALTER TABLE device_location_control ADD COLUMN ([a-z_]+) ([^;\n]+);\s*$/gm;
  const found = [];
  const rest = source.replace(pattern, (_full, name, def) => {
    const expected = P8B_LOCATION_CONTROL_COLUMNS.find(([column]) => column === name);
    if (!expected) throw new Error("Unexpected migration 016 column: " + name);
    const normalize = s => s.replace(/\s+/g, " ").trim().toUpperCase();
    if (normalize(def) !== normalize(expected[1])) throw new Error("Migration 016 column definition drift: " + name);
    if (found.includes(name)) throw new Error("Duplicate migration 016 column: " + name);
    found.push(name);
    return "\n";
  });
  if (found.length !== P8B_LOCATION_CONTROL_COLUMNS.length) throw new Error("Missing migration 016 ALTERs: "+found.length);
  for (const [name] of P8B_LOCATION_CONTROL_COLUMNS) if (!found.includes(name)) throw new Error("Missing migration 016 column: "+name);
  if (/\bALTER TABLE\b/i.test(rest)) throw new Error("Unreviewed remaining ALTER in migration 016");
  return rest;
}
