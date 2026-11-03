# Brick V1 — Phase 8C Android Deep-Audit Findings

Baseline implementation SHA: `204a141e90c078b6c2008778bd6c01bcbb8a4622`
Audit branch: `v1-p8c-android-deep-audit`
Status: IN PROGRESS

Findings are recorded before fixes. Closure requires a separate fix commit, regression evidence and retest.

---

## P8C-001 — SOS active-state durability is not atomic with the durable SOS event

**Requirement ID:** `SAFE-005` (also affects `SAFE-001`, `SAFE-003`, 8C.12 lifecycle/reboot coverage)
**Phase:** 8C
**Subsystem:** Android safety / local durability / lifecycle
**Severity:** P1 HIGH

**Expected:** Once SOS is activated, the SOS state remains active and prioritized until an authorised cancellation/termination condition, including through process death/reboot/update/offline conditions. The activation event and the phone-side state that drives aggressive cadence/recovery must not disagree after a crash.

**Actual:** `MainActivity.activateSos()` first writes a durable `sos_started` event through `SafetyDispatcher.enqueue()`, then separately writes `sosActive=true` using `SharedPreferences.Editor.apply()`. `endSos()` uses the same split ordering for `sos_cancelled` and `sosActive=false`. `BrickLocationService` determines SOS cadence/fresh-fix behavior from the preference, not from the durable SafetyOutbox event. Android documents that `apply()` updates memory immediately but persists to disk asynchronously.

**Evidence:**
- `app/src/main/java/com/brick/safety/ui/MainActivity.kt` at baseline SHA — `activateSos()`, `endSos()`, `isSosActive()`.
- `app/src/main/java/com/brick/safety/reliability/SafetyDispatcher.kt` — durable encrypted SafetyOutbox enqueue occurs independently.
- `app/src/main/java/com/brick/safety/location/BrickLocationService.kt` — service reads SOS active state to choose cadence and request fresh SOS position.
- Android SharedPreferences documentation: `apply()` writes to disk asynchronously.

**Source file(s):** `MainActivity.kt`, `SafetyDispatcher.kt`, `SafetyOutbox.kt`, `BrickLocationService.kt`
**Relevant function(s):** `activateSos`, `endSos`, `isSosActive`, `SafetyDispatcher.enqueue`, service startup/cadence paths
**Commit SHA:** `204a141e90c078b6c2008778bd6c01bcbb8a4622`

**Reproduction:** Activate SOS and terminate the process in the interval after the SafetyOutbox transaction succeeds but before the asynchronous preference disk write is durable. Restart/reboot. The durable `sos_started` record may exist while `sosActive` can fall back to false, causing normal rather than SOS tracking behavior until another state transition.

**Impact:** SOS event delivery can survive while the local phone no longer behaves as actively in SOS after abrupt death/reboot. This violates the persistent-priority safety contract and can lower tracking cadence during an active emergency.

**Root cause:** Safety event durability and safety mode state are stored through two different persistence mechanisms with no common transaction; the mode state uses asynchronous preference persistence.

**Required correction:** Persist SOS mode state atomically with the durable SafetyOutbox event (or establish an equally strong crash-safe single source of truth). Service/UI must read the durable state. Migration must preserve any legacy active SOS. Add process-death/reboot-oriented persistence regression coverage.

**Fix commit:** pending
**Regression test:** pending
**Retest evidence:** pending
**Status:** OPEN

---

## P8C-002 — Rejected FLP callbacks falsely terminate active reacquisition

**Requirement ID:** `REACQ-004`, `REACQ-005`, `REACQ-006`, `REACQ-007`; related `LOC-008`, `REL-010`
**Phase:** 8C
**Subsystem:** Android location / measured-position continuity
**Severity:** P1 HIGH

**Expected:** Callback/subscription health must be distinguished from accepted measured-position health. Reacquisition ends only when a usable current measured fix is accepted or the bounded repair path genuinely concludes. Repeated stale/mock/impossible/coarse-rejected callbacks must not indefinitely convince Brick that measured positioning recovered.

**Actual:** `BrickLocationService.recordMeasured(location)` increments `measuredGeneration`, sets `lastLocationElapsed` to now, clears `reacquisitionInProgress`, clears `reacquisitionFailedForGap`, and clears the reacquisition deadline **before** calling `PositionEngine.evaluate()`. `PositionEngine.evaluate()` can reject the same Location as mock, stale (>60 s), non-monotonic, impossible jump, very coarse regression, or consistency-guard failure, returning a fallback/UNKNOWN sample with `rawAccepted=false`.

**Evidence:**
- `BrickLocationService.kt` — `recordMeasured()` updates freshness/reacquisition state unconditionally before evaluation.
- `PositionEngine.kt` — `evaluate()` computes `accepted`, rejects multiple invalid cases, and returns `rejectedSample()` when not accepted.
- Fallback ticker and supervisor use `lastLocationElapsed` to decide whether the subscription has a gap and whether reacquisition is needed.

**Source file(s):** `app/src/main/java/com/brick/safety/location/BrickLocationService.kt`, `PositionEngine.kt`
**Relevant function(s):** `recordMeasured`, `record`, `PositionEngine.evaluate`, `startFallbackTicker`, `startSupervisor`, `beginReacquisition`
**Commit SHA:** `204a141e90c078b6c2008778bd6c01bcbb8a4622`

**Reproduction:** Feed periodic FLP callbacks inside the configured cadence where every Location is rejected by `PositionEngine` (for example stale elapsed time, mock=true, or an impossible jump). Each callback refreshes `lastLocationElapsed` and clears reacquisition despite no accepted measured fix. As long as invalid callbacks continue, the gap trigger can stay false.

**Impact:** A broken/noisy provider can prevent active measured-position repair while Brick operates on fallback. This undermines self-healing, system-truth health and the requirement that acceptable measured positioning be actively reacquired before fallback is treated as the steady state.

**Root cause:** Service tracks “callback observed” and “accepted measured fix observed” using one timestamp/generation and mutates repair state before validation.

**Required correction:** Separate callback liveness from accepted-measurement liveness. Evaluate first; only accepted measured/fused fixes may advance the accepted-measurement generation/timestamp and complete reacquisition. Rejected callbacks may update provider-callback diagnostics but must leave/enter the bounded repair path as appropriate. Add deterministic tests for stale/mock/impossible callbacks and fresh-fix recovery.

**Fix commit:** pending
**Regression test:** pending
**Retest evidence:** pending
**Status:** OPEN

---

## P8C-003 — Scheduled Wi-Fi result is confirmed before Android has necessarily finished the state transition

**Requirement ID:** `WIFICTL-002`, `WIFICTL-008`; related `WIFICTL-001`, `WIFICTL-004`
**Phase:** 8C
**Subsystem:** Device Owner / scheduled Wi-Fi control
**Severity:** P1 HIGH

**Expected:** On a platform where Device Owner Wi-Fi control is supported, Brick initiates the one-shot action, waits for/verifies the resulting actual Wi-Fi state, and only then records/reports the action result. Parent truth must come from actual confirmed phone state.

**Actual:** `WifiScheduleManager.execute()` calls `WifiManager.setWifiEnabled(target)`, then immediately reads `wifi.isWifiEnabled`. It records success only when the immediate read already equals the target. Android's API documentation states Device Owner is exempt from the Android Q+ restriction, but a `true` return from `setWifiEnabled()` can mean Wi-Fi is **in progress toward** the requested state rather than already there.

**Evidence:**
- `app/src/main/java/com/brick/safety/maintenance/WifiScheduleManager.kt` — immediate post-request state comparison.
- Android `WifiManager.setWifiEnabled(boolean)` API documentation — Device Owner exemption and return semantics (`true` may mean transition in progress).

**Source file(s):** `WifiScheduleManager.kt`, `WifiScheduleWorker.kt`, `WifiOneShotControl.kt`
**Relevant function(s):** scheduled Wi-Fi `execute` / action-result persistence
**Commit SHA:** `204a141e90c078b6c2008778bd6c01bcbb8a4622`

**Reproduction:** On a supported Device Owner target where the Wi-Fi transition takes non-zero time, trigger a schedule. `setWifiEnabled()` can accept the request while the immediate `isWifiEnabled` read still reports the old state. Brick records failure even though the platform subsequently reaches the requested state.

**Impact:** False failed command history and parent state, unreliable schedule behavior, and no trustworthy actual-state confirmation boundary.

**Root cause:** Request acceptance and completed Android state transition are treated as one synchronous operation.

**Required correction:** Implement bounded asynchronous verification of `WifiManager.wifiState`/`isWifiEnabled` after the request, using state-change observation and/or bounded polling with timeout. Persist/report success only after actual target state is observed; timeout/failure must remain truthful. Keep the action one-shot and do not add a persistent Wi-Fi lock/enforcement loop.

**Fix commit:** pending
**Regression test:** pending
**Retest evidence:** pending
**Status:** OPEN

---

## P8C-004 — Corrupted Policy Ledger fails open during Device Owner release

**Requirement ID:** `DEPROV-002`, `DEPROV-003`, `DEEPOFF-001`, `DEEPOFF-005`
**Phase:** 8C
**Subsystem:** Maintenance / policy provenance / deprovisioning
**Severity:** P1 HIGH

**Expected:** The Policy Ledger is durable provenance. Before Device Owner release Brick must either prove applicable Brick-created policies were reversed or fail closed. Corrupt/unknown provenance cannot be silently interpreted as “nothing to reverse.”

**Actual:** `PolicyLedger.readArray()` catches every parse error and returns an empty `JSONArray`. `PolicyLedger.active()` therefore reports no active policies when the ledger JSON is corrupted. `DeprovisionManager.reverseBrickPolicies()` iterates that empty list, returns true, and `undoDeviceManagement()` may proceed to `BetaSafety.releaseDeviceOwner()`.

**Evidence:** `PolicyLedger.kt` `readArray/read/active`; `DeprovisionManager.kt` `reverseBrickPolicies()` and `undoDeviceManagement()` at baseline SHA.

**Source file(s):** `PolicyLedger.kt`, `DeprovisionManager.kt`
**Relevant function(s):** `readArray`, `active`, `reverseBrickPolicies`, `undoDeviceManagement`
**Commit SHA:** `204a141e90c078b6c2008778bd6c01bcbb8a4622`

**Reproduction:** Persist malformed/non-JSON text in `brick_policy_ledger_v1/records`, then execute deprovision after QUIESCE while Device Owner remains active. The ledger is interpreted as empty rather than corrupt, so policy reversal can be treated as complete.

**Impact:** Brick may relinquish Device Owner while Brick-created policy state remains on the phone or while provenance is unknown, violating the five-stage safe-deprovision contract and potentially leaving the device in a modified state Brick can no longer repair.

**Root cause:** Corruption handling intentionally substitutes an empty ledger rather than an explicit invalid state, and the caller has no integrity signal.

**Required correction:** Make ledger parsing integrity-aware and fail closed. Deprovision must refuse ownership release if ledger provenance is corrupt/unreadable until an explicit verified recovery/reconciliation path succeeds. Add corruption/reconciliation regression tests.

**Fix commit:** pending
**Regression test:** pending
**Retest evidence:** pending
**Status:** OPEN

---

## P8C-005 — PURGE BRICK is incomplete and reports success without verifying deletion

**Requirement ID:** `DEPROV-001`; related `DEPROV-002/003`, Android privacy/data-path exit gate
**Phase:** 8C
**Subsystem:** Maintenance / deprovisioning / local privacy
**Severity:** P1 HIGH

**Expected:** The PURGE BRICK phase removes Brick-owned local state that must not survive final deprovisioning and only advances after required deletion succeeds. Unknown persistent-data paths are not acceptable at 8C closure.

**Actual:** `DeprovisionManager.purgeBrick()` deletes a fixed list of databases and preference files but does not delete important Brick files/stores including encrypted `files/brick_phase3_state.bin`, encrypted `files/brick_atlas_v1.bin`, and `brick_capability_profile_v1`. It also wraps `deleteDatabase()` and preference `clear().commit()` calls in `runCatching` but ignores both thrown failures and false return values. It then persists `PURGE_BRICK` and reports `Brick local state purged` regardless.

**Evidence:**
- `DeprovisionManager.kt` `purgeBrick()` fixed deletion lists and ignored results.
- `Phase3StateStore.kt` stores encrypted learned positioning state in `filesDir/brick_phase3_state.bin`.
- `AtlasStateStore.kt` stores encrypted environmental Atlas state in `filesDir/brick_atlas_v1.bin`.
- `CapabilityProfileStore.kt` stores `brick_capability_profile_v1`.

**Source file(s):** `DeprovisionManager.kt`, `Phase3StateStore.kt`, `AtlasStateStore.kt`, `CapabilityProfileStore.kt`
**Relevant function(s):** `purgeBrick`, Phase3/Atlas persistent stores
**Commit SHA:** `204a141e90c078b6c2008778bd6c01bcbb8a4622`

**Reproduction:** Complete AUTHORISE/FREEZE → QUIESCE → UNDO DEVICE MANAGEMENT with Phase3/Atlas state present, then run PURGE BRICK. The files are not included in the purge list and remain in internal storage. Separately, force a deletion/clear failure; purge still advances because results are ignored.

**Impact:** Deprovision can truthfully say `PURGE_BRICK` while Brick-owned learned location/environmental state remains, or while deletion failed. This is a privacy and lifecycle correctness failure and leaves a known persistent-data path unexplained at 8C exit.

**Root cause:** Purge implementation uses a hand-maintained partial store list and does not require verified deletion success.

**Required correction:** Centralize/cover all Brick-owned persistent stores, explicitly delete Phase3/Atlas files and capability/config stores, verify every mandatory deletion/clear, and fail closed without advancing the stage if any required purge step fails. Preserve only the minimal deprovision stage state needed to finish uninstall. Add purge-completeness and forced-failure regressions.

**Fix commit:** pending
**Regression test:** pending
**Retest evidence:** pending
**Status:** OPEN
