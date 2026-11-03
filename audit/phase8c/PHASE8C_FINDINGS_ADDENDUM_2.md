# Brick V1 — Phase 8C Android Deep-Audit Findings Addendum 2

Baseline implementation SHA: `204a141e90c078b6c2008778bd6c01bcbb8a4622`
Audit branch: `v1-p8c-android-deep-audit`
Status: IN PROGRESS

---

## P8C-010 — Maintenance diagnostic report presents stale/misleading state semantics

**Requirement ID:** `MAINT-003`, `MAINT-006`; related `REL-010`, `PORT-014`, `SHZ-008`
**Phase:** 8C
**Subsystem:** Maintenance diagnostics / system-truth reporting
**Severity:** P2 MEDIUM

**Expected:** The local Maintenance & Recovery Console reports current Brick V1 state truthfully. Historical one-shot command targets must not be presented as a persistent desired state, and SOS truth must come from the durable safety-state source.

**Actual:** `DiagnosticStore.buildReport()` still labels the export `BRICK PHASE 6C BETA DIAGNOSTIC REPORT` on V1 RC builds. Its Location line prints `desired=${locationState?.desired...}` even though current V1 Location control is one-shot and does not retain/enforce a persistent parent desired state. It also prints `sosActive` directly from the compatibility `brick` SharedPreferences mirror instead of the authoritative durable SafetyOutbox state introduced by the P8C-001 correction.

**Evidence:** `app/src/main/java/com/brick/safety/diagnostics/DiagnosticStore.kt` at the Phase 8C branch; current product contract requires one-shot child-override Location control and truthful maintenance state.

**Source file(s):** `DiagnosticStore.kt`, `ParentLocationStateStore.kt`, `SafetyDispatcher.kt`
**Relevant function(s):** `buildReport`
**Baseline commit SHA:** `204a141e90c078b6c2008778bd6c01bcbb8a4622`

**Impact:** A maintainer can misread an RC device as a legacy beta and can misinterpret a completed historical parent command as an ongoing desired/enforced Location state. A failed compatibility-mirror write could also make displayed SOS state disagree with the durable safety source.

**Root cause:** The diagnostics text/state bindings were not updated when the beta label and persistent Location semantics were superseded.

**Required correction:** Use a V1 diagnostic title; label Location fields explicitly as last one-shot command target/status/actual; read SOS through `SafetyDispatcher.isSosActive()`; retain privacy-reduced output.

**Fix commit:** pending
**Regression test:** pending
**Retest evidence:** pending
**Status:** OPEN
