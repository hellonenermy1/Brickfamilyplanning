# Brick Audit Status

Last updated: 2026-10-31

## Current acceptance state

Brick remains a **release candidate**, not production-qualified.

- Version: `0.6.0-phase6-rc`
- Version code: `6`
- Package: `com.brick.safety`
- Qualification state: `candidate-not-real-device-qualified`

## Proven source baseline

The fully validated Phase 6 source commit was:

`176d94f604eb562a59260ef380ee680a564acfcc`

Git tree:

`b5f4ea6e97e9e2afef7a01c8386829f316b4af2e`

The later pre-cleanup hardening head:

`b23741d31ec6c51a5b00b6fe15b753b0d70d04c8`

had the exact same Git tree. GitHub compare showed zero file differences.

## Proven CI evidence on that tree

All eight normal Phase 6 workflows completed successfully:

1. Source inventory
2. Android runtime wiring
3. Android recovery hardening
4. Cloudflare Phase 6 validation
5. Security hardening
6. Operations/durability checks
7. Exact Android dependency-lock generation
8. Android debug + release build, lint, APK inspection and provenance

The committed Android Gradle lock matched fresh dependency resolution.

## APK evidence

- Debug APK: built successfully and validly signed with the Android debug certificate.
- Release variant: built successfully.
- Stable production signing: **not configured** at the time of the proven build.
- Stable-signed release upload: skipped.
- Therefore the unsigned release candidate must not be presented as a production APK.

## Cloud deployment evidence

The hardened Phase 6 one-click workflow is prepared on `main` and verifies:

- exact source SHA,
- D1/R2/Queues/DLQ resource state,
- Cloudflare Access configuration,
- required D1 tables and privacy/replay schema,
- R2 lifecycle retention rules,
- public `/healthz`,
- unauthenticated parent-route denial,
- invalid pairing fail-closed behavior,
- unsigned fake-device fail-closed behavior,
- optional private Singapore map installation.

**No new live Phase 6 deployment is claimed in this record yet.** A successful future workflow run must produce and retain deployment evidence before that blocker is closed.

## Current repository organization

- `main` — canonical Cloudflare/runtime branch and manual Run workflow dispatchers.
- `apk-download` — Android-only source branch for APK builds.
- `audit-progress` — documentation-only audit/progress/project-memory branch.

The branch separation reused proven Phase 6 source blobs, but the organizational commits and new APK dispatcher have not yet had a fresh real Actions execution after the cleanup.

## Production blockers

### Blocker 1 — Stable Android signing

Required GitHub secrets:

- `BRICK_ANDROID_KEYSTORE_B64`
- `BRICK_ANDROID_KEYSTORE_PASSWORD`
- `BRICK_ANDROID_KEY_ALIAS`
- `BRICK_ANDROID_KEY_PASSWORD`

A final production Device Owner qualification should use the stable-signed APK, not a disposable debug certificate.

### Blocker 2 — Live Phase 6 Cloudflare deployment

Run the canonical deployment workflow from `main` and retain its generated deployment-verification artifact.

### Blocker 3 — Authenticated browser smoke test

The parent dashboard must be tested while genuinely authenticated through Cloudflare Access. Public denial checks alone do not prove the full parent UI/session path.

### Blocker 4 — Physical OPPO/ColorOS qualification

Required real-device tests include:

- Device Owner provisioning,
- QR/manual pairing,
- background and screen-off tracking,
- swipe-away/process recovery,
- reboot recovery,
- Wi-Fi/mobile transitions,
- multi-hour network outage and backlog drain,
- temporary GNSS degradation,
- SOS persistence/retry,
- I’M SAFE check-in,
- revoke behavior,
- private map behavior,
- battery saver/charging/low-battery states,
- long-running stability and battery drain.

## Audit principle

A green source/build check is not the same thing as a live deployment or a physical reliability qualification. Each acceptance layer stays open until its own evidence exists.
