# Brick V1 Phase 6 — Current Checkpoint

Date: 2026-11-01
Status: **IN PROGRESS**

Phase 5B is done. Real OPPO/ColorOS reliability checks are scheduled for Monday and do not block Phase 6 development.

## Phase 6 branches

- Android: `v1-p6-device-control-android`
- Android current SHA: `c298b72801e0c26784a47bafd128ef926f0016cf`
- Cloud: `v1-p6-device-control-cloud`
- Cloud current SHA: `48bc981021dc21fcf3e6928326798fe940398ad6`
- Android draft PR: #17
- Cloud draft PR: #16
- Current Phase 6 CI run: `41301420874`

## Completed so far

- Replaced unconditional Device Owner GPS-ON behavior with durable parent desired ON/OFF state.
- ON remains the backward-safe default.
- Parent Location commands are authenticated on the Cloud side and same-origin protected.
- Commands are bound to one device, short-lived and include unique nonces.
- Android rejects duplicate, replayed, older and expired commands.
- The Android service now consumes valid commands and asks Device Owner policy to apply them.
- The phone reports desired state, actual Android Location state and whether they match.
- The foreground notification is silent/low-priority and reports `GPS on` or `GPS off`.
- Added D1 migration for Location control state and acknowledgement.
- Added Android tests for persistent state, replay/expiry handling and command parsing.
- Added exact-pair Phase 6 CI.
- Cloud Phase 6 typecheck/control gate: **PASS** on run `41301420874`.

## Current test state

- Android build/lint/instrumentation for SHA `c298b72801e0c26784a47bafd128ef926f0016cf` is running in CI.

## Next

- Finish the current Android CI gate.
- Add the simple parent-dashboard GPS ON/OFF control and status display.
- Then add optional Shizuku support as a narrow helper only; Brick Core must continue working without it.
