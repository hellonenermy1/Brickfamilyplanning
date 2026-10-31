# Brick — APK Source / Download Branch

This branch contains only the Android app source used to build Brick APKs.

Do not deploy Cloudflare from this branch. Cloudflare/runtime source lives on `main`. Audits and project progress live on `audit-progress`.

## Download an APK

Use the repository's **Actions** tab on the default branch and run:

**Brick — Build / Download APK**

That workflow always checks out this `apk-download` branch and uploads APK artifacts.

Expected artifacts:

- `Brick-APK-debug` — installable debug APK for functional/device testing.
- `Brick-APK-release-candidate` — release variant; may be unsigned if stable signing secrets are missing.
- `Brick-APK-production-signed` — appears only when all production signing secrets are configured.
- `Brick-APK-evidence` — hashes, signing evidence and merged manifest/permission inspection.

## Stable production signing

The final production build requires these GitHub Actions secrets:

- `BRICK_ANDROID_KEYSTORE_B64`
- `BRICK_ANDROID_KEYSTORE_PASSWORD`
- `BRICK_ANDROID_KEY_ALIAS`
- `BRICK_ANDROID_KEY_PASSWORD`

If they are not all configured, the workflow deliberately builds an unsigned release candidate instead of pretending it is production-ready.

## Current release

- Package: `com.brick.safety`
- Version: `0.6.0-phase6-rc`
- Version code: `6`
- Minimum Android SDK: 29
- Target Android SDK: 35
- Compile SDK: 36

The release remains `candidate-not-real-device-qualified` until stable signing, live Phase 6 Cloudflare deployment, authenticated browser smoke testing and real OPPO/ColorOS qualification are complete.
