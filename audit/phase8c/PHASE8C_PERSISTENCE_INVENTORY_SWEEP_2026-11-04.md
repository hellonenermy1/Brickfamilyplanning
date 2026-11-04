# Phase 8C — Persistence inventory sweep and P8C-005 retest expansion

**Audit date:** 2026-11-04. **Status:** DEFECT FOUND — RECORD BEFORE CORRECTION.
**Production source under inspection:** Phase 8C branch after P8C-013 fix, prior to this P8C-005 correction.
**Requirements:** `DEPROV-001`, `DEPROV-003`, `PRIV-*` as approved, and PDF sections 8C.9, 8C.15.
**Severity:** **P1 HIGH** under existing finding **P8C-005**; do not count as a separate duplicate finding.

## Inspection method and boundary

Reviewed all **105 Kotlin/Java production paths present in the GitHub compare file list** `main...v1-p8c-android-deep-audit` and extracted `getSharedPreferences`, `SQLiteOpenHelper`, `AtomicFile`, `filesDir` and Keystore references, comparing confirmed persistent names with production `DeprovisionManager.kt` and existing `Phase8PurgeInventoryInstrumentedTest`. This is a significant **changed-file sweep**, **not yet a proof of every unchanged/transitive/library production file**. Unproven completeness must not be called PASS.

## New confirmed omission: BLE anchor configuration

`app/src/main/java/com/brick/safety/location/BleAnchorEngine.kt` defines:
- `private const val PREFS = "brick_ble_anchors"` (line approximately 40);
- `context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(CONFIG_JSON, ...)` stores configured child BLE anchors;
- `getSharedPreferences(PREFS, ...).getString(CONFIG_JSON, ...)` reads them later.

**Actual:** `DeprovisionManager.brickPreferences` has 17 entries but **does not include `brick_ble_anchors`**. `Phase8PurgeInventoryInstrumentedTest` likewise seeds only those 17 entries. This can leave configured BLE proximity/anchor data behind after `PURGE_BRICK`, despite reporting purge success. This is a concrete missed sensitive local-store path (not hypothetical coverage uncertainty).

**Required correction:** include `brick_ble_anchors` in purge inventory and test seed/verification, with a source/CI contract checking this exact name.

## New confirmed omission: AtomicFile sidecar records

Three production stores use Android `android.util.AtomicFile`:
- `Phase3StateStore.kt`: `brick_phase3_state.bin`;
- `AtlasStateStore.kt`: `brick_atlas_v1.bin`;
- `LearnedPlaceRegistry.kt`: `brick_learned_places_v1.bin`.

**Actual:** production `purgeBrick` only deletes `File(filesDir, baseName)`; its tests only seed/check base filenames, ignoring `.new` and legacy `.bak` files. The Android framework's `AtomicFile` keeps distinct base/`.new`/`.bak` paths and its own `delete()` handles all three. Source: `https://android.googlesource.com/platform/frameworks/base/+/HEAD/core/java/android/util/AtomicFile.java` (reviewed 2026-11-04).

An interrupted atomic write can leave `.new` holding encrypted Brick data, and an older backup path `.bak` can exist. Deleting only the base can leave the other files and sensitive content behind.

**Required correction:** delete and verify each base, `.new`, and `.bak` for all three stores; test mixed normal/backup/temp fixtures, including base missing but backup present. Ensure no writer is still active before deletion (existing quiesce/work-drain evidence is necessary but must be checked for every store).

## Existing source inventory confirmed

| Type | Known names |
| --- | --- |
| Brick-owned SQLite | `brick_journal.db`, `brick_safety_outbox.db`, `brick_crash_outbox.db`, `brick_evidence.db`, `brick_diagnostics.db` |
| Existing 17 preferences | `brick`, `brick_position`, `brick_activity`, `brick_companion_presence`, `brick_beta_safety`, `brick_parent_location`, `brick_managed_policy_p8`, `brick_diag_state`, `brick_diag_flags`, `brick_diagnostics`, `brick_policy_ledger_v1`, `brick_deep_off_v1`, `brick_live_track_v1`, `brick_wifi_schedule_v1`, `brick_canary_v1`, `brick_device_role_v1`, `brick_capability_profile_v1` |
| Newly confirmed preference | `brick_ble_anchors` |
| AtomicFile base files | `brick_phase3_state.bin`, `brick_atlas_v1.bin`, `brick_learned_places_v1.bin`, each with possible `.new`/`.bak` |
| Android Keystore | `brick-device-signing-v1`, `brick-journal-aes-v1`, `brick-witness-alias-hmac-v1`, `brick_atlas_hmac_v1` |
| Separate library state | WorkManager and any Android library database/preferences require independent safe cancellation/data cleanup verification; app-owned WorkManager rows are tested but this is not a blanket library purge PASS |
| Intentionally retained | `brick_deprovision_v1` stage/origin marker needed solely for final uninstall handoff; corruption must fail closed per P8C-013 |

## Acceptance / retest

Do not close P8C-005 on its original green test. First add fixtures and assertions for `brick_ble_anchors` and each atomic sidecar, then run real production `DeprovisionManager.purgeBrick` and prove absence afterwards. Continue to validate remaining unchanged/config/transitive stores, reboot-between-purge-and-uninstall and process races before closure.

**Finding status:** P8C-005 **OPEN / P1 — new gaps discovered before fix**.
