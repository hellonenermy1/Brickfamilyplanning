# Brick V1 — Phase 8 Test Evidence

This file records executed acceptance evidence. Source inspection alone is never labelled `PASS`.

## Frozen code candidates

- Android Phase 7 retained baseline: `8843bdae902050c8c1fd7e67ed7ac80662d0da93`.
- Android Phase 8 tested code candidate: `ced2a0c6d040e4cca6f5012a0a3aeab2eb7f5ad8`.
- Cloud Phase 8 tested code candidate: `58e722707da51f93f1b66d092393e6dd729c5728`.

The Android candidate includes the Phase 8 management-release convergence fix plus an Android-15-safe, debug-only Device Owner reboot acceptance harness. The debug receiver exists only in `app/src/debug`; it is not part of the release source set.

Post-candidate commits only update evidence/acceptance tooling. In particular, the stable-signing export workflow now inspects the built release APK with `apkanalyzer` and requires the expected application ID/version, `debuggable=false`, `testOnly=true`, backup/cleartext protections, and absence of `Phase8RetirementHarnessReceiver` before the artifact can pass.

## Phase 8A — Android/device-side executed evidence

| Acceptance item | Executed evidence | Status |
|---|---|---|
| Build, unit tests, lint, release/R8, dependency lock | Run `41576522139`, job `125721181776` | PASS |
| Android security/privacy/supply-chain static gates | Run `41576522139`, job `125721181776` | PASS |
| Full retained Phase 2–8 instrumentation | Run `41576522139`, job `125722807919` | PASS |
| Reconnect/reboot/backlog/SOS recovery wiring | Run `41576522100`, job `125721181807` | PASS |
| Real AOSP Device Owner retirement lifecycle | Run `41576522269`, job `125721182371` | PASS |
| Phase 7 → 8 in-place upgrade continuity with same CI certificate | Run `41576522226`, job `125721183336` | PASS |
| Android ↔ cloud wire/replay/production contract | Run `41576522118`, job `125721181849` | PASS |
| Permanent-signing Phase 7 → 8 continuity | Run `41576522106`, job `125721181773` stopped at the required-secret gate because the persistent signing values are empty | BLOCKED — SIGNING SECRETS REQUIRED |
| Stable-signed testOnly Device Owner APK export | Run `41576522092`, job `125721181699` stopped at the required-secret gate because the persistent signing values are empty; artifact-level manifest checks are now present for the next run | BLOCKED — SIGNING SECRETS REQUIRED |

### Device Owner retirement proof

The current Device Owner workflow executes the real lifecycle on a fresh Android 15/AOSP emulator:

1. provision Brick as real Device Owner;
2. durably commit Stage 1 `DISARMED` while ownership is still present;
3. prove Brick is not in Android's stopped-package state at the reboot boundary;
4. reboot without launching/un-stopping Brick after Stage 1;
5. require automatic owner release and durable Stage 2 `MANAGEMENT_RELEASED` before post-reboot instrumentation;
6. require Stage 3 to request Android's uninstall UI only;
7. prove the package is actually removable after management release.

All seven steps passed in run `41576522269` / job `125721182371`.

This replaces the earlier instrumentation-at-the-reboot-boundary harness, which could interfere with Android 15 stopped-package/boot-broadcast behavior. Production retirement logic was also hardened so a successful synchronous `clearDeviceOwnerApp()` transaction is not rejected by an immediately stale read-back; the legacy `removeActiveAdmin()` fallback remains read-back gated because that API is asynchronous.

### Permanent signing blocker

The persistent-signing job explicitly showed these values empty at the candidate run:

- `BRICK_ANDROID_KEYSTORE_B64`
- `BRICK_ANDROID_KEYSTORE_PASSWORD`
- `BRICK_ANDROID_KEY_ALIAS`
- `BRICK_ANDROID_KEY_PASSWORD`
- `BRICK_ANDROID_SIGNING_CERT_SHA256`

The workflows intentionally fail closed when any value is absent. No temporary CI signing key may be substituted for this proof because that would not establish future Android update continuity.

## Phase 8B — cloud/server/end-to-end executed evidence

Cloud candidate `58e722707da51f93f1b66d092393e6dd729c5728` is green:

| Acceptance item | Executed evidence | Status |
|---|---|---|
| Phase 8 cloud security/durability/privacy/supply-chain + retained regression | Run `41570268597`, job `125701258778` | PASS |
| Android ↔ cloud wire/replay/production contract | Run `41570268579`, job `125701258788` | PASS |

The retained cloud gate covers the Phase 8 identity/revocation, isolation, authentication, idempotency, ordering, event-time/receive-time handling, backlog/SOS behavior, replay resistance, parent freshness truth, retention, migration/restore and deployment contracts implemented by Phase 8B.

## Current acceptance verdict

**All Phase 8 code/CI acceptance that does not require the private persistent Android signing identity is green.**

Phase 8 is still **NOT FORMALLY COMPLETE** for one external prerequisite only: the permanent Android signing identity must be configured, then both signing-dependent jobs must pass on the frozen Android application code (or a later candidate whose app-code diff is explicitly requalified).

After those two jobs pass, record:

- signing certificate SHA-256;
- signed APK SHA-256;
- exact Android source SHA;
- exact cloud source SHA;
- successful persistent-signing upgrade run;
- successful stable-signed APK export run;
- built-release APK manifest verification;
- final cross-branch acceptance state.

Physical OPPO/ColorOS endurance, OEM killing, GNSS/radio/sensor, thermal/battery and multi-day real-device qualification remain Phase 9, not Phase 8.
