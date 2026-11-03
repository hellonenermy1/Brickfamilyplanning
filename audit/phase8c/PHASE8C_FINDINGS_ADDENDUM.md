# Brick V1 — Phase 8C Android Deep-Audit Findings Addendum

Baseline implementation SHA: `204a141e90c078b6c2008778bd6c01bcbb8a4622`
Audit branch: `v1-p8c-android-deep-audit`
Status: IN PROGRESS

This file continues the permanent Phase 8C finding sequence. Findings are recorded before remediation.

---

## P8C-007 — Policy Ledger retention can evict still-active provenance

**Requirement ID:** `DEPROV-002`, `DEPROV-003`, `DEEPOFF-001`, `DEEPOFF-005`; related Android persistent-data/provenance exit gate
**Phase:** 8C
**Subsystem:** Maintenance / Policy Ledger retention
**Severity:** P1 HIGH

**Expected:** Brick-created system-policy provenance remains durable for as long as a record is active. Retention/compaction may discard obsolete reverted history, but must never discard a still-active record needed to reverse Brick's own change during Deep Off/deprovision.

**Actual:** `PolicyLedger.record()` appends a record and calls `trim(array)`. `trim()` repeatedly removes index 0 while the array is over `MAX_RECORDS=256`, without checking whether the removed entry is still active. Over a long-lived installation, reverted records and newer records can push an older active record out of the ledger. The resulting JSON remains structurally valid, so `integrityValid()` cannot detect that provenance was lost.

**Evidence:** `app/src/main/java/com/brick/safety/maintenance/PolicyLedger.kt` at the Phase 8C working branch inherited the baseline retention model: `MAX_RECORDS=256`; `trim(array)` removes the oldest row unconditionally; active records are identified only by `revertedAtMs == null`.

**Source file(s):** `PolicyLedger.kt`, `DeprovisionManager.kt`, `DeepOffManager.kt`
**Relevant function(s):** `record`, `trim`, `active`, `reverseBrickPolicies`
**Baseline commit SHA:** `204a141e90c078b6c2008778bd6c01bcbb8a4622`

**Reproduction:** Keep one older policy record active, then generate enough later ledger records to exceed 256 total rows. The unconditional head trim can remove the active record. Later `integrityValid()` can still return true and deprovision no longer knows that policy must be considered.

**Impact:** Brick can lose proof of a Brick-caused device-policy change before Device Owner release. That violates provenance durability and can leave state behind that Brick can no longer safely identify/reverse.

**Root cause:** Retention is row-count-based rather than state-aware; active provenance and historical reverted records share the same unconditional FIFO eviction rule.

**Required correction:** Never evict active records. Compact only reverted history first; if capacity would still be exceeded because active records alone reach the safety limit, fail closed and refuse to create an untracked policy change. Add retention tests proving an old active entry survives heavy reverted-history churn.

**Fix commit:** pending
**Regression test:** pending
**Retest evidence:** pending
**Status:** OPEN

---

## P8C-008 — PURGE BRICK is not stable while the running process can recreate Brick stores

**Requirement ID:** `DEPROV-001`, `DEPROV-004`, `DEPROV-005`; related Android persistent-data exit gate
**Phase:** 8C
**Subsystem:** Maintenance / deprovision lifecycle / local privacy
**Severity:** P1 HIGH

**Expected:** After the PURGE BRICK stage reports success, Brick-owned persistent data remains absent except for the minimal monotonic deprovision state required to reach UNINSTALL. Normal process/application/console code must not recreate purged databases/preferences/files before uninstall.

**Actual:** `DeprovisionManager.purgeBrick()` can delete `brick_diagnostics.db` and other stores and verify them at that instant, but the current process remains alive. `BrickApplication` unconditionally calls `DiagnosticStore.init(this)` before Deep Off/deprovision checks. `DiagnosticsActivity.refreshState()` calls `DiagnosticStore.fullReport()` and `recentEvents()`; its UI refresh path is invoked again after deprovision actions. Those calls can reopen/recreate the diagnostics database after PURGE has already advanced to `PURGE_BRICK`. A later process restart before uninstall can also initialize diagnostics again.

**Evidence:**
- `DeprovisionManager.kt` purges and verifies Brick databases but preserves only the deprovision preference by omission.
- `BrickApplication.kt` initializes `DiagnosticStore` at the start of `onCreate()`.
- `DiagnosticsActivity.kt` refreshes state/timeline via `DiagnosticStore` and calls `refreshState()` after the deprovision action completes.

**Source file(s):** `DeprovisionManager.kt`, `BrickApplication.kt`, `DiagnosticsActivity.kt`, `DiagnosticStore.kt`
**Relevant function(s):** `purgeBrick`, `BrickApplication.onCreate`, `DiagnosticsActivity.refreshState`, deprovision action callback
**Baseline commit SHA:** `204a141e90c078b6c2008778bd6c01bcbb8a4622`

**Reproduction:** Advance deprovision through PURGE BRICK from the Maintenance console. After purge returns success, allow the console refresh path to run or restart the app before pressing UNINSTALL. Diagnostics code can recreate a Brick-owned database after the purge stage was already marked successful.

**Impact:** `PURGE_BRICK` is not a stable lifecycle state and the Android exit gate has an unknown/reappearing persistent-data path. A user who pauses between purge and uninstall can retain newly recreated Brick local data contrary to the purge claim.

**Root cause:** Purge verifies deletion only at one instant; application/maintenance startup and refresh code are not gated by the monotonic deprovision stage.

**Required correction:** Once stage >= `PURGE_BRICK`, enter a minimal deprovision-only runtime: do not initialize/recreate diagnostics, tracking, evidence, learned state, policy/runtime stores, or other Brick persistence. Maintenance UI may expose only the minimal uninstall handoff/status without touching purged stores. Add restart-after-purge and console-refresh-after-purge regression coverage.

**Fix commit:** pending
**Regression test:** pending
**Retest evidence:** pending
**Status:** OPEN

---

## P8C-009 — Android 10 auto-time policy is applied without provenance or a reversal path

**Requirement ID:** `DEPROV-002`, `DEPROV-003`; related Phase 8C.13 Device Owner policy audit and `DEEPOFF-005`
**Phase:** 8C
**Subsystem:** Device Owner / time-integrity policy / deprovisioning
**Severity:** P1 HIGH

**Expected:** Every Brick-created Device Owner policy mutation has durable provenance before mutation and an explicit safe reversal path before Device Owner release. This applies across the supported minSdk range, including Android 10 / API 29.

**Actual:** On API 30+, `ManagedPolicy.applyBasePolicy()` records auto-time and date/time restriction provenance before calling the platform. On API 29, the fallback branch directly calls deprecated `DevicePolicyManager.setAutoTimeRequired(admin, true)` without creating a Policy Ledger entry. `DeprovisionManager.reverseBrickPolicies()` has no `auto_time_required` case, so a Brick-created API-29 policy is neither tracked nor explicitly reversed before ownership release.

**Evidence:**
- `app/build.gradle.kts`: minSdk 29.
- `ManagedPolicy.kt`: API <30 branch directly calls `dpm.setAutoTimeRequired(admin, true)`.
- `DeprovisionManager.kt`: reversal cases cover `DISALLOW_CONFIG_DATE_TIME`, `auto_time`, and permission grants, but not `auto_time_required`.
- Android Enterprise documentation confirms `setAutoTimeRequired()` / `getAutoTimeRequired()` are the pre-Android-11 APIs and were deprecated in Android 11 in favor of newer auto-time APIs.

**Source file(s):** `ManagedPolicy.kt`, `DeprovisionManager.kt`
**Relevant function(s):** `applyBasePolicy`, `reverseBrickPolicies`
**Baseline commit SHA:** `204a141e90c078b6c2008778bd6c01bcbb8a4622`

**Reproduction:** On an API-29 Device Owner installation where auto time is not required, run `ManagedPolicy.apply()`. Brick can set auto-time-required without a ledger record. Then advance deprovision through UNDO DEVICE MANAGEMENT; no ledger entry exists to trigger an API-29 reversal.

**Impact:** Brick can relinquish Device Owner after leaving a Brick-created time policy behind, violating the reversible-policy/deprovision contract on a supported Android version.

**Root cause:** The API-29 compatibility branch predates the Policy Ledger model and was not brought under the same provenance/reversal rules as API 30+.

**Required correction:** Read the pre-change API-29 `getAutoTimeRequired()` state; persist an `auto_time_required` ledger record before mutation; apply only if that record was durably saved; add a deprovision reversal case that restores the previous state only when the current value is still the Brick-applied value. Add source/CI regression coverage for API-29 policy provenance.

**Fix commit:** pending
**Regression test:** pending
**Retest evidence:** pending
**Status:** OPEN
