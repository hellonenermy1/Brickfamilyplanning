# Brick V1 — Phase 8C findings addendum 5

**Audit date:** 2026-11-04
**Audit branch:** `v1-p8c-android-deep-audit`
**Android production source identity:** `967e5d5ceb7e485af997eb0f6380e9544cd39e79`.
**Status:** NEW FINDING; **OPEN**. This is not a claim that the failure has been observed on a physical OPPO. It is a concrete source-reachable failure mode requiring an exercised regression.

---

## P8C-013 — Corrupt deprovision-stage metadata can fail open and reactivate the non-purge runtime

**Requirement IDs:** `DEPROV-001`, `DEPROV-004`, `DEPROV-005`, `DEEPOFF-003`, `DEEPOFF-004`; Phase 8C.3, 8C.9 and 8C.15 exit gates.

**Subsystem:** Android post-purge lifecycle / monotonic deprovision stage / local privacy.

**Severity:** **P1 HIGH** — can make an intentionally quiesced/uninstall-only installation execute normal startup after corrupted metadata, recreating stores. It blocks Phase 8C closure until corrected and retested.

**Expected:** An unknown/corrupt stage value must not be treated as evidence that deprovision never happened. An instance that has reached `PURGE_BRICK` or `UNINSTALL` must not silently resume normal initialization when its stage metadata is unreadable. Unknown lifecycle provenance must fail closed and be represented honestly; do not pretend purge is complete if the state is unprovable.

**Actual (source):**
- `app/src/main/java/com/brick/safety/maintenance/DeprovisionManager.kt` defines `stage(context)` as `getString(KEY_STAGE, Stage.NONE.name)` followed by `runCatching { Stage.valueOf(raw ?: Stage.NONE.name) }.getOrDefault(Stage.NONE)`.
- A persisted, non-null **unknown stage string** is therefore interpreted as `Stage.NONE`, not as an invalid/unverified stage.
- `isPostPurge(context)` computes `stage(context).ordinal >= Stage.PURGE_BRICK.ordinal`; with an unknown stage, that becomes false.
- `app/src/main/java/com/brick/safety/BrickApplication.kt` calls `if (DeprovisionManager.isPostPurge(this)) return` and otherwise calls `DiagnosticStore.init(this)` before other startup work. This can recreate `brick_diagnostics.db` after purge.
- `BootReceiver`, `DeepOffManager`, `RecoveryScheduler` and other independently invoked paths similarly rely on `isPostPurge`.
- A corrupted preference of a **wrong stored type** may throw during `getString` before `Stage.valueOf` is reached; the parse catch does not guard that read. This is an additional crash-loop/corruption risk pending fault injection.

**Evidence locations:**
- `DeprovisionManager.kt` `stage`, `isPostPurge`, and monotonic `persist`.
- `BrickApplication.kt` `onCreate` post-purge early return and subsequent diagnostic startup.
- `BootReceiver.kt` `onReceive` post-purge gate.
- `DeepOffManager.kt` `isActive` / `snapshot` / `enter` / `reactivate` / `quiesce`.

**Reproduction to execute before remediation:** In an isolated emulator/test app instance after a correctly performed production `PURGE_BRICK`, deliberately replace the only retained `brick_deprovision_v1.stage` string with a non-enum value such as `invalid-stage-test` while keeping the rest of the purge state unchanged. Kill/restart the app. Observe whether `isPostPurge` returns false and whether `brick_diagnostics.db` or other purged preferences/files are recreated. Separately test a wrong-typed `stage` entry and truncated/corrupt deprovision preferences. Do **not** perform this destructive test on a real family phone.

**Impact:** The source-level guarantee that PURGE_BRICK is an uninstall-only state depends on the stage preference always remaining syntactically valid. Corruption can erase that guard and allow independent components to recreate sensitive/operational local state. This undermines `P8C-008` post-purge permanence and the Phase 8C no-unknown-persistent-data exit rule.

**Root cause:** Malformed lifecycle provenance is conflated with a legitimate fresh `NONE` state. Only normal enum parsing failure is caught; there is no separately represented `CORRUPT / RECOVERY REQUIRED` state or verified fail-closed startup boundary.

**Required correction (design constraints):**
1. Distinguish a truly fresh, absent/uninitialized stage from present-but-invalid/corrupt stage metadata.
2. Ensure all independent startup/scheduler/provider entry points fail closed on present-but-invalid metadata **before** touching Brick persistence.
3. Expose a truthful repair-required status; do not report `PURGE_BRICK` as completed if the stage cannot be authenticated.
4. Do not allow an unknown/corrupt stage to skip policy reversal or masquerade as authorised `UNDO DEVICE MANAGEMENT`, `PURGE_BRICK`, or `UNINSTALL`.
5. Define the limitation of total metadata loss explicitly: a fully deleted sole-state store cannot be distinguished from first install without an independent durable provenance anchor. Any new anchor must respect the approved deprovision/privacy contract.
6. Add instrumentation for unknown enum value, wrong type, process restart, boot callback, post-purge database absence and legitimate first-install `NONE` semantics.
7. Record fix commit, pass the original reproduction and regressions, then mark `FIXED -> RETESTED -> VERIFIED CLOSED`.

**Fix commit:** NOT YET CREATED.  
**Regression test:** NOT YET RUN.  
**Retest evidence:** NOT YET AVAILABLE.  
**Status:** **OPEN / P1**.

**Audit-before-fix discipline:** This finding is recorded before changing the production implementation. No silent remediation or premature closure.
