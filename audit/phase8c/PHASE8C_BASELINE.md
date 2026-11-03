# Brick V1 — Phase 8C Android Deep Audit Baseline

Status: FROZEN — audit start
Date: 2026-11-03

Repository: `hellonenermy1/Brickfamilyplanning`
Audit branch: `v1-p8c-android-deep-audit`
Frozen implementation SHA: `204a141e90c078b6c2008778bd6c01bcbb8a4622`
Source branch inherited from: `v1-p8b-integrated-candidate`
Phase 8B gate: DONE / PASS
Phase 8A contract: 525 current requirements

## Android build identity

Observed from `app/build.gradle.kts` at the frozen SHA:

- namespace/applicationId: `com.brick.safety`
- compileSdk: 36
- minSdk: 29
- targetSdk: 35
- versionCode: 10
- versionName: `1.0.0-rc.1`
- normal V1 build: `BRICK_BETA=false`
- release build: `isDebuggable=false`
- release minification: enabled
- resource shrinking: enabled
- default optimized ProGuard file + `app/proguard-rules.pro`
- Java/Kotlin target: 17
- dependency locking: all configurations

Release signing is configured only when all four external environment inputs are present: keystore path, keystore password, alias and key password. No private signing material is committed by this build file.

Public permanent signing metadata from `signing/BRICK-v1-SIGNING-PUBLIC-MANIFEST.txt`:

- alias: `brick-v1`
- RSA-4096 / SHA256withRSA
- certificate SHA-256: `BF:DE:B4:97:14:FE:A7:14:53:6C:47:F8:12:6D:EE:D7:00:F0:0B:2D:D1:13:C5:C0:D4:52:99:2D:7E:D5:F7:90`

APK SHA-256: NOT YET FROZEN IN 8C. A source/CI pass is not a substitute for inspecting the final signed APK. Until an exact signed APK artifact is frozen and inspected, APK-only build/manifest/package/signature questions remain unverified.

## 8C scope / requirement families under examination

Android-owned or Android-critical current requirements are examined across these frozen families, with exact individual IDs inherited from the Phase 8A/8B ledgers:

`OPS, GOV, PLT, CUI, LOC, LOC1S, REACQ, MOT, FUS, ATL, WIT, DAT, SAFE, DPM, SHZ, REL, PRIO, WIFICTL, MAINT, DEEPOFF, DEPROV, NOTIFY2, SEC, ACT, QA` plus Android-side dependencies of `BE/LIVE/PORT` where the phone produces or consumes the protocol state.

The audit follows Phase 8C.1–8C.20 from the approved Phase 8 audit execution plan. Source existence from Phase 8B does not equal PASS in 8C.

## Entry evidence

Phase 8B integrated CI on this exact SHA:

- Android run `41635204427`: SUCCESS
- Cloud run `41635203816`: SUCCESS

These are prior evidence only. Phase 8C independently audits correctness, lifecycle, durability, security, races, resource behavior and failure recovery.

## Current known blockers at 8C start

- Signed release APK identity/hash not yet frozen for 8C.
- Real OPPO/ColorOS-only behavior is not source-verifiable and must be classified `IMPLEMENTED — DEVICE VERIFICATION PENDING` where applicable rather than inferred PASS.
- No Phase 8C findings recorded yet at baseline freeze.
