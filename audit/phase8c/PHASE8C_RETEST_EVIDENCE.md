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
4. WorkManager cancellation is not an atomic kill boundary for a worker already starting/running. `RecoveryWorker`, `EvidenceUploadWorker`, `CanaryWorker`, `CanaryRetestWorker`, `ScreenTimeWorker`, `WifiScheduleWorker`, and the legacy `BetaExpiryWorker` do not currently check post-purge state before touching other Brick state.
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

---

## P8C-005 retest — FAILED / PURGE INVENTORY STILL INCOMPLETE

**Requirement ID:** `DEPROV-001`
**Retest scope:** completeness of the verified local-state purge inventory.

### Retest result

**FAIL.** The earlier correction added several previously omitted stores and began verifying deletion results, but the production source still contains Brick-owned persistent state not represented in `DeprovisionManager`'s purge inventory.

Confirmed omissions from source inspection:

- SharedPreferences `brick_activity` in `ActivityState`.
- SharedPreferences `brick_companion_presence` in `CompanionPresenceStore`.
- SharedPreferences `brick_beta_safety` in `BetaSafety` (legacy/beta state can survive upgrades even though the RC build has `BRICK_BETA=false`).
- Encrypted file `files/brick_learned_places_v1.bin` in `LearnedPlaceRegistry`.
- Android Keystore alias `brick_atlas_hmac_v1` in `AtlasPrivacyId`.

These are concrete omissions; this retest does not claim the list is exhaustive until the persistent-data inventory sweep is complete.

### Impact

`PURGE_BRICK` can report success while Brick-owned activity/companion/beta metadata, learned-place configuration, or a long-lived Atlas privacy HMAC key survives. That violates the purge claim and leaves an unknown persistent-data path, which independently blocks the Phase 8C exit gate.

### Required correction

- Complete the production persistence inventory before finalizing the purge list.
- Add every verified Brick-owned database, SharedPreferences file, internal file and Keystore alias that must not survive deprovision.
- Verify absence after deletion.
- Add a regression contract that ties known persistent-store names/aliases to the purge inventory so a newly added store cannot silently escape deprovision review.

**Retest status:** FAILED — P8C-005 remains OPEN.
**Next action:** finish persistence inventory, remediate the purge list, then rerun purge-completeness checks.

---

## P8C-004 retest — FAILED / MISSING LEDGER STILL FAILS OPEN

**Requirement IDs:** `DEPROV-002`, `DEPROV-003`, `DEEPOFF-001`, `DEEPOFF-005`
**Retest scope:** fail-closed policy provenance when the Policy Ledger is missing rather than malformed.
**Retest source head:** `18f0ee37664f83f96568372410c802e6b3c3718e`.

### Retest result

**FAIL.** Malformed ledger JSON is now rejected, but a completely missing/blank `brick_policy_ledger_v1/records` value is still treated as a valid empty ledger. `PolicyLedger.isValidRaw(null)` returns true, `integrityValid()` therefore passes, `active()` returns an empty list, and `DeprovisionManager.reverseBrickPolicies()` may proceed to Device Owner release with no proof that prior Brick-created policy provenance was not lost.

A missing ledger is materially different from a durably initialized empty ledger. Without an initialization/provenance marker, deletion/loss of the ledger is indistinguishable from “Brick never recorded a policy.”

### Impact

Loss of the entire ledger preference can still turn unknown provenance into an apparently clean state and allow ownership release. This is the same fail-open class as the original finding and blocks closure of P8C-004.

### Required correction

- Distinguish a durably initialized empty ledger from a missing ledger.
- Establish the ledger before the first Device Owner policy mutation.
- During Device Owner release, require both structural validity and proof that the ledger was initialized for this managed lifecycle; missing initialization must fail closed.
- Migrate only states that can be proven safe; do not silently bless a missing ledger on an already-managed device.
- Add regression coverage for malformed JSON, missing ledger, initialized-empty ledger, active entries and normal reversal.

**Retest status:** FAILED — P8C-004 remains OPEN.
**Next action:** add explicit ledger initialization/integrity state and rerun deprovision provenance tests.

---

## P8C-009 retest — VERIFIED CLOSED

**Requirement IDs:** Android 10/API29 policy provenance and deprovision reversal requirements in the `DPM`, `DEEPOFF`, and `DEPROV` families.
**Retest source head:** `bcdffaa58b85299080ab83d49759eab7f769080d`.
**GitHub Actions run:** `41665283987` — `Brick V1 Phase 8C — Android 10 Device Owner Policy Regression`.

### Original invariant

On Android 10/API29, if Brick changes the Device Owner `autoTimeRequired` state, the pre-Brick value must be durably recorded before mutation and restored during the production deprovision path before/through Device Owner release. The API29 branch must not be inferred from Android 11+ behavior.

### Retest executed

A clean Android 10 AOSP emulator was built and booted, Brick was installed and provisioned as the real Device Owner, and `Phase8Api29AutoTimePolicyInstrumentedTest` executed the production path:

1. Establish known pre-Brick `autoTimeRequired=false` state.
2. Initialize the explicit managed-lifecycle Policy Ledger.
3. Run `ManagedPolicy.apply()` and verify Android reports `autoTimeRequired=true`.
4. Verify active provenance records `policy=auto_time_required`, `previousValue=false`, `brickValue=true`, source `base_time_integrity_api29`.
5. Run production deprovision stages `authoriseFreeze` -> `quiesce` -> `undoDeviceManagement`.
6. Verify Device Owner is released, Android reports `autoTimeRequired=false` again, and active policy provenance is empty/reverted.

### Evidence result

Run `41665283987` completed **SUCCESS**. Its job `126018817998` passed Android 10 image/build, clean emulator boot/install, real Device Owner provisioning, the P8C-009 instrumentation test, post-test policy verification, evidence capture, and artifact upload.

**Retest status:** VERIFIED CLOSED — P8C-009 original failure mode was exercised on the required API level and passed.
