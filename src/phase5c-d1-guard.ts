const TRIP_CHECKPOINT_MS = 60_000;

export function normalizePhase5CSql(query: string): string {
  // d1-r2-compat intentionally preserves the Phase 4 caller's 12-value bind contract.
  // Normalize the internal checkpoint placeholder before it reaches D1 so a runtime-only
  // Wrong number of parameter bindings failure cannot occur.
  return query.replace("?11-last_location_at>=?13", `?11-last_location_at>=${TRIP_CHECKPOINT_MS}`);
}

export function phase5CGuardDatabase(db: D1Database): D1Database {
  return {
    prepare(query: string) { return db.prepare(normalizePhase5CSql(query)); },
    batch<T = unknown>(statements: D1PreparedStatement[]) { return db.batch<T>(statements); },
    exec(query: string) { return db.exec(normalizePhase5CSql(query)); },
    dump() { return db.dump(); }
  } as D1Database;
}
