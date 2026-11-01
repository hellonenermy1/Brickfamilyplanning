# Brick V1 Phase 5B — Remaining Real-Device Gates

Date: 2026-11-01
Purpose: keep assistant-side completion separate from things that genuinely require physical OPPO/ColorOS or real multi-device/radio hardware.

This is not a request to run every test at once. It is the remaining evidence list after automated closure.

## Phase 2 — durable evidence/data path

Physical target checks:
- kill/restart Brick with locally queued records and verify no data disappears before exact server ACK;
- temporary network loss then recovery/backfill without reopening Brick;
- reboot recovery;
- re-pair/owner isolation behavior;
- backlog drain while safety/live traffic still wins;
- ColorOS background behavior without manual Start/re-sync.

## Phase 3 — motion/position degradation

Physical target checks:
- stationary behavior without route tug/drift becoming false truth;
- normal walking and running motion/step evidence;
- GNSS degradation/loss and conservative uncertainty growth;
- process restart during degraded tracking;
- recovery to trustworthy precise/assisted Android location without a jump or manual reset;
- target sensor availability/health and sustained background operation.

## Phase 4 — environmental Atlas / Signal Trust

Physical target checks:
- Wi-Fi scanning/background behavior and common/copied SSID cases;
- BLE background environment behavior, moving BLE and beacon replacement;
- router/LAN-device replacement and relearning;
- Wi-Fi RTT capability: PASS when genuinely supported, otherwise `UNSUPPORTED — VERIFIED`;
- LTE/NR fields actually exposed by the target and handover behavior;
- GNSS-sky open/constrained/indoor/recovery behavior;
- Android Companion Device Manager association presence, removal, same-device re-association and reboot behavior;
- battery/resource effect of real provider cadences.

## Phase 5 — unified fusion / external constraints

Physical/integration checks:
- real degraded transitions where motion + Atlas + learned place agree/conflict;
- learned-place entry/exit and environment replacement/relearning;
- long outage where uncertainty grows rather than freezing a precise-looking point;
- RTT on real supported hardware if available;
- private Witness sighting with another authorised Brick device, including revocation/replay/freshness behavior;
- fixed Ground receiver behavior if a real receiver is available; one receiver must remain an area, not fake exact range;
- future-ranging target capability must report supported/unsupported honestly;
- after a real degraded interval followed by a trustworthy precise return, verify refined history is stored/displayed separately from original raw/realtime history once the corresponding staged Cloud path is deployed for integration testing.

## Pass/fail rule

For a recoverable normal failure, needing to reopen Brick, tap Start, manually re-sync, clear app data or reboot the phone is a failure unless the test specifically instructs a reboot.

A target capability that Android/ColorOS genuinely does not expose may be recorded as `UNSUPPORTED — VERIFIED`; it must not be faked or treated as precise evidence.

Emulator/hosted CI can close source and framework-logic gates but cannot replace these physical observations.
