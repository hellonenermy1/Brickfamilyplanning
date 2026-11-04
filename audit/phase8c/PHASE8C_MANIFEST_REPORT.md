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


## Addendum — 2026-11-04 later audit execution (supersedes historical missing-secret note)

**Latest Android production-source correction:** `0bd66aea88857c934f3bcd2fe5c3412ddc6f2746` (subsequent changes were tests/workflows; confirm branch HEAD before release). **Phase 8C status remains INCOMPLETE** until post-fix checks and signed APK verification pass.

GitHub Actions signing secrets were added by the repository owner. Signed-build run [41668964798](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41668964798) passed the signing-secret prerequisite and built a release APK with Gradle; it failed while an XML-inspection utility tried to parse app metadata containing an unescaped ampersand in the utility's XML representation. Follow-on verification run [41755937330](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41755937330) independently observed packaged AAPT2 attributes `android:allowBackup=false` and `android:usesCleartextTraffic=false`, but the original verifier expected a different AAPT2 text format and failed. The verifier was corrected to parse the actual compiled boolean values without accepting missing/unknown values. **Do not claim final APK hash/certificate verification until the corrected run completes.**

### Effective AndroidX merged release manifest exports

Gradle merged-manifest audit run [41756272480](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41756272480) exposed the complete **eight-component** export set (the historical hardcoded audit allowlist omitted three AndroidX entries):

| Export | Required permission / restricted caller |
| --- | --- |
| `com.brick.safety.ui.MainActivity` | User-visible launcher; no caller permission |
| `com.brick.safety.atlas.BrickCompanionLegacyService` | `android.permission.BIND_COMPANION_DEVICE_SERVICE` |
| `com.brick.safety.atlas.BrickCompanionAssociationService` | `android.permission.BIND_COMPANION_DEVICE_SERVICE` |
| `com.brick.safety.managed.BrickDeviceAdminReceiver` | `android.permission.BIND_DEVICE_ADMIN` |
| `rikka.shizuku.ShizukuProvider` | `android.permission.INTERACT_ACROSS_USERS_FULL` |
| `androidx.work.impl.background.systemjob.SystemJobService` | `android.permission.BIND_JOB_SERVICE` |
| `androidx.work.impl.diagnostics.DiagnosticsReceiver` | `android.permission.DUMP` |
| `androidx.profileinstaller.ProfileInstallReceiver` | `android.permission.DUMP` |

The latter three are permission-protected AndroidX integration surfaces, not unrestricted Brick actions. The upstream WorkManager manifest explicitly enables DiagnosticsReceiver with `DUMP`; the initial new audit assertion incorrectly expected disabled. This was corrected at `82f0e98a`. Sources: [AndroidX WorkManager manifest](https://github.com/androidx/androidx/blob/androidx-main/work/work-runtime/src/main/AndroidManifest.xml), [AndroidX ProfileInstallReceiver docs](https://developer.android.com/reference/androidx/profileinstaller/ProfileInstallReceiver).

The exhaustive merged-manifest CI still fails if any additional component is exported or any expected permission changes. A source/merged-manifest pass does **not** substitute for final signed APK and installed device evidence.


## Verified historical signed RC snapshot — run 41756635965

Exact run: [41756635965](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41756635965), job `126334174221`, completed **SUCCESS** with permanent signing identity, compiled APK verification and signed artifact upload.

- Artifact: `brick-v1-phase8c-signed-rc-abf4713327149eefd2b716bd3c7fb2fd14b1c3a5` (GitHub artifact id `13289287846`).
- Source commit: `abf4713327149eefd2b716bd3c7fb2fd14b1c3a5`.
- Package `com.brick.safety`, versionCode `10`, versionName `1.0.0-rc.1`, minSdk 29, targetSdk 35.
- APK SHA-256 (computed again from downloaded APK bytes, matching the uploaded signed provenance):
  `b0e7caf9220cc4121c33491f9de4175e08ddf913451b787552b9ee72b459db0e`
- `apksigner verify --verbose --print-certs`: APK Signature Scheme **v3 verified** (v1/v2 not enabled); RSA **4096-bit** single signing identity; certificate SHA-256 `bfdeb49714fea714536c47f8126deed700f00b2dd113c5c0d452992d7ed5f790`, matching pinned original.
- Actual compiled APK manifest attributes `android:allowBackup=false` and `android:usesCleartextTraffic=false`; no debug/test-only receiver in binary manifest.

**Important limitation:** this is a legitimate signed APK **for `abf47133`**, not the last Phase 8C Android production source. The subsequent privacy-race correction at `0bd66aea` changes `app/src/main` and must be signed and verified separately. Do NOT substitute the older successful signed snapshot for the final current-source release gate.
