export type LiveStateOrder = { epoch: number; sequence: number; wallTimeMs?: number };

function validWallTime(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/**
 * Epoch/sequence is the device's logical ordering identity, but the parent "latest" state also has
 * a time-truth requirement: a reboot/new epoch must not replace a newer captured position with an
 * older one that arrived late from offline backlog. Legacy callers without wallTimeMs retain the
 * original ordering semantics; production LivePacket states always provide it.
 */
export function shouldAdvanceLiveState(incoming: LiveStateOrder, current: LiveStateOrder | null | undefined): boolean {
  if (!Number.isSafeInteger(incoming.epoch) || incoming.epoch < 0) return false;
  if (!Number.isSafeInteger(incoming.sequence) || incoming.sequence <= 0) return false;
  if (incoming.wallTimeMs !== undefined && !validWallTime(incoming.wallTimeMs)) return false;
  if (!current) return true;

  if (validWallTime(current.wallTimeMs) && validWallTime(incoming.wallTimeMs) && incoming.wallTimeMs! < current.wallTimeMs!) {
    return false;
  }
  if (!Number.isSafeInteger(current.epoch) || !Number.isSafeInteger(current.sequence)) return true;
  return incoming.epoch > current.epoch || (incoming.epoch === current.epoch && incoming.sequence > current.sequence);
}
