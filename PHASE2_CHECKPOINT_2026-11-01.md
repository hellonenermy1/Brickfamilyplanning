# Brick V1 Phase 2 continuation checkpoint — 2026-11-01

User request: continue Phase 2 without restarting, then make it accepted and ready.

## Exact frozen staging pair

- Cloud `v1-p2-evidence-cloud`: `1d880b703dd5d0c5f581926426a0db29e6c67b8b`
- Android `v1-p2-evidence-android`: `9d1d04532abc52b679075fe2e330c3d2daafab3b`
- Cloud PR #6: draft/unmerged
- Android PR #7: draft/unmerged
- Latest hosted run/retry: `41221221445`

Phase 2 is **ACCEPTANCE-READY IN SOURCE, BUT NOT ACCEPTED**. No Phase 2 runtime source is merged into canonical `main` or `apk-download`. Phase 3 remains locked.

## Hardening completed before this freeze

### Android

- encrypted evidence journal with DB-owned transactional sequence allocation;
- exact ACK deletion boundary plus independent dispatcher ACK-set verification;
- canonical v4 paired identity and canonical HTTPS API-origin guard;
- re-pair isolation so old backlog cannot upload under a new child identity;
- strict ACK JSON parsing: quoted/fractional/out-of-range numeric fields cannot authorize deletion;
- pending rows read in `(epoch,sequence,id)` wire order;
- permanent HTTP 409 conflict isolation so one bad record cannot block valid later evidence;
- evidence remains below SOS/safety/live-location/crash backlog;
- dedicated network-constrained WorkManager drain with fast healthy catch-up, 60-second Core deferral and bounded 30→900-second failure backoff;
- quarantine is bounded automatically: 30-day record-age retention, 2,048-row ceiling, six-hour cleanup cadence, lifetime purge diagnostics;
- quarantine cleanup never age-purges pending evidence and never resets sequence state;
- journal-health recovery and quiet-device read probe;
- instrumentation source covers restart, sequence recovery, exact/wrong ACK, malformed ACK JSON, Core priority, re-pair, corrupt origin, conflict isolation, journal recovery and quarantine expiry.

### Cloud

- separate strict BREV v1 evidence protocol while preserving Brick Core live V2;
- canonical v4 device route, paired/revoked device check and P-256 signature verification;
- streaming 65,536-byte request bound including no-length/chunked traffic;
- requester-attempt and authenticated-device rate buckets separated;
- D1/R2 persist-before-ACK;
- privacy-reduced/content-addressed raw R2 object key using hashed device identity + exact batch SHA;
- hard transactional batch and new-record claims;
- exact batch retry and same-record/fresh-batch dedupe without storage amplification;
- bounded one-pass legitimate race reconciliation; changed content fails closed;
- provider health/current state ordered by durable epoch/sequence;
- fresh schema structurally binds batch links to exact `(device,recordId,epoch,sequence)` identity via composite FK;
- rerun-safe insert/update triggers retrofit the same exact-link rule onto an older already-created Phase 2 table;
- application-level retry validation remains as defense in depth;
- Phase 2 CI and production deploy workflow both require core persistence, link-integrity and signed-route harnesses;
- deployment verifier separately tests invalid device-path validation and valid-v4 unauthorized authentication;
- raw evidence lifecycle remains 30 days.

## Fresh execution evidence on the frozen/current logic

### Cloud — PASS

`PHASE2_CURRENT_CLOUD_ACCEPTANCE_HARNESS_PASS`

Covered BREV validation, D1-style transactional persistence, exact retry, replay dedupe, conflict rejection, schema/FK/trigger integrity, real P-256 Android-DER signature verification, attempt/device rate ordering, exact signed retry, bad signature behavior, 65,537-byte no-length rejection, canonical path validation and HTTP 409 conflict behavior.

`PHASE2_CURRENT_CLOUD_RERUN_TRIGGER_PASS`

Simulated an interrupted earlier Phase 2 database with the weaker batch-link table, reran current schema 008, and proved the current idempotent triggers reject a mismatched link while allowing the exact identity.

### Android pure/current logic — PASS within stated boundaries

`PHASE2_CURRENT_ANDROID_KOTLIN_PROTOCOL_PASS`

Current evidence model/protocol compiled under Kotlin/JVM and passed the shared BREV golden vector, round-trip, bounds and ordering checks.

`PHASE2_CURRENT_ANDROID_ACK_JVM_STUB_PASS`

Current `EvidenceApi` ACK parsing compiled with only Android/network dependencies stubbed. Exact integral ACKs passed; string/fractional/out-of-range deletion fields and invalid API origins failed closed.

`PHASE2_CURRENT_ANDROID_DISPATCHER_JVM_STUB_PASS`

Current dispatcher logic executed with storage/Core/network dependencies replaced by fakes. Core backlog preempted evidence, wrong ACK retained data, exact ACK removed it, and a batch 409 isolated only the independently conflicting record.

`PHASE2_CURRENT_ANDROID_QUARANTINE_SQL_PASS`

Current quarantine cleanup SQL semantics were executed directly in SQLite. Expiry and the 2,048-row cap worked, old pending records remained, and sequence state was unchanged.

These JVM/SQLite checks are real execution evidence for the logic they exercised. They are **not** Android framework, emulator, Keystore, WorkManager or OPPO/ColorOS proof.

## Current platform compatibility checks

- AndroidX WorkManager 2.12.0 is released and supports the `KEEP` and `APPEND_OR_REPLACE` unique-work policies used by Brick's evidence scheduler.
- Cloudflare D1 uses SQLite semantics and enforces foreign keys by default; the current composite-FK/trigger design is compatible with documented D1 behavior.
- Android API 36 still contains the legacy platform `InstrumentationTestRunner` / `InstrumentationTestCase` used by these test-only cases, although deprecated. Brick runtime does not depend on that runner.

## Hosted execution blocker

Run `41221221445` was retried on the exact Cloud head. It again produced no source execution:

- Cloud protocol/persistence/regression: failed before source steps / no runner execution;
- Android compile/lint/dependency-lock: same;
- Android instrumentation: skipped.

GitHub Actions public service status was operational when rechecked. The repeated no-step failure therefore appears specific to this repository/account execution path, but the connected API does not expose enough billing/entitlement/annotation detail to state the exact cause. Do not mislabel it as a source failure.

## Mandatory remaining acceptance gates

The project acceptance contract must not be weakened to make the status look green. Phase 2 still requires:

1. real hosted/Android execution of the exact frozen pair rather than a zero-step run;
2. exact Android dependency-lock verification, app compile, instrumentation APK compile and lint;
3. actual Android instrumentation of encrypted SQLite/Keystore journal reopen, sequence, ACK, re-pair, Core priority, conflict and quarantine behavior;
4. the required physical OPPO/ColorOS Phase 2 qualification — JVM/emulator substitutes are not sufficient for that requirement;
5. required exact Cloudflare production deployment and deployed D1/R2/schema/retention/route verification;
6. after those pass, merge PR #6 and PR #7, rerun canonical post-merge checks and only then mark Phase 2 `ACCEPTED`.

## Final status for this continuation

**SOURCE IMPLEMENTED + HARDENED + CURRENT CLOUD EXECUTION PASS + CURRENT ANDROID PURE/JVM/SQL LOGIC PASS / REAL ANDROID + OPPO + HOSTED/LIVE ACCEPTANCE GATES PENDING / NOT ACCEPTED.**

Detailed evidence is also recorded in `PHASE2_ACCEPTANCE_READINESS_2026-11-01.md`.
