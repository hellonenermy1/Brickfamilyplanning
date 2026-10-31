# Brick Audit Status

Last updated: 2026-11-01

## Current acceptance state

Brick remains a **release candidate**, not production-qualified.

- Version: `0.6.0-phase6-rc`
- Version code: `6`
- Package: `com.brick.safety`
- Qualification: `candidate-not-real-device-qualified`
- V1 program: **Phase 1 ACCEPTED; Phase 2 ACCEPTANCE-READY IN SOURCE / REAL ANDROID + OPPO + HOSTED/LIVE GATES PENDING / NOT ACCEPTED; Phase 3 SOURCE-COMPLETE + ACCEPTANCE-READY / DEPENDENCY + HOSTED + DEVICE GATES PENDING / NOT ACCEPTED; Phases 4–9 not accepted**

No Phase 2 or Phase 3 runtime source is promoted to canonical `main` or `apk-download`.

## Canonical V1 artifacts

Contract: project `Yes.docx` version 1.

Phase 1:
- `PHASE1_BASELINE.md`
- `V1_ARCHITECTURE_FREEZE.md`
- `V1_PHASES.md`
- `V1_REQUIREMENTS.md`
- `PHASE1_SOURCE_COVERAGE.md`
- `PHASE1_REPORT.md`

Phase 2:
- `PHASE2_REPORT.md`
- `PHASE2_LOCAL_VERIFICATION.md`
- `PHASE2_CHECKPOINT_2026-11-01.md`
- `PHASE2_ACCEPTANCE_READINESS_2026-11-01.md`

Phase 3:
- `PHASE3_REPORT.md`

The duplicate source headings remain normalized as `23G-UI` and `23G-GROUND`.

## Repository / exact staging pairs

Canonical branches:
- `main` — Cloudflare/runtime
- `apk-download` — Android
- `audit-progress` — documentation/audit

Phase 2 staging:
- Cloud `v1-p2-evidence-cloud` / PR #6 / `1d880b703dd5d0c5f581926426a0db29e6c67b8b`
- Android `v1-p2-evidence-android` / PR #7 / `9d1d04532abc52b679075fe2e330c3d2daafab3b`

Phase 3 staging:
- Cloud `v1-p3-motion-positioning-cloud` / PR #9 / `3db7c6c54fcf4a6b35afa22e91076178fde29de9`
- Android `v1-p3-motion-positioning-android` / PR #10 / `48423e5ba84dd6273315581f6c101141e5eae9ac`

All four PRs remain draft/unmerged. Phase 3 deliberately targets the Phase 2 staging branches rather than bypassing the open Phase 2 dependency.

## Phase 1

**ACCEPTED.** Contract/baseline/architecture freeze only; no runtime feature claim.

## Phase 2 source state

The evidence/data foundation now includes:

- canonical evidence/provider/family/capability/health/quality + independence groups;
- bounded adaptive sampling interface;
- separate encrypted Android evidence journal using Brick's existing Keystore-backed cipher;
- DB-owned transactional sequence allocation;
- exact ACK deletion boundary and dispatcher ACK-set verification;
- strict ACK JSON numeric parsing;
- canonical v4 pairing/API-origin boundary;
- re-pair owner isolation;
- wire-order pending reads;
- safety/live-location/crash priority over evidence;
- dedicated WorkManager catch-up with bounded failure backoff;
- permanent 409 conflict isolation;
- recoverable journal health and bounded 30-day/2,048-row quarantine;
- separate BREV v1 protocol while preserving live-location V2 / 90-byte packet;
- signed + streaming-bounded evidence route;
- requester/device rate buckets split by authentication boundary;
- D1/R2 persist-before-ACK;
- privacy-reduced content-addressed raw evidence;
- hard transactional batch/new-record claims;
- exact retry/replay dedupe and bounded legitimate-race convergence;
- exact batch-link validation plus composite identity FK;
- rerun-safe batch-link identity triggers for older already-created Phase 2 schemas;
- 30-day raw evidence R2 lifecycle;
- test/CI/deploy gates for core persistence, link integrity and signed route;
- later-phase tables remain foundations only and do not claim later algorithms.

Phase 2 current execution markers:

- `PHASE2_CURRENT_CLOUD_ACCEPTANCE_HARNESS_PASS`
- `PHASE2_CURRENT_CLOUD_RERUN_TRIGGER_PASS`
- `PHASE2_CURRENT_ANDROID_KOTLIN_PROTOCOL_PASS`
- `PHASE2_CURRENT_ANDROID_ACK_JVM_STUB_PASS`
- `PHASE2_CURRENT_ANDROID_DISPATCHER_JVM_STUB_PASS`
- `PHASE2_CURRENT_ANDROID_QUARANTINE_SQL_PASS`

Those Android JVM/SQLite results are not Android framework, Keystore, WorkManager, emulator or OPPO/ColorOS proof.

Phase 2 hosted run/retry `41221221445` again failed before source steps; Android instrumentation was skipped. Treat it as neither pass nor source failure.

## Phase 3 source state

Phase 3 is now source-complete on its staging branches and implements:

- raw accelerometer/linear acceleration, gyro, magnetometer, rotation-vector and step evidence with bounded power profiles;
- learned odometry by motion mode/placement and zero-velocity correction;
- deterministic persistent multi-particle hypotheses with monotonic uncertainty and honest expiry;
- bounded learned route/path graph and signed private-map route cache;
- repeated magnetic sequences and repeated physical-landmark sequences only; single readings/events never create location truth;
- conservative fused-fix consistency gating before trusted-state/model training;
- encrypted atomic Phase 3 local state;
- route/magnetic/landmark aging and relearning;
- stationary route isolation so nearby roads cannot tug a stationary child position;
- phone-receipt-time route freshness rather than server-clock freshness;
- safe route-response IDs/mode masks/locality validation;
- privacy-safe Phase 3 health telemetry.

Explicit non-claim: Brick currently has route/path geometry, not generic building-wall polygons. It must not claim universal indoor wall avoidance when the required geometry is absent.

Executed Phase 3 evidence includes the earlier `PHASE3_PURE_CORE_ACCEPTANCE_PASS` for the pure core at its then-current implementation and a later focused Kotlin/JVM pass of the final consistency-guard logic including fail-open cases. Newer route/sequence TTL, state-store, route-parser and health hardening are source-reviewed/test-covered but not yet Android-framework executed.

Phase 3 CI run `41254615824` on Cloud `3db7c6c54fcf4a6b35afa22e91076178fde29de9` pins Android `48423e5ba84dd6273315581f6c101141e5eae9ac` and again failed before any prerequisite source steps; instrumentation was skipped. This remains an external execution blocker, not a source verdict.

## Phase 2 acceptance rule

Do **not** mark Phase 2 accepted or merge PR #6/#7 until all required gates actually pass:

1. hosted exact-pair Cloud + Android execution;
2. Android dependency-lock, compile, instrumentation APK compile and lint;
3. actual Android instrumentation of journal/restart/ACK/re-pair/Core-priority/conflict/quarantine behavior;
4. agreed physical OPPO/ColorOS Phase 2 qualification — JVM/emulator substitutes do not replace this gate;
5. exact Cloudflare production deployment plus deployed D1/R2/schema/retention/route verification;
6. canonical post-merge checks after the above are green.

## Phase 3 acceptance rule

Do **not** mark Phase 3 accepted or merge PR #9/#10 until:

1. Phase 2 is accepted first;
2. hosted exact-pair Phase 3 Cloud + Android execution passes;
3. Android dependency-lock/compile/lint and instrumentation actually execute and pass;
4. relevant physical OPPO/ColorOS sensor, stationary, walking/running, GNSS-loss, process-recovery and precise-return tests in `PHASE3_REPORT.md` pass;
5. any real failures are repaired without weakening uncertainty or anti-overconfidence rules.

Only then may Phase 3 become **ACCEPTED** and Phase 4 formally unlock.

## Remaining broader production blockers

Even after Phases 2–3 close, Brick is not production-qualified until later V1 phases and final release gates are complete, including stable Android signing, final authenticated parent testing, full Reno/ColorOS endurance/failure tests, measured resource usage and zero-manual-intervention proof.

## Audit principle

Source existence, local/JVM/SQLite logic execution, hosted CI, deployed Cloudflare state, Android framework behavior, physical-device behavior and production qualification are separate evidence layers. Brick advances only to the level directly supported by observed evidence.
