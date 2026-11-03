export type LiveStateOrder = { epoch: number; sequence: number; wallTimeMs?: number };

function validWallTime(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function logicalAdvance(incoming: LiveStateOrder, current: LiveStateOrder) {
  return incoming.epoch > current.epoch || (incoming.epoch === current.epoch && incoming.sequence > current.sequence);
}

/**
 * The live parent read model answers "what is the newest captured position?", so capture/event time
 * is primary. Epoch/sequence remains the durable logical identity for dedupe and is the tie-breaker
 * when two records have the same capture timestamp. This handles cross-epoch backlog arriving out of
 * order without ever moving the parent's current location backward in event time.
 *
 * Legacy callers without wallTimeMs retain the original logical ordering semantics; production
 * LivePacket states always provide wallTimeMs.
 */
export function shouldAdvanceLiveState(incoming: LiveStateOrder, current: LiveStateOrder | null | undefined): boolean {
  if (!Number.isSafeInteger(incoming.epoch) || incoming.epoch < 0) return false;
  if (!Number.isSafeInteger(incoming.sequence) || incoming.sequence <= 0) return false;
  if (incoming.wallTimeMs !== undefined && !validWallTime(incoming.wallTimeMs)) return false;
  if (!current) return true;

  if (validWallTime(current.wallTimeMs) && validWallTime(incoming.wallTimeMs)) {
    if (incoming.wallTimeMs! > current.wallTimeMs!) return true;
    if (incoming.wallTimeMs! < current.wallTimeMs!) return false;
  }
  if (!Number.isSafeInteger(current.epoch) || !Number.isSafeInteger(current.sequence)) return true;
  return logicalAdvance(incoming, current);
}
