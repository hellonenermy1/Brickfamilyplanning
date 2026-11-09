// Staged capability only: never create an HTTP endpoint or install this from env.
// All capture holders (including release) MUST use this same independent guard.
// No automatic clear, TTL, restore import, clock expiry or ownership reset exists.
import type { CaptureFence, HeldCaptureFence } from './cardfree-capture';
type Identity = Pick<CaptureFence, 'sourceSha' | 'resourceSetSha256'>;
type State = { format: 1; identity: Identity; quarantined: boolean };
const KEY = 'brick-capture-outage-quarantine-v1';
const exact = (v: unknown, keys: string[]): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join(',') === [...keys].sort().join(',');
function identity(v: unknown): asserts v is Identity {
  if (!exact(v, ['sourceSha', 'resourceSetSha256']) || typeof v.sourceSha !== 'string' || !/^[a-f0-9]{40}$/.test(v.sourceSha) || typeof v.resourceSetSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(v.resourceSetSha256)) throw Error('CAPTURE_OUTAGE_IDENTITY_INVALID');
}
function valid(v: unknown): asserts v is State {
  if (!exact(v, ['format', 'identity', 'quarantined']) || v.format !== 1 || typeof v.quarantined !== 'boolean') throw Error('CAPTURE_OUTAGE_GUARD_CORRUPT');
  identity(v.identity);
}
const same = (a: Identity, b: Identity) => a.sourceSha === b.sourceSha && a.resourceSetSha256 === b.resourceSetSha256;
export class CaptureOutageQuarantine {
  constructor(private readonly storage: Pick<DurableObjectStorage, 'transaction'>) {}
  async initialize(expected: Identity) {
    identity(expected); expected = { ...expected };
    return this.storage.transaction(async txn => {
      const prior = await txn.get<State>(KEY);
      if (prior !== undefined) { valid(prior); if (!same(prior.identity, expected)) throw Error('CAPTURE_OUTAGE_IDENTITY_MISMATCH'); }
      else await txn.put(KEY, { format: 1, identity: expected, quarantined: false } satisfies State);
      return { initialized: true as const };
    });
  }
  private async access(expected: Identity, poison: boolean) {
    identity(expected); expected = { ...expected };
    return this.storage.transaction(async txn => {
      const state = await txn.get<State>(KEY);
      if (state === undefined) throw Error('CAPTURE_OUTAGE_GUARD_UNINITIALIZED');
      valid(state);
      if (!same(state.identity, expected)) throw Error('CAPTURE_OUTAGE_IDENTITY_MISMATCH');
      if (poison) { state.quarantined = true; await txn.put(KEY, state); }
      else if (state.quarantined) throw Error('CAPTURE_OUTAGE_QUARANTINED');
    });
  }
  async assertClear(expected: Identity) { await this.access(expected, false); }
  async quarantineUrgent(expected: Identity, writerId: string, operation: string) {
    if (!/^[a-f0-9]{32}$/.test(writerId) || !/^[a-z][a-z0-9.-]{0,79}$/.test(operation)) throw Error('CAPTURE_OUTAGE_WRITER_INVALID');
    // Constant storage size. Do not retain device identifiers or operation data.
    await this.access(expected, true);
    return { quarantined: true as const, writerId };
  }
}
type Guard = Pick<CaptureOutageQuarantine, 'assertClear' | 'quarantineUrgent'>;
type Authority = { assertHeld(pin: CaptureFence): Promise<HeldCaptureFence>; release(pin: CaptureFence): Promise<{ released: boolean; generation: string }> };
export function guardedCaptureAuthority(expected: Identity, guard: Guard, authority: Authority) {
  identity(expected); const pinIdentity = Object.freeze({ ...expected });
  const check = async (pin: CaptureFence) => {
    if (!same(pin, pinIdentity)) throw Error('CAPTURE_OUTAGE_IDENTITY_MISMATCH');
    await guard.assertClear(pinIdentity);
  };
  return Object.freeze({
    async assertHeld(pin: CaptureFence) {
      pin = { ...pin }; await check(pin);
      const held = await authority.assertHeld(pin);
      await check(pin); return held;
    },
    async release(pin: CaptureFence) {
      pin = { ...pin };
      // Cleanup must run even when the independent guard is down/poisoned.
      // An invalid guard can NEVER acknowledge a successfully sealed archive.
      let clear = true;
      try { await check(pin); } catch { clear = false; }
      const released = await authority.release(pin);
      await check(pin);
      if (!clear) throw Error('CAPTURE_OUTAGE_RELEASE_UNCERTAIN');
      return released;
    }
  });
}
