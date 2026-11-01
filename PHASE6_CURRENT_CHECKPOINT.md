# Brick V1 Phase 6 — Current Checkpoint

Date: 2026-11-01
Status: **IN PROGRESS**

Phase 5B is done. Real OPPO/ColorOS reliability checks are scheduled for Monday and do not block Phase 6 development.

## Phase 6 branches

- Android: `v1-p6-device-control-android`
- Android current SHA: `b4f7678baf832c8f3e4ad70409b4c5bc0c7238e4`
- Cloud: `v1-p6-device-control-cloud`
- Cloud current SHA: `9a9a339b8f12871dfc6b4d3aa0b636126e35bfdb`
- Android draft PR: #17
- Cloud draft PR: #16
- Phase 6 CI run: `41301068374`

## Completed so far

- Replaced unconditional Device Owner GPS-ON rule with durable parent desired ON/OFF state.
- ON remains the backward-safe default.
- Added duplicate/stale command rejection on Android state storage.
- Added parent Location control database state and migration.
- Added authenticated parent Location control API path with same-origin mutation protection.
- Added device-bound short-lived command delivery through the signed child health path.
- Added phone actual-state acknowledgement storage.
- Added exact-pair Phase 6 CI.
- Cloud Phase 6 typecheck/control gate is PASS on the current run.

## Next

- Finish Android CI/instrumentation for the new state store.
- Wire the delivered Location command into the Android service and report desired-vs-actual state.
- Add command expiry/nonce/device-binding enforcement on the phone.
- Then build optional Shizuku capability as a narrow typed helper only; Brick Core must not depend on it.
