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
