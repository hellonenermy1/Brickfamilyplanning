export type LiveStateOrder = { epoch: number; sequence: number };

export function shouldAdvanceLiveState(incoming: LiveStateOrder, current: LiveStateOrder | null | undefined): boolean {
  if (!Number.isSafeInteger(incoming.epoch) || incoming.epoch < 0) return false;
  if (!Number.isSafeInteger(incoming.sequence) || incoming.sequence <= 0) return false;
  if (!current) return true;
  if (!Number.isSafeInteger(current.epoch) || !Number.isSafeInteger(current.sequence)) return true;
  return incoming.epoch > current.epoch || (incoming.epoch === current.epoch && incoming.sequence > current.sequence);
}
