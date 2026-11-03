# Brick V1 — Phase 8B Remediation Findings — Final Sweep

This file continues the remediation ledger from P8B-R014. Findings are recorded before their fixes and require separate fix commits plus retest evidence.

## P8B-R014 — HIGH fall reaches safety storage but lacks a dedicated prominent parent emergency action surface

**Severity:** P1 HIGH — the safety event is durable/realtime, but the parent experience does not yet satisfy SAFE-011's prominent HIGH-fall handling.

**Observed baseline:** Android remediation after `faaea694a93913724dfbf45be2b78679a5b3f953`; cloud `5f939d21d6a58a945457184277b424d4af3c11dc`.

**Evidence:** `fall-event-route.ts` correctly inserts `fall_detected` into `safety_events` and calls `BrickDevice.pushSafetyEvent`, so the event reaches the normal realtime safety channel. The inherited parent `wsMessage()` shows every `safety_event` through generic `showBanner(labelEvent(...), kind)`. `showBanner` gives special prominent/red treatment only to `sos_started`; `labelEvent` has no fall-specific label; and the fall alert exposes no immediate View Location / Call action. The event list can be clicked to move the map when coordinates exist, but that is not the required HIGH-fall quick-action surface.

**Expected:** HIGH fall gets a prominent parent alert containing time, movement/evidence summary and position/quality context where available, with immediate View Location and Call actions. MEDIUM remains visible but less alarming; LOW never leaves the phone.

**Required correction:** extend the P8B parent layer to recognize `fall_detected`, inspect confidence, present a persistent/prominent HIGH-fall card/banner, expose View Location immediately when event coordinates exist, and provide a one-tap Call action that opens the device dialer without inventing a child phone number. Keep MEDIUM visible without HIGH styling.

**Status:** OPEN — finding recorded before fix.
