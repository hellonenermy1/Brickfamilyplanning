# Brick V1 — Phase 8B Post-CI Source Findings

These findings were discovered during the manual source/reachability pass after the first independently green Android and Cloud remediation runs. They were surfaced during the live audit before correction. This file consolidates their final status against the integrated candidate rather than pretending the initial separate-green CI proved them.

Final integrated candidate: `204a141e90c078b6c2008778bd6c01bcbb8a4622`

## P8B-R007 — LOW fall candidates leaked into the safety upload path

**Severity:** P1 HIGH

**Problem:** LOW-confidence fall inference was being sent through the safety outbox, conflicting with `SAFE-009` (LOW normally logs locally only and must not spam the parent).

**Correction:** fall runtime now keeps LOW events local/diagnostic-only while MEDIUM/HIGH follow the durable safety path according to the current safety contract.

**Retest target:** final Android build/source gate + Phase 8C/8F device/integration safety tests.

**Status:** CLOSED AT SOURCE / IMPLEMENTED — UNVERIFIED.

## P8B-R008 — Deep Off quiescence/provenance was incomplete

**Severity:** P1 HIGH

**Problem:** the first Deep Off implementation did not fully preserve/restore all Brick-caused service/component state with provenance-safe semantics.

**Correction:** Deep Off/Policy Ledger now records Brick-caused changes, quiesces active Brick work, survives startup/reboot paths and restores only state not superseded by later user/system changes.

**Retest target:** Android CI plus Phase 8C/9 real-device reboot/day-long-off/provenance qualification.

**Status:** CLOSED AT SOURCE / IMPLEMENTED — UNVERIFIED.

## P8B-R009 — Android JVM unit-test gate could pass with effectively no P8B unit coverage

**Severity:** P1 HIGH

**Problem:** the remediation pipeline invoked the JVM unit-test task, but the newly added P8B behavior initially had no dedicated local unit test.

**Correction:** a real JVM test for the exact Maintenance entry state machine was added and dependency locking refreshed through a one-shot CI helper that was then removed. The normal read-only Android gate remains the release audit gate.

**Status:** CLOSED; final Android gate executes the unit-test task with real P8B test content.

## P8B-R010 — OneMap reverse geocoding lacked sufficient coalescing/stale-result protection

**Severity:** P1 HIGH

**Problem:** reverse enrichment could be invoked too aggressively relative to Live Track and could allow stale asynchronous results to race newer position state.

**Correction:** browser/provider path now rate-coalesces reverse enrichment, associates generation/state with the request and rejects stale results. Backend rate limiting/cache remain separate safeguards.

**Status:** CLOSED AT SOURCE / IMPLEMENTED — UNVERIFIED.

## P8B-R011 — HIGH fall realtime message did not reach the prominent parent alert path

**Severity:** P1 HIGH

**Problem:** fall ingest emitted a fall-specific realtime message while the parent UI's safety handler expected the normal safety-event path, so HIGH fall could miss the intended prominent parent alert.

**Correction:** final parent overlay consumes the normalized safety-event/fall path and renders a prominent HIGH-fall alert with time/context, View Location and Call quick action.

**Status:** CLOSED AT SOURCE / IMPLEMENTED — UNVERIFIED.

## P8B-R012 — Parent map lacked explicit Recenter / Follow behavior

**Severity:** P2 MEDIUM

**Problem:** map movement existed but the frozen map contract requires explicit Recenter/Follow controls and manual pan/zoom disabling forced follow.

**Correction:** final parent overlay adds Recenter and Follow controls; manual drag/zoom disables follow until explicit re-enable/recenter.

**Status:** CLOSED AT SOURCE / IMPLEMENTED — UNVERIFIED.

## P8B-R013 — OneMap address enrichment collapsed structured Singapore address fields

**Severity:** P2 MEDIUM

**Problem:** useful block/building/street/planning/postal fields were being flattened into one label, weakening `MAPSG-013` truth/presentation requirements.

**Correction:** provider response preserves structured fields when OneMap reliably supplies them; absent fields remain absent rather than invented.

**Status:** CLOSED AT SOURCE / IMPLEMENTED — UNVERIFIED.

## P8B-R014 — Required fallback PIN pairing lacked separate parent confirmation

**Severity:** P1 HIGH

**Problem:** the existing QR/manual-token setup did not satisfy `SEC-010/SEC-011`: a short-lived single-use fallback PIN had to be claimed by the child but bound only after a separate authorised parent confirmation.

**Correction on integrated candidate:**

- new `pairing_pin_sessions` D1 state stores only the PIN hash;
- 8-digit PIN expires after ten minutes;
- public child claim is IP/PIN rate-limited and atomically one-shot;
- child claim creates no device binding;
- child receives a high-entropy claim secret for status polling;
- authenticated same-origin parent confirmation is the only path that creates the device binding;
- PIN replay alone cannot retrieve the confirmed result;
- Android manual setup detects an 8-digit fallback code and waits for parent confirmation;
- parent UI explicitly creates and confirms fallback sessions.

**Regression evidence:** `scripts/test-p8b-pin-pairing-contract.mjs` is part of the final Cloud remediation gate; Android gate verifies child reachability.

**Status:** CLOSED AT SOURCE / IMPLEMENTED — UNVERIFIED.

## P8B-R015 — `Explain This Location` was not implemented

**Severity:** P2 MEDIUM

**Problem:** `PORT-025` remained only partial after the first remediation pass.

**Correction:** parent overlay now explains current position class/age and available GNSS, Atlas, cellular and motion evidence; surfaces provider unsupported/missing state and current conflict/trust explanation; and deliberately avoids invented confidence percentages.

**Regression evidence:** `scripts/test-p8b-parent-overlay-contract.mjs` is part of the final Cloud gate.

**Status:** CLOSED AT SOURCE / IMPLEMENTED — UNVERIFIED.

## Result

Open post-CI source findings: **0**.

These closures mean the source/reachability defect is corrected. They do not replace the deeper Android/backend/browser/device evidence required by Phases 8C–8F and Phase 9.