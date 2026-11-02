# Brick — Phase 8 Android Hardening

This branch is the Android Phase 8 hardening line. It starts exactly from Phase 7 Android SHA `8843bdae902050c8c1fd7e67ed7ac80662d0da93`.

Phase 8 is reliability, security, privacy and operational hardening. Real OPPO/ColorOS production qualification is Phase 9.

## Device Owner beta safety contract

- Every Device Owner test/beta remains `android:testOnly="true"`.
- No beta contains a phone wipe/factory-reset escape.
- Retirement is three-stage and monotonic: `DISARMED` -> `MANAGEMENT_RELEASED` -> `UNINSTALL_REQUESTED`.
- Stage 1 is durably written before any Device Owner/admin release.
- Once disarmed, boot/update/work recovery must never reactivate normal Brick runtime.
- Parent Location control is one-shot and must not lock the Location settings UI.
- Installable Device Owner betas must use the persistent release keystore secrets. Debug APKs are CI/emulator artifacts only and must not be used as real-device Device Owner betas.
- Every exported installable APK records SHA-256 and signing certificate evidence.

## Stable signing secrets

The stable export workflow requires the existing secret set:

- `BRICK_ANDROID_KEYSTORE_B64`
- `BRICK_ANDROID_KEYSTORE_PASSWORD`
- `BRICK_ANDROID_KEY_ALIAS`
- `BRICK_ANDROID_KEY_PASSWORD`

The first stable Phase 8 certificate fingerprint still has to be pinned as a separate Phase 8 acceptance gate; until that is done, requirement `P8-011` remains an open blocker.

## Current beta

- Package: `com.brick.safety`
- Version: `0.8.0-phase8-beta1-test`
- Version code: `9`
- Minimum SDK: 29
- Target SDK: 35
- Compile SDK: 36
- Test-only: yes
- Expiry: 2026-12-10 00:00 UTC

See `PHASE8-CONTRACT.md`, `PHASE8-REQUIREMENTS.md`, `PHASE8-TEST-EVIDENCE.md`, `PHASE8-CHANGES.md` and `PHASE8-CLOSURE.md` for the authoritative Phase 8 ledger.
