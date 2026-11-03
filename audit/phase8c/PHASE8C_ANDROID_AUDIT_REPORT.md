# Brick V1 — Phase 8C Android Deep Audit Report

Date: 2026-11-03
Audit branch: `v1-p8c-android-deep-audit`
Frozen audit baseline: `204a141e90c078b6c2008778bd6c01bcbb8a4622`
Production runtime/test freeze: `967e5d5ceb7e485af997eb0f6380e9544cd39e79`

## Audit basis

This report implements Phase 8C.1–8C.20 of the approved Phase 8 Full Audit Execution Plan. Phase 8B source existence is not treated as Phase 8C proof. Findings remain historical in the findings/addendum files; closure is recorded only in `PHASE8C_RETEST_EVIDENCE.md` after the original failure mode is exercised.

The production freeze was checked against the later CI/harness head: changes after `967e5d5...` are workflow files and `app/src/debug` resource-harness code only. No later `app/src/main` production code is part of the claimed freeze.

## 8C.1–8C.20 execution summary

| Slice | Area | Result |
|---|---|---|
| 8C.1 | baseline/build identity | COMPLETE |
| 8C.2 | build/dependency/R8/lint contracts | CI PROVEN; final deep-audit run recorded separately |
| 8C.3 | manifest/exported surface | CI PROVEN; signed-APK-only identity still blocked by missing signing secrets |
| 8C.4 | lifecycle/recovery/service model | SOURCE + EMULATOR PROVEN; OPPO lifecycle behavior moves to Phase 9 |
| 8C.5 | local durable journal | EMULATOR PROVEN |
| 8C.6 | measured location/freshness/reacquisition | EMULATOR PROVEN |
| 8C.7 | activity/motion/consistency | EMULATOR PROVEN |
| 8C.8 | Atlas/private route evidence | EMULATOR PROVEN |
| 8C.9 | fusion/fallback/coarse network | EMULATOR PROVEN |
| 8C.10 | exact ACK/local deletion ordering | EMULATOR PROVEN |
| 8C.11 | backlog/scale/network chaos | EMULATOR PROVEN; physical 7–14 day qualification remains Phase 9 |
| 8C.12 | SOS/high fall/I'M SAFE durability | EMULATOR PROVEN |
| 8C.13 | Device Owner/policy provenance/command validation | API29 + API35 EMULATOR PROVEN |
| 8C.14 | Shizuku optional-provider isolation/timeout | UNIT + EMULATOR + SOURCE CONTRACT PROVEN |
| 8C.15 | maintenance/Deep Off/deprovision/purge | EMULATOR + SOURCE CONTRACT PROVEN |
| 8C.16 | crypto/secrets/device identity | SOURCE + EMULATOR PROVEN; signed RC artifact blocked externally |
| 8C.17 | Android attack surface | SOURCE/CI PROVEN |
| 8C.18 | resource envelope | Dedicated resource report is authoritative |
| 8C.19 | races/concurrency | SOURCE + FAULT-INJECTION/EMULATOR PROVEN |
| 8C.20 | privacy/log hygiene | CI PROVEN — run `41669979913` SUCCESS |

## Principal execution evidence

- Android 15 expanded emulator torture: run `41670141287`, job `126036000428` — SUCCESS. Build, clean emulator boot, all configured Phase 8C instrumentation classes, evidence capture and upload passed.
- Android 10 real Device Owner policy regression: run `41665283987`, job `126018817998` — SUCCESS.
- Privacy/log hygiene: run `41669979913` — SUCCESS.
- Signed RC evidence workflow: run `41668964798` — BLOCKED before build because the five required repository signing secrets are absent. This is not a certificate mismatch or APK failure.

## Finding status

P8C-001 through P8C-012 are retained unchanged in the historical findings files. P8C-009 is already VERIFIED CLOSED. The final retest ledger records closure of the remaining remediated findings using the expanded emulator/deep-audit evidence.

## Device-only classification

The following are not inferred from emulator/source evidence and belong to Phase 9 physical qualification: ColorOS process/background behavior, OEM battery optimization, physical GNSS/radio/sensor power, real reboot/update behavior, long unattended duration, and OPPO-specific Device Owner interactions. Their correct classification at Phase 8C is `IMPLEMENTED — DEVICE VERIFICATION PENDING`, not PASS or FAIL.

## Current audit conclusion

The Android source/runtime deep audit is complete apart from final evidence bookkeeping and the signed-current-RC artifact gate. Phase 8C must not be declared fully PASS until the permanent signing secrets are restored to GitHub Actions and the current `1.0.0-rc.1` APK is built and inspected by the dedicated 8C signed-RC workflow.
