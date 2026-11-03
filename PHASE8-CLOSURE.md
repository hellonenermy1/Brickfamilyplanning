# Brick V1 — Phase 8 Closure

Current state: **INTEGRATION VERIFIED — FORMAL PHASE 8 CLOSURE BLOCKED ONLY BY PERSISTENT ANDROID SIGNING**.

## Frozen tested candidates

- Android code candidate: `ced2a0c6d040e4cca6f5012a0a3aeab2eb7f5ad8`.
- Cloud code candidate: `58e722707da51f93f1b66d092393e6dd729c5728`.

Commits after the Android code candidate only update Phase 8 evidence/acceptance tooling; they do not change application source or runtime behavior. The stable-signing export gate was additionally hardened to inspect the built release APK's merged manifest/package/version/debuggable state and prove the debug-only retirement harness is absent before accepting the artifact.

## Phase 8A — Android acceptance state

Executed and green on the frozen Android candidate:

- build, unit tests, lint and release/R8;
- dependency lock and supply-chain gate;
- Android security/privacy gates;
- full retained Phase 2–8 instrumentation;
- reconnect/reboot/backlog/SOS recovery contract;
- Phase 7 → Phase 8 in-place same-certificate CI upgrade continuity;
- Android ↔ cloud final production contract;
- real AOSP Device Owner lifecycle: provision → durable DISARMED → reboot → automatic durable MANAGEMENT_RELEASED → uninstall request → package removable.

The previous Device Owner acceptance instability was resolved without weakening the lifecycle. The acceptance harness no longer uses instrumentation at the Stage 1 → reboot boundary, because that can alter Android stopped-package behavior. Production retirement convergence was also hardened so the durable stage follows a successful Device Owner clear operation rather than depending on a potentially stale immediate read-back.

## Phase 8B — cloud acceptance state

Cloud candidate `58e722707da51f93f1b66d092393e6dd729c5728` is fully green for its Phase 8 hardening/regression gate and the final Android↔cloud production contract.

No further Phase 8B development is currently justified by executed evidence.

## Sole remaining Phase 8 blocker

The repository does not currently provide the permanent Android signing identity required by the two release-acceptance workflows. Both fail at their explicit required-secret gates before building:

1. persistent-signing Phase 7 → Phase 8 upgrade continuity;
2. stable-signed testOnly Device Owner APK export.

Required GitHub Actions secrets:

- `BRICK_ANDROID_KEYSTORE_B64`
- `BRICK_ANDROID_KEYSTORE_PASSWORD`
- `BRICK_ANDROID_KEY_ALIAS`
- `BRICK_ANDROID_KEY_PASSWORD`
- `BRICK_ANDROID_SIGNING_CERT_SHA256`

Do not replace this with a temporary/generated CI key. The point of this gate is to prove the same permanent certificate can sign both the retained Phase 7 baseline and Phase 8 and therefore preserve Android update continuity.

## Formal Phase 8 completion rule

Phase 8 may be marked **COMPLETE / PHASE 9 READY** only after both signing-dependent jobs pass and the final evidence records:

- exact signing certificate SHA-256;
- exact signed APK SHA-256;
- exact Android source SHA;
- exact cloud source SHA;
- successful persistent-signing upgrade run;
- successful stable-signed APK export run;
- release APK manifest/package/version/testOnly/security verification;
- final Android↔cloud contract state.

Until then, the truthful status is **integration verified, signing blocked** — not production-signed and not formally closed.

## Phase 9 boundary

Physical OPPO/ColorOS qualification is deliberately not a Phase 8 blocker. Phase 9 covers real-device/OEM behavior including background survival, restart/reboot recovery, GNSS/radio/sensors, ColorOS process killing and battery restrictions, thermal/battery/network usage, offline/online recovery and multi-day endurance.

That boundary matches Brick's V1 rule: reliability claims are based on measured evidence, and real OPPO behavior must be proven on real OPPO hardware rather than inferred from emulator CI.
