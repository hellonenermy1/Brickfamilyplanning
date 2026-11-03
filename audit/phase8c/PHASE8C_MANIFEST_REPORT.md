# Brick V1 — Phase 8C Manifest and Package Report

Production freeze: `967e5d5ceb7e485af997eb0f6380e9544cd39e79`

## Build identity

- namespace/applicationId: `com.brick.safety`
- compileSdk: 36
- minSdk: 29
- targetSdk: 35
- versionCode: 10
- versionName: `1.0.0-rc.1`
- release debuggable: false by build contract
- release minification: enabled
- resource shrinking: enabled
- Java/Kotlin target: 17
- dependency locking: enabled

## Security-relevant manifest contract

The release source contract requires:

- `android:allowBackup="false"`
- `android:usesCleartextTraffic="false"`
- the tracking service as a location foreground service
- Device Admin receiver limited to the platform-admin binding path
- no debug/test-only resource or retirement harness in the release manifest
- no broad generic exported control surface for privileged actions

The Phase 8C deep-audit workflow builds the merged release manifest and checks exported surface/security contracts. The dedicated signed-RC workflow independently rechecks package ID, version code/name, release debuggability, cleartext/backup flags, test-harness absence and signing identity on the exact APK artifact.

## Debug-only test surface

`Phase8ResourceHarnessReceiver` exists only under `app/src/debug`. The resource workflow explicitly assembles release and rejects the artifact if this receiver/action appears in the release merged manifest. Debug harness code is not production runtime evidence.

## Permanent public signing identity

Pinned certificate SHA-256:

`BF:DE:B4:97:14:FE:A7:14:53:6C:47:F8:12:6D:EE:D7:00:F0:0B:2D:D1:13:C5:C0:D4:52:99:2D:7E:D5:F7:90`

No private signing material is committed. Repository rules/source scans reject common private-key/keystore forms.

## APK-only status

The exact current signed APK has **not** been frozen in Phase 8C. Run `41668964798` of `Brick V1 Phase 8C — Signed RC APK Evidence` stopped before build because these Actions secrets were empty/missing:

- `BRICK_ANDROID_KEYSTORE_B64`
- `BRICK_ANDROID_KEYSTORE_PASSWORD`
- `BRICK_ANDROID_KEY_ALIAS`
- `BRICK_ANDROID_KEY_PASSWORD`
- `BRICK_ANDROID_SIGNING_CERT_SHA256`

Therefore APK SHA-256, exact signed artifact provenance, and certificate verification on the current RC remain BLOCKED. This is an external secret-configuration blocker; do not regenerate the permanent key.
