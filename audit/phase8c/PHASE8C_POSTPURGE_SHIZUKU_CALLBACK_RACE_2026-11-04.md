# Phase 8C — P8C-008 additional late-Shizuku callback path (before source correction)

**Recorded:** 2026-11-04, before changing `ShizukuPrivilegedBridge.kt`.
**Severity / state:** Existing P8C-008 P1; SOURCE-REACHABLE, UNVERIFIED ON DEVICE.
**Requirement:** DEPROV-001/004/005, SHZ-001/003, Phase 8C.3/8C.14/8C.19.

## Failure mode

`DeprovisionManager.purgeBrick()` calls `ShizukuBridgeController.shutdown()` and then deletes Brick preferences. The pre-correction `shutdown()` unbinds, clears the service and rotates the executor, but keeps `initialized=true`, `foreground` unchanged, and binder/permission callbacks registered. In particular, the original `binderReceived.onBinderReceived()` can subsequently call `maybeRequestPermission()`; that function opens `getSharedPreferences("brick")` and can commit `shizukuPermissionPrompted`. Thus a binder callback delivered after the preference-deletion loop may recreate a sensitive Brick namespace after `PURGE_BRICK`. The old `onServiceConnected()` also accepts late/stale bindings and launches a new capability probe. This was identified by reading production source, **not** by running the exact Binder callback race on a device.

## Minimum correction / retest

- Introduce an explicit permanent in-process deprovision shutdown fence distinct from ordinary recoverable Shizuku shutdown.
- Set fence *before* clearing state/unbinding and refuse stale binder, binding, permission-result, probe and foreground reactivation paths.
- On app restart, enforce durable deprovision provenance before allowing initialization.
- Ensure optional Shizuku never blocks the Brick core and cannot rematerialize `brick` after purge.
- Add automated guard and exercise a delayed callback after the fence (must not touch private preferences). Verify on an emulator before formal closure.

## Caveat

Even if the Shizuku callback is fenced, the whole P8C-008 finding remains OPEN until all in-flight service/provider writes, WorkManager transitions and retained stores are proven quiescent during purge. A source fix is not a completed race retest.
