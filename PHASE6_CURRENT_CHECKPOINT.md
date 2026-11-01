# Brick V1 Phase 6 — Current Checkpoint

Date: 2026-11-01
Status: **IN PROGRESS**

Phase 5B is done. Real OPPO/ColorOS reliability checks are scheduled for Monday and do not block Phase 6 development.

## Current branches

- Android: `v1-p6-device-control-android`
- Android current SHA: `25c0d993ac738a5e8f20a58a6567910f79615059`
- Cloud: `v1-p6-device-control-cloud`
- Cloud current SHA: `ead8227cff6f259dda6ca1f3b49d2dff8bc829b4`
- Android draft PR: #17
- Cloud draft PR: #16
- Current CI run: `41302557452`

## Done so far

- Parent GPS ON/OFF control is implemented end-to-end.
- Parent dashboard has simple GPS ON / GPS OFF buttons and desired/actual status.
- Phone stores the parent choice and Device Owner applies/repairs it.
- Commands are authenticated, device-bound, short-lived and replay-protected.
- Android strictly rejects malformed, stale, future, duplicate and expired commands.
- Phone reports desired GPS state, actual GPS state and whether they match.
- Brick notification is silent/low-priority and says `GPS on` or `GPS off`.
- Cloud Location-control storage/API and phone acknowledgement are implemented.
- Cloud typecheck, security guards and dashboard render test are PASS on run `41302557452`.
- Optional privileged/Shizuku foundation now uses a narrow typed capability list only.
- Brick has a safe no-helper fallback and does not depend on Shizuku to keep tracking.
- Privileged helper health is included in normal Brick health reporting.
- There is no generic remote shell API.

## Testing now

- CI run `41302557452` is finishing Android build/lint and then cumulative emulator tests for the GPS-control baseline.
- The newer privileged-bridge foundation at Android SHA `25c0d993...` will be pinned into the next CI run after this baseline gate finishes.

## Next

- Finish Android CI for GPS control.
- Run CI for the privileged bridge foundation.
- Add the actual optional Shizuku provider against the official API while keeping Brick Core independent.
- Then add only useful typed privileged evidence/repair features; real OPPO behavior is checked Monday.
