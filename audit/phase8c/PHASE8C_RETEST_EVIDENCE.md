# Brick V1 — Phase 8C Retest Evidence

Audit branch: `v1-p8c-android-deep-audit`
Status: IN PROGRESS

This file records retests separately from the original finding records. A source fix is not closure. Findings move to VERIFIED CLOSED only after the original failure mode and relevant regressions have been exercised successfully.

---

## P8C-008 retest — FAILED / REMEDIATION INCOMPLETE

**Requirement IDs:** `DEPROV-001`, `DEPROV-004`, `DEPROV-005`
**Retest scope:** stability of `PURGE_BRICK` while the APK remains installed between PURGE and UNINSTALL.
**Retest source baseline:** Phase 8C branch after the original `BrickApplication` / `DiagnosticsActivity` post-purge gating remediation, before this retest remediation.

### Original invariant

Once deprovision stage is `PURGE_BRICK` or later, Brick must operate as a minimal uninstall-only runtime. No tracking, diagnostics, recovery, activity state, companion state, safety state, evidence state, or other Brick-owned persistence may be recreated before uninstall.

### Retest result

**FAIL.** The original remediation correctly gated `BrickApplication` and the maintenance UI, but did not cover all Android entry points.

Observed source paths that can still execute after `PURGE_BRICK` while the package remains installed:

1. `BootReceiver.onReceive()` handles BOOT_COMPLETED, MY_PACKAGE_REPLACED, TIMEZONE_CHANGED and TIME_SET without checking `DeprovisionManager.isPostPurge()` first. It can call `DeepOffManager`, `BetaSafety`, `DiagnosticStore`, `WifiScheduleManager`, `ServiceControl` and `RecoveryScheduler`. In a post-purge process, `DiagnosticStore.log(context, ...)` can initialize and recreate `brick_diagnostics.db`.
2. `ActivityReceiver.onReceive()` can write `ActivityState` after a pending Activity Recognition callback.
3. `BrickCompanionLegacyService` / `BrickCompanionAssociationService` can write companion-presence preferences from system presence callbacks.
4. WorkManager cancellation is not an atomic kill boundary for a worker already starting/running. `RecoveryWorker`, `EvidenceUploadWorker`, `CanaryWorker`, `CanaryRetestWorker`, `ScreenTimeWorker`, and `WifiScheduleWorker` do not currently check post-purge state before touching other Brick state. `EvidenceUploadWorker` also retains a `brick` preference handle as instance state.
5. `RecoveryScheduler` scheduling entry points check Deep Off/role/beta state before any post-purge gate, so an unexpected caller can touch/recreate purged stores.
6. `ServiceControl.ensureTracking()` likewise checks role/Deep Off/beta before a post-purge gate.

### Impact

The five-stage deprovision contract is still not stable. A reboot, package/time broadcast, pending system callback, or WorkManager race between PURGE and UNINSTALL can recreate Brick-owned state after the UI already reports purge success.

### Root cause

The first remediation treated post-purge mode as an `Application`/console concern rather than a process-wide lifecycle invariant enforced at every Android entry point that can run independently.

### Required correction

- Add an immediate `DeprovisionManager.isPostPurge()` guard before any other Brick state access in every independently invokable Android entry point.
- Cover manifest receivers/services and WorkManager workers.
- Make recovery/service scheduling APIs refuse work post-purge before consulting role, Deep Off, beta or other stores.
- Keep the post-purge Maintenance/Uninstall UI as the only allowed Brick behavior.
- Add CI/source regression gates for these entry points and, where practical, a restart/broadcast/worker post-purge instrumentation test.

**Retest status:** FAILED — P8C-008 remains OPEN.
**Next action:** remediate all discovered entry points, then rerun this invariant.
