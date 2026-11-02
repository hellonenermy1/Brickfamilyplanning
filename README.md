# Brick — Phase 7 Android Test Beta

This branch contains the Android app source used for the current Brick Phase 7 qualification beta.

Do not deploy Cloudflare from this branch. Cloudflare/runtime source lives separately.

## Phase 7 Device Owner safety contract

Phase 7 on this branch is a disposable test build, not a production Device Owner release.

Hard rules:

- `android:testOnly="true"` must remain enabled for every Device Owner test/beta APK.
- A test/beta APK must never rely on an ephemeral signing key for lock-in recovery or upgrade continuity.
- Before any Device Owner test, the removal/release path must already be present and verified.
- The diagnostics launcher must provide **EMERGENCY RELEASE DEVICE OWNER** and **SELF-DESTRUCT BETA** controls.
- Beta self-destruct may release admin, stop Brick, cancel recovery work and open Android uninstall. It must never call `wipeData()` or factory-reset the phone.
- The beta is time-bounded. Expired/retired builds must stop tracking/recovery and relinquish Device Owner/admin instead of continuing silently.
- CI must fail if the test-only flag, expiry, escape controls or owner-release implementation disappear.
- Every exported APK must include its SHA-256 and signing-certificate evidence.

Production can remove `testOnly` only after stable signing, update continuity, Device Owner transfer/release and physical recovery have all been qualified on a real device.

## Current Phase 7 beta

- Package: `com.brick.safety`
- Version: `0.7.0-phase7-beta1-test`
- Version code: `8`
- Minimum Android SDK: 29
- Target Android SDK: 35
- Compile SDK: 36
- Test-only: **yes**
- Automatic beta expiry: **2026-12-03 00:00 UTC**

The build remains a qualification beta until the normal Phase 7 integration checks and real OPPO/ColorOS reliability tests pass.
