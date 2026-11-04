# Brick V1 Phase 8C — continuation checkpoint B (2026-11-04, Singapore)

**Verdict:** INCOMPLETE — not Phase 8C PASS; no advancement to Phase 8D.
**Repository/branch:** `hellonenermy1/Brickfamilyplanning` / `v1-p8c-android-deep-audit`.
**Latest Android production source change:** `0bd66aea88857c934f3bcd2fe5c3412ddc6f2746`.
**Latest test-fixture change at checkpoint:** `7b6cdb6156ece073be8098ae1803f1be6ef81676`. Confirm branch head/status before relying on this document.
**Original PDF contract:** `Brick V1 Phase 8 Full Audit Execution Plan`, sections 8C.1–8C.20 and 8C exit: no P0/P1 Android finding, no unexplained lifecycle/safety path and no unknown persistent-data path. OPPO-only checks are separately marked Phase 9 physical verification.

## Independently observed passing evidence

- Android 15 `emulator-torture` [run 41756138352](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41756138352), job `126332578862`, succeeded: **103 tests in 28 classes**, including `Phase8ShizukuDeprovisionFenceInstrumentedTest` and direct hung `capabilities()` `Phase8ShizukuHungCapabilityInstrumentedTest`. This run precedes the later `0bd66ae` production code fix, so is not the last source-build verification.
- A signed release was successfully **compiled** in workflow [41755385816](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41755385816) with the original 5 added repository secrets. Gradle `:app:assembleRelease` SUCCESS; the subsequent APK manifest inspection check failed. Secrets are no longer the blocker.
- [41755937330](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41755937330) demonstrated AAPT2 compiled manifest `allowBackup=false` and `usesCleartextTraffic=false`. The verifier had incorrectly expected an alternate AAPT2 rendering and was corrected in `abf47133`. Signature still not independently verified.
- Android deep-audit [41756272480](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41756272480) passed compile, unit tests, lint and the 105-file persistence scanner after its false-positive fix; **failed only the strict manifest export allowlist**, which had omitted three permission-protected AndroidX components. Updated to explicitly verify all eight exports with exact permissions in `93ce892d` and corrected WorkManager diagnostic `enabled=true` expectation in `82f0e98a`. Post-fix run not yet retrieved.

## This continuation's source repairs and new tests

1. **P8C-008 late Shizuku binder callback purge race.** Found/recorded at `audit/phase8c/PHASE8C_POSTPURGE_SHIZUKU_CALLBACK_RACE_2026-11-04.md`, fixed permanent in-process callback/preference fence in `ShizukuPrivilegedBridge.kt` and `DeprovisionManager.kt` (incl. `8ff85d0`, `c7293ab`, `97e365a`, compile correction `7076f899`). Specific delayed callback instrumented test passed in 103-test run. This is partial P8C-008 closure only; other asynchronous writers remain to audit.
2. **P8C-008 stale successful privileged reply.** Newly recorded *before fix* at `PHASE8C_P8C008_STALE_PRIVILEGED_REPLY_2026-11-04.md`. `remote()` could return a prior generation's success after shutdown, allowing `wifi/ble/cell` `AtlasPrivacyId.reduce` to recreate Keystore alias. Fixed at `0bd66aea`: stale-success becomes failure; privacy reductions are serialized against permanent deprovision fence. Added held fake-binder instrumentation `Phase8ShizukuStaleReplyAfterPurgeInstrumentedTest`, updated fixture `197096b`, registered in Android 15 suite. **New test passing result not retrieved**.
3. **P8C-013 cold-start corruption scenario.** Added `Phase8CorruptStageColdStartSeedInstrumentedTest` (`fda81e09`) and explicit `adb force-stop` + process relaunch + non-recreated-file assertions in `v1-phase8c-emulator-torture.yml` (`3b278ec5`). In-process six malformed/wrong-type cases passed previously; **new actual process-restart test outcome pending**.
4. **P8C-003 real Device Owner Wi-Fi.** Added `Phase8Api29WifiDeviceOwnerInstrumentedTest` (`35666b59`) and API29 real Device Owner workflow test before the original successful auto-time reversal case (`ec7fe244`). Requires actual Android observed state and durable `completed` result, not command acceptance. **Post-change API29 result pending**.
5. **8C.18 resource workload.** Fixed a silent CPU=0 fallback and fragile APK XML decoder, added 1,000-record instrumentation seed to replace a broadcast ANR (workflow `71717fb`). New run [41756635835](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41756635835) reproduced **1,002 pending records**: exact 1,000 inserted fixture rows plus 2 independent normal runtime rows. Original test falsely demanded an app-wide total of exactly 1,000; corrected fixture test at `7b6cdb615` to independently assert the exact 1,000 rows by `epoch=808` and sequence while permitting extra real runtime records. **Full three-minute resource measurement and thresholds not yet verified**.
6. **8C.1/2 APK verification.** The original signed build passed; switched from fragile `apkanalyzer manifest print` XML parsing to AAPT2 packaged binary-manifest verification, then corrected AAPT2 boolean extraction to require explicit false and absence of debug/test harness. Signed APK cert must still match pinned fingerprint `bfdeb49714fea714536c47f8126deed700f00b2dd113c5c0d452992d7ed5f790` before accepting. No private material committed.

## Required closure before 8C PASS

- Retrieve **latest exact-source** signed APK workflow status, signing cert, APK SHA-256 and actual packaged manifest; if failed, inspect job logs and fix.
- Retrieve **latest exact-source** deep audit, 28+ class emulator tests (including stale reply and cold start), API29 real Wi-Fi and resource-budget workflows; inspect raw failed steps and measurement artifact.
- Run/close P8C-002 service-level repeated rejected callback/reacquisition and P8C-003 original real-state transition, and settle P8C-005 persistence sweep and P8C-008 in-flight writer shutdown/queue races. Keep newly found gaps open until exercise, not just source-fix.
- Reconcile every P1 against its original reproduction, correction SHA, retest evidence and regression matrix; only then record `FIXED -> RETESTED -> VERIFIED CLOSED`. The original findings files remain immutable.
- Do not overclaim physical OPPO GNSS/RF/battery/ColorOS: explicitly `IMPLEMENTED — DEVICE VERIFICATION PENDING` for Phase 9.

**Do not mark done merely because 103 prior tests passed.** This checkpoint intentionally distinguishes historical green runs from the newest code and test cases.
