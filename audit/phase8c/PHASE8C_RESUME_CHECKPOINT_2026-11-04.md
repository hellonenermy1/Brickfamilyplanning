# Brick V1 — Phase 8C Resume Checkpoint, 2026-11-04

**Do not infer PASS from this checkpoint.** It exists so a future audit session can restart precisely without conversation memory.

## Frozen identities

- **Repository:** `hellonenermy1/Brickfamilyplanning`.
- **Audit branch at this checkpoint:** `v1-p8c-android-deep-audit`.
- **Checkpoint audit commit:** `aa1a2d5d2dbe2d9808d5a7ab3e1d7b6f07c8d12c` (before writing this checkpoint).
- **Accepted 8B baseline:** `204a141e90c078b6c2008778bd6c01bcbb8a4622`.
- **Original 8C tested source freeze:** `967e5d5ceb7e485af997eb0f6380e9544cd39e79`.
- **NEW Android production source freeze after 2026-11-04 repairs:** `4300764ca265e1fbdb5558a5c93e38a080bee588`. Git compare verified **no later `app/src/main` changes** as of pre-checkpoint branch HEAD `aa1a2d5...`.
- **Android package:** `com.brick.safety`, versionCode 10, versionName `1.0.0-rc.1`.
- **Permanent public signing cert SHA-256:** `BF:DE:B4:97:14:FE:A7:14:53:6C:47:F8:12:6D:EE:D7:00:F0:0B:2D:D1:13:C5:C0:D4:52:99:2D:7E:D5:F7:90`. Reuse original permanent RSA-4096 signing identity; **never regenerate it just to pass CI**.

## Contract source and traceability

Authority: user-supplied 76-page `Brick V1 — Phase 8A–8F Ruthless Full Audit Execution Plan`; exact Phase 8C.1–8C.20.

- 8A and 8B are user-accepted **DONE/PASS**, not reopened.
- The original 146-page product acceptance PDF was recovered from the user Library and verified with SHA-256 `863218723ba49c93a72d4e5e59854425ac1bf32dbebeeae15bca08db96ea6f5e`.
- `PHASE8C_RECOVERED_525_REQUIREMENTS.csv` preserves **525 unique approved current requirements**, derived from 469 baseline checklist IDs - 3 superseded + 59 additions, with 14 baseline text amendments. Categories: 485 mandatory / 24 forbidden / 14 optional-if-supported / 2 future-interface.
- The recovered file is a **current-text source index**; do not imply it is byte-identical to 8A's original normalized full owner/dependency/evidence ledger. Exact original 8A ledger hash `8683b85f8b61aa3769b338048e7deb17d1fff3bc7773b6d454c7a61bce013bbd` has not been recovered.
- P8C-012 proper requirement IDs: `SHZ-003` primary, `SHZ-017`, `SHZ-018`, `SHZ-001` dependencies.
- Corrected P8C-010: `MAINT-004` (truthful state), `MAINT-007` (diagnostic privacy); earlier `MAINT-003/006` association was incorrect for this bug.
- Corrected P8C-011 Wi-Fi deferral: `WIFICTL-007`; earlier `WIFICTL-004` governs child Wi-Fi overrides.

## Verified historical CI results (pre-2026-11-04 source corrections)

- Android 15 emulator: run `41670141287`, job `126036000428`, **SUCCESS**, **95 tests in 25 suites**; Android source freeze `967e5d5...`.
- Android 10 Device Owner policy apply/reverse: run `41665283987`, job `126018817998`, **SUCCESS**.
- Android privacy/log source audit: run `41669979913`, job `126035434911`, **SUCCESS**.
- These are **not proofs that the corrected Android source `4300764c...` passed**.

## Signed-APK blocker

A retry of signed RC GitHub run `41668964798` on 2026-11-04 generated job `126300377794`, which **FAILED before build** because `BRICK_ANDROID_KEYSTORE_B64` and `BRICK_ANDROID_SIGNING_CERT_SHA256` were empty, consistent with missing permanent signing Actions secrets.

Repository owner must restore the five *existing* GitHub Actions secrets from the separately stored encrypted signing recovery kit:
`BRICK_ANDROID_KEYSTORE_B64`, `BRICK_ANDROID_KEYSTORE_PASSWORD`, `BRICK_ANDROID_KEY_ALIAS`, `BRICK_ANDROID_KEY_PASSWORD`, `BRICK_ANDROID_SIGNING_CERT_SHA256`. Enter only through GitHub Settings → Secrets and variables → Actions. Never paste their values in an issue, source file, audit report or chat.

After configuration, build/inspect exact signed current APK; record certificate match, package, release manifest/permissions/R8, APK SHA-256, build SHA and artifact provenance.

## 2026-11-04 changes — implementation and guards

**Finding P8C-013**, P1, was recorded **before remediation** in `PHASE8C_FINDINGS_ADDENDUM_5.md`: malformed `brick_deprovision_v1.stage` could become `Stage.NONE`, fail open through `isPostPurge` and reinitialize sensitive stores. Source correction:
- `DeprovisionManager.kt`: `Stage.INVALID`, explicit durable origin marker `deprovisionEverStarted`, conservative known-stage validation and fail-closed checks; implementation commits `74bb63c5` then `4300764c`.
- `DiagnosticsActivity.kt`: honest recovery-required UI, no false purge success and disabled unsafe uninstall while invalid; `9ccf0913`.
- `Phase8DeprovisionStageIntegrityInstrumentedTest.kt` has **6** regression scenarios, registered in Android 15 workflow, and a CI static contract.
- **Status: SOURCE FIXED, TEST RESULT NOT VERIFIED, P1 STILL OPEN**.
- Limitation: a fully erased sole deprovision state store remains indistinguishable from a never-installed state without a separate durable anchor. Record explicitly; no fabricated absolute fail-closed guarantee.

**Finding P8C-005**, P1, persistence-inventory gaps discovered **before remediation** and recorded in `PHASE8C_PERSISTENCE_INVENTORY_SWEEP_2026-11-04.md`:
- `BleAnchorEngine.kt` stores `brick_ble_anchors`, previously missed by production purge; now included.
- `android.util.AtomicFile` uses `.new` and legacy `.bak` files, previously missed by purge for `brick_phase3_state.bin`, `brick_atlas_v1.bin` and `brick_learned_places_v1.bin`. Production purge now verifies base/new/bak absence; code commit `0f2c9ec6`.
- `Phase8PurgeInventoryInstrumentedTest` now seeds/inspects **18 known Brick preferences**, five SQLite databases, three base files and six AtomicFile sidecars, four Keystore aliases; test cleanup covers sidecars.
- New `tools/audit_brick_persistence.py` scans **all production Kotlin/Java files on CI** and fails if discovered Brick persistent names are absent from registered purge; new source/CI checks are in `.github/workflows/v1-phase8c-android-deep-audit-ci.yml`.
- A separate manual GitHub comparison scan inspected 105 changed Kotlin/Java production files and identified these gaps; it does not prove unmodified/transitive/platform library storage absence.
- **Status: SOURCE FIXED, TEST RESULT NOT VERIFIED / COMPLETENESS OPEN, P1 STILL OPEN**.

## Historical finding disposition

Original findings P8C-001 through P8C-012 are preserved, not silently overwritten. The only explicitly **VERIFIED CLOSED** finding in the original retest ledger remains **P8C-009**. At least these are not formally closed: **P8C-001–008, P8C-010–013**, including **10 P1** and **2 P2** findings currently lacking complete closure records (some have source/emulator evidence, others partial). No P0 has been documented by this session; this is not proof the entire audit has zero undiscovered P0.

Retest gaps:
- P8C-002 repeated rejected FLP callbacks must exercise the actual service supervisor/reacquisition, not only PositionEngine.
- P8C-003 actual delayed Wi-Fi state change confirmation, not only a zero-timeout helper.
- P8C-005 complete persistence inventory, AtomicFile/BLE test results and race-free cleanup.
- P8C-008 asynchronous service/provider callback and in-flight write during purge, rather than entry-point-only test.
- P8C-012 hung `capabilities()` Binder probe and replacement Shizuku generation, not only synthetic executor lane.
- P8C-013 exact corrupt-stage original reproduction and six regressions on the new source freeze.

## Resource evidence

`.github/workflows/v1-phase8-android-resource-budget.yml` trigger includes the 8C branch and measures synthetic 1000-row sustained failure for CPU/RSS/storage/retry/alarms and release harness exclusion. **A completed recent run/job/metric artifact has not been independently obtained**. `PHASE8C_RESOURCE_REPORT.md` lists explicit guardrails and physical OPPO/ColorOS boundaries. No resource PASS claim.

## Exact restart procedure

1. Read uploaded Phase 8 audit PDF (8C pages 31–43), `PHASE8C_RECOVERED_525_REQUIREMENTS.csv`, `PHASE8C_EXECUTION_MATRIX_2026-11-04.md`, all `PHASE8C_FINDINGS*.md`, `PHASE8C_RETEST_EVIDENCE.md`, `PHASE8C_RETEST_RECONCILIATION_2026-11-04.md`, `PHASE8C_PERSISTENCE_INVENTORY_SWEEP_2026-11-04.md` and `PHASE8C_RESOURCE_REPORT.md`.
2. Freeze current audit branch HEAD and compare against production source SHA `4300764c...`. Never cite earlier test logs as validation of new code.
3. Retrieve new Android deep-audit CI, emulator, resource and privacy workflow **job IDs, logs and artifacts**; if inaccessible, mark **UNVERIFIED**. Repair any failed tests/source checks.
4. Run original finding reproductions plus regression tests; record fix SHA/test name/retest SHA for each. Keep P0/P1 **open** until actually closed.
5. Require full persistent-data and safety-event path coverage; no unknown deprovision/lifecycle states.
6. After GitHub Actions secrets are configured, run the signed-RC evidence workflow and inspect the exact signed APK.
7. Reconcile PDF 8C.1–8C.20 and all Android-owned requirement IDs, then close only if no P0/P1, no unknown lifecycle/safety/persistent-data path, signed artifact and resource gates actually verified. Move real OPPO-only testing to Phase 9 as `IMPLEMENTED — DEVICE VERIFICATION PENDING`.
8. Only after strict 8C PASS should Phase 8D begin.

**As of 2026-11-04: PHASE 8C INCOMPLETE — NOT PASS, RELEASE BLOCKED.**
