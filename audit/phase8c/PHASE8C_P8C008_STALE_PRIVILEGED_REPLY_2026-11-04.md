# Phase 8C — P8C-008 stale privileged reply after purge (before fix)

**Date:** 2026-11-04. **State:** OPEN P1, source-reachable; reproduction/test pending.
**Related:** DEPROV-001, DEPROV-004/005, SHZ-001/003, Phase 8C.14, 8C.19.

## Concrete source-level gap

In `app/src/main/java/com/brick/safety/privileged/ShizukuPrivilegedBridge.kt` the `remote()` helper captures `service` and `serviceGeneration`, executes a binder call, then returns `Result.success` **even if** `serviceGeneration` changed or the controller was permanently shut down while that call was in progress. The generation comparison only controls whether `lastError` is cleared.

A pending `wifi()/ble()/cell()` caller uses `.mapCatching` on the successful result, running `AtlasPrivacyId.reduce(...)`. That function accesses a Brick Android Keystore key. A call that started before `PURGE_BRICK` could finish after the purge and recreate the privacy identity, violating the uninstall-only state. This is a failure mode inferred from production control flow, not observed on a family phone.

## Correction criteria

1. `remote()` must return an explicit **failure** if a successful response belongs to an old service generation or follows the permanent deprovision fence. Never allow a stale successful value into consumers.
2. The failure path must not schedule a new privileged bind during/after deprovision.
3. Instrument the real `ShizukuBridgeController.wifi()` path with a held fake Binder reply, activate the permanent purge fence, then release it. Require failure and absence of a freshly created `brick_atlas_hmac_v1` Keystore alias or preference.
4. Re-run the entire Android emulator suite and full deep-audit CI.

## Closure

P8C-008 remains OPEN regardless of a source patch until this and the independent service/provider writer races pass their original reproductions.
