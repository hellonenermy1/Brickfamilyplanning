# Brick Audit Status

Last updated: 2026-11-01

## Current acceptance state

Brick remains a **release candidate**, not production-qualified.

- Version: `0.6.0-phase6-rc`
- Version code: `6`
- Package: `com.brick.safety`
- Qualification: `candidate-not-real-device-qualified`
- V1 program: **Phase 1 ACCEPTED; Phase 2 ACCEPTANCE-READY IN SOURCE / REAL ANDROID + OPPO + HOSTED/LIVE GATES PENDING / NOT ACCEPTED; Phase 3 SOURCE-COMPLETE + ACCEPTANCE-READY / DEPENDENCY + HOSTED + DEVICE GATES PENDING / NOT ACCEPTED; Phase 4 SOURCE-HARDENED STAGING / EXACT-PAIR CI + DEPENDENCY + DEVICE GATES PENDING / NOT ACCEPTED; Phases 5–9 not accepted**

No Phase 2, Phase 3 or Phase 4 runtime source is promoted to canonical `main` or `apk-download`.

## Canonical V1 artifacts

Contract: project Google Doc `Yes` / retained `Yes.docx` version 1.

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

Phase 4:
- `PHASE4_CONTRACT.md`
- `PHASE4_REQUIREMENT_MATRIX.md`
- `PHASE4_SOURCE_INVENTORY.md`
- `PHASE4_TEST_EVIDENCE.md`
- `PHASE4_REPORT.md`

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

Phase 4 staging:
- Cloud `v1-p4-atlas-trust-cloud` / PR #11 / `bfe99f59697944467b0ac11fc2253ca16b68fa0b`
- Android `v1-p4-atlas-trust-android` / `f6cfcc178ee8a4e7799c176e350c5b967c56069d`
- Exact-pair CI run `41267183265`

All staging PRs remain draft/unmerged. Later-phase staging does not override the acceptance dependency chain.

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

## Phase 4 source state

Phase 4 now has a hardened Environmental Atlas and Signal Trust candidate on its staging branches. The source includes:

- trusted-position-only learning;
- bounded encrypted/privacy-reduced environmental model;
- Wi-Fi RSSI distributions, relative ordering, co-occurrence, metadata, passive result consumption, route gradients and capability-gated RTT;
- BLE advertisement/environment fingerprinting and weak completed-empty-scan absence semantics;
- LTE/NR environment and snapshot dedupe;
- aggregate GNSS sky fingerprint/degradation evidence and snapshot dedupe;
- scoped Android NSD LAN evidence where discovery failure cannot become absence;
- passive network context plus loss/recovery transitions;
- broad activity/environment transition sequences and coarse zones;
- geographic/stability/freshness/quality/health/spoof/correlation-aware Signal Trust;
- cautious scoped negative evidence and automatic replacement/relearning;
- anti-double-counting rules: provider cache trains once and derived evidence inherits source correlation group.

Explicit Phase 4 partials remain recorded in `PHASE4_REQUIREMENT_MATRIX.md`: proper authorised trusted-companion presence, broader permission-sensitive LAN/gateway discovery, latency/packet-loss metrics without wasteful active probing, validated specific building/floor transitions, and persistent schedule priors. These are not silently relabelled complete.

Current exact-pair run `41267183265` has passed the Cloud provider/wire + retained Phase 2/3 regression job and Android dependency lock. Android final compile/lint and instrumentation are still pending at this audit revision. Physical OPPO/ColorOS Phase 4 evidence has not been executed.

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

## Phase 4 acceptance rule

Do **not** mark Phase 4 accepted or merge/promote PR #11 until:

1. Phase 2 and Phase 3 acceptance dependencies close first;
2. exact Phase 4 Cloud/Android pair executes and passes Cloud regressions, Android dependency lock, compile/lint and full retained + Phase 4 instrumentation;
3. common/copied SSID, moving BLE, replaced router/beacon/LAN device and changing-cell environment exit cases are verified at the required evidence level;
4. physical OPPO/ColorOS Wi-Fi/BLE/RTT/cellular/GNSS/background/relearning tests pass or capabilities are explicitly verified unsupported;
5. Phase 4 partial requirements are completed, explicitly reassigned by the canonical phase plan or recorded as verified unsupported rather than silently omitted;
6. no fix weakens uncertainty, independence, privacy, Core priority or the final-fusion Phase 5 boundary.

## Remaining broader production blockers

Even after Phases 2–4 close, Brick is not production-qualified until later V1 phases and final release gates are complete, including stable Android signing, final authenticated parent testing, full Reno/ColorOS endurance/failure tests, measured resource usage and zero-manual-intervention proof.

## Audit principle

Source existence, local/JVM/SQLite logic execution, hosted CI, deployed Cloudflare state, Android framework behavior, physical-device behavior and production qualification are separate evidence layers. Brick advances only to the level directly supported by observed evidence.
