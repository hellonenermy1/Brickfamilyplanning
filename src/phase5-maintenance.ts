import { phase5CleanupStatements } from "./phase5-evidence";

export async function cleanupPhase5SemanticIndexes(db: D1Database, now = Date.now()): Promise<void> {
  await db.batch(phase5CleanupStatements(db, now, 500));
}
