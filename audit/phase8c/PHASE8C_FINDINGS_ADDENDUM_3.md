# Brick V1 — Phase 8C Android Deep-Audit Findings Addendum 3

Baseline implementation SHA: `204a141e90c078b6c2008778bd6c01bcbb8a4622`
Audit branch: `v1-p8c-android-deep-audit`
Status: IN PROGRESS

---

## P8C-011 — HIGH-fall protection state is not atomic with the durable HIGH-fall event

**Requirement ID:** `SAFE-011`, `SAFE-015`, `SAFE-018`, `WIFICTL-004`; related Phase 8C.6, 8C.12, 8C.15
**Phase:** 8C
**Subsystem:** Fall detection / safety durability / scheduled Wi-Fi interlock
**Severity:** P1 HIGH

**Expected:** When a HIGH fall is accepted, the critical safety event and the temporary local state used to protect active handling must survive process death/reboot consistently. In particular, a scheduled Wi-Fi OFF action must remain deferred during the HIGH-fall protection window even if the process dies immediately after the event is durably saved.

**Actual:** `FallDetectorRuntime.evaluateCandidate()` first durably queues `fall_detected` through `SafetyDispatcher.enqueue()`. Only afterward, for HIGH confidence, it separately writes `fallHighActive=true` and `fallHighUntilMs` with asynchronous `SharedPreferences.apply()`. `WifiScheduleManager.criticalSafetyActive()` reads that preference. A crash after the SafetyOutbox transaction but before the preference reaches disk can therefore preserve/deliver the HIGH-fall event while losing the local HIGH-fall interlock.

**Evidence:**
- `app/src/main/java/com/brick/safety/reliability/FallDetectorRuntime.kt`: HIGH event is enqueued first; `fallHighActive/fallHighUntilMs` are written separately with `apply()`.
- `app/src/main/java/com/brick/safety/maintenance/WifiScheduleManager.kt`: Wi-Fi OFF deferral checks `SafetyDispatcher.isSosActive(context) || p.getBoolean("fallHighActive", false)`.
- SafetyOutbox already demonstrates the required crash-safe atomic-state pattern for SOS after P8C-001 remediation.

**Source file(s):** `FallDetectorRuntime.kt`, `SafetyDispatcher.kt`, `SafetyOutbox.kt`, `WifiScheduleManager.kt`
**Relevant function(s):** `evaluateCandidate`, `criticalSafetyActive`, safety enqueue/state persistence
**Baseline commit SHA:** `204a141e90c078b6c2008778bd6c01bcbb8a4622`

**Reproduction:** Trigger a HIGH fall and terminate the process after the durable `fall_detected` insert succeeds but before the asynchronous fall-protection preference is persisted. Restart while the original protection interval is still active and allow a scheduled Wi-Fi OFF action to become due. The HIGH event can remain pending/delivered while the schedule no longer sees HIGH-fall protection.

**Impact:** A critical safety event can survive while the local safety interlock does not. This can allow Brick to switch Wi-Fi off during the intended HIGH-fall handling window and violates the requirement that critical safety state outrank scheduled connectivity actions.

**Root cause:** HIGH-fall event durability and HIGH-fall active-state durability use separate persistence mechanisms with no common transaction.

**Required correction:** Persist the HIGH-fall event and a bounded `highFallUntilMs` safety-state value in the same durable SafetyOutbox transaction. Read the authoritative state from the durable safety store, with any preference only a compatibility/diagnostic mirror. Expired state must evaluate false without requiring a manual cleanup. Add crash/reopen regression coverage for the event+state invariant.

**Fix commit:** pending
**Regression test:** pending
**Retest evidence:** pending
**Status:** OPEN
