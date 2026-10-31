# Brick V1 Phase 2 Progress / Verification Report

Date: 2026-11-01
Phase: 2 of 9 — Evidence Platform, Protocol & Durable Data Foundation
Current result: **ACCEPTANCE-READY IN SOURCE / REAL ANDROID + OPPO + HOSTED/LIVE GATES PENDING / NOT ACCEPTED**
Production qualification change: **none**

## Exact frozen pair

- Cloud `v1-p2-evidence-cloud`: `1d880b703dd5d0c5f581926426a0db29e6c67b8b` — PR #6, draft/unmerged.
- Android `v1-p2-evidence-android`: `9d1d04532abc52b679075fe2e330c3d2daafab3b` — PR #7, draft/unmerged.
- Hosted run/retry: `41221221445` — no source steps executed; Android instrumentation skipped.

The Cloud workflow pins the exact Android SHA. Neither staging branch is merged until the full acceptance gate is genuinely satisfied.

## Phase 2 exit gate

Dummy evidence must be collected, durably persisted, survive restart/process loss, transmit securely, dedupe server-side, receive an exact ACK and disappear locally only after that ACK, without degrading Brick's live-location/SOS path.

The project acceptance standard also requires the agreed hosted CI, real OPPO/ColorOS qualification and Cloudflare production verification. JVM/SQLite substitutes are useful evidence but do not replace those gates.

## Implemented Android foundation

- canonical evidence/provider/family/capability/health/quality model and independence groups;
- bounded BREV v1 while preserving live-location V2 / 90-byte packet;
- encrypted `brick_evidence.db` using Brick's Android-Keystore-backed journal cipher;
- DB-owned transactional sequence allocation;
- canonical v4 device identity + canonical HTTPS API-origin guard;
- DB owner binding and re-pair quarantine isolation;
- pending read order `(epoch,sequence,id)`;
- exact ACK deletion with independent dispatcher ACK-set validation;
- strict ACK JSON parser that rejects strings, fractional values and out-of-range numeric fields;
- Core priority over evidence: SOS/safety/live-location/crash backlog preempts evidence;
- dedicated network-constrained WorkManager evidence drain;
- healthy 2-second catch-up, Core deferral >=60 seconds, bounded persistent failure backoff to 900 seconds;
- authenticated HTTP 409 conflict isolation so one permanent record conflict does not block later valid evidence;
- quarantine bounded to 30-day record age and 2,048 rows; pending evidence is never age-purged and sequence state is never reset;
- journal health recovery/read probe plus re-pair/conflict/retry/quarantine diagnostics;
- instrumentation source covering restart, persistence, sequence, ACK, priority, re-pair, conflict, quarantine and health recovery.

## Implemented Cloud foundation

- strict signed `/api/device/{id}/evidence` route in `worker-v7`, preserving earlier Worker behavior elsewhere;
- canonical v4 path and non-revoked paired-device authorization;
- P-256 signature over exact bounded bytes;
- streaming 65,536-byte request bound including no-length traffic;
- requester-attempt bucket before authentication, device bucket only after valid signature;
- strict BREV validation;
- D1/R2 durable persist-before-ACK;
- raw R2 key uses hashed device identity and exact batch SHA;
- hard transactional batch/new-record identity claims;
- exact-batch retry and same-record/fresh-batch dedupe without storage amplification;
- one bounded legitimate-race reconciliation pass; changed content remains `EvidenceConflict`;
- provider/current state ordered by durable epoch/sequence rather than wall clock;
- exact batch-link readback validation;
- fresh schema composite FK for `(device_id,record_id,epoch,sequence)` plus idempotent insert/update triggers so rerunning setup also protects an older already-created Phase 2 link table;
- 30-day `evidence/raw/` R2 lifecycle;
- CI and deployment workflows require protocol/persistence, link-integrity and signed-route harnesses before promotion/deployment;
- deployment verifier distinguishes invalid path validation from valid-v4 unauthorized authentication.

## Fresh current execution evidence

### Cloud

`PHASE2_CURRENT_CLOUD_ACCEPTANCE_HARNESS_PASS`

Current protocol/ingest/route logic was executed with D1-style transactional SQLite and R2-style storage. Verified protocol bounds, durable persistence, exact retry, fresh-batch record replay dedupe, conflict rejection, P-256 Android-DER signatures, split rate limits, 65,537-byte no-length rejection, canonical path behavior, HTTP 409 conflict semantics and current schema integrity.

`PHASE2_CURRENT_CLOUD_RERUN_TRIGGER_PASS`

An older weaker Phase 2 link-table schema was created deliberately, current schema 008 was rerun, and the idempotent identity trigger rejected a mismatched record epoch/sequence while accepting the exact identity.

### Android logic

`PHASE2_CURRENT_ANDROID_KOTLIN_PROTOCOL_PASS`

Current model/protocol compiled with Kotlin/JVM and passed the shared golden vector, round-trip, bounds and strict ordering checks.

`PHASE2_CURRENT_ANDROID_ACK_JVM_STUB_PASS`

Current ACK parser executed with only Android/network dependencies stubbed. Exact integral ACK passed; quoted/fractional/out-of-range fields and invalid API origins failed closed.

`PHASE2_CURRENT_ANDROID_DISPATCHER_JVM_STUB_PASS`

Current dispatcher executed with storage/Core/network fakes. Core backlog preempted transport; wrong ACK retained evidence; exact ACK removed it; multi-record 409 delivered valid neighbours and quarantined only the bad record.

`PHASE2_CURRENT_ANDROID_QUARANTINE_SQL_PASS`

Current cleanup SQL semantics executed in SQLite. Expired quarantine and overflow were purged, pending evidence remained, and sequence state was unchanged.

These Android JVM/SQLite results are not Android framework, emulator, Keystore, WorkManager or OPPO/ColorOS verification.

## Platform compatibility checks

- WorkManager 2.12.0 supports the `KEEP` and `APPEND_OR_REPLACE` unique-work policies used by the evidence scheduler.
- Cloudflare D1 uses SQLite semantics and enforces foreign keys by default; the composite-FK + trigger design matches the documented platform model.
- API 36 still contains the legacy instrumentation runner/test-case classes used by the test-only suite, although deprecated.

## Hosted CI blocker

Run `41221221445` was retried on the exact Cloud head. The Cloud and Android prerequisite jobs again failed before runner/source-step execution; Android instrumentation was skipped. GitHub Actions public service status was operational when rechecked. The connected API does not expose enough account/billing/entitlement detail to identify the exact repository-specific reason.

Treat this run as neither pass nor source failure.

## Exit-gate status

| Gate | State |
|---|---|
| evidence/provider/independence model | IMPLEMENTED |
| bounded BREV protocol + golden parity | CURRENT LOCAL PASS |
| encrypted durable Android journal | IMPLEMENTED / REAL ANDROID EXECUTION PENDING |
| DB-owned sequence + exact ACK deletion | IMPLEMENTED / PURE + STUB LOGIC PASS / REAL ANDROID PENDING |
| Core priority / non-starvation | IMPLEMENTED / DISPATCH LOGIC PASS / REAL ANDROID PENDING |
| re-pair isolation | IMPLEMENTED / REAL ANDROID PENDING |
| strict ACK parser | IMPLEMENTED / CURRENT JVM-STUB PASS |
| permanent conflict isolation | IMPLEMENTED / CURRENT DISPATCH LOGIC PASS / REAL ANDROID PENDING |
| bounded quarantine | IMPLEMENTED / CURRENT SQLITE SEMANTICS PASS / REAL ANDROID PENDING |
| signed/bounded Cloud route | IMPLEMENTED / CURRENT CLOUD PASS |
| D1/R2 persist-before-ACK + dedupe/race handling | IMPLEMENTED / CURRENT CLOUD PASS |
| fresh + rerun schema link integrity | IMPLEMENTED / CURRENT CLOUD/SQL PASS |
| hosted Android compile/lint/dependency lock | BLOCKED — JOB DOES NOT START |
| hosted Android instrumentation | BLOCKED — PREREQUISITE JOB DOES NOT START |
| physical OPPO/ColorOS qualification | NOT EXECUTED |
| exact Cloudflare production deployment verification | NOT EXECUTED |
| canonical branches merged | NO — deliberately withheld |
| Phase 2 accepted | **NO** |

## Required closeout

1. Restore a functioning GitHub-hosted execution path and run the exact frozen pair.
2. Require Android dependency-lock, compile, instrumentation APK build and lint to pass.
3. Run the Phase 2 Android instrumentation suite.
4. Execute the agreed real OPPO/ColorOS Phase 2 qualification; emulator/JVM proof is not a substitute.
5. Deploy the exact Cloud Phase 2 candidate to Cloudflare and retain deployed D1/R2/schema/retention/route verification evidence.
6. Repair any real failure rather than weakening gates.
7. Only then merge PR #6/#7, rerun canonical post-merge checks and mark Phase 2 `ACCEPTED`.

Until those external/runtime gates are available, Phase 2 is **source-complete and acceptance-ready, not accepted**. Phase 3 remains locked.
