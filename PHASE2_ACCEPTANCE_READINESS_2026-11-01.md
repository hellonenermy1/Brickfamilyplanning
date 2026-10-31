# Brick V1 Phase 2 — Acceptance Readiness Evidence

Date: 2026-11-01

## Decision

Phase 2 is **ACCEPTANCE-READY IN SOURCE, BUT NOT ACCEPTED**.

Do not merge PR #6 or PR #7 and do not relabel Phase 2 `ACCEPTED` until the mandatory Android/OPPO execution and hosted/live gates below actually run and pass. This file does not weaken the acceptance contract.

## Exact frozen staging pair

- Cloud `v1-p2-evidence-cloud`: `1d880b703dd5d0c5f581926426a0db29e6c67b8b`
- Android `v1-p2-evidence-android`: `9d1d04532abc52b679075fe2e330c3d2daafab3b`
- Cloud PR #6: draft/unmerged
- Android PR #7: draft/unmerged

## Hosted execution blocker

GitHub Actions run `41221221445` was retried on the exact Cloud head. Both prerequisite jobs again completed without source steps/runner execution and Android instrumentation was skipped. This is not a source pass and not evidence of a source failure. GitHub Actions service status was operational when rechecked, so the repeated no-step failure appears specific to the repository/account execution path; the exact cause was not available through the connected GitHub API.

## Fresh execution evidence collected outside hosted Actions

### Current Cloud acceptance harness — PASS

Marker: `PHASE2_CURRENT_CLOUD_ACCEPTANCE_HARNESS_PASS`

Executed against the current Phase 2 protocol/ingest/route logic and current schema semantics. Covered:

- BREV v1 protocol parsing and ordering;
- durable SQLite/D1-style transactional persistence before ACK;
- exact batch retry;
- same-record/fresh-batch replay dedupe without raw-storage amplification;
- changed record/content conflict rejection;
- current exact-link foreign-key/trigger enforcement;
- `PRAGMA foreign_key_check` consistency;
- real WebCrypto P-256 signing and Android-style DER ECDSA verification;
- requester-attempt vs authenticated-device rate bucket ordering;
- exact signed retry without additional raw R2-style write;
- bad signature does not consume the authenticated device bucket;
- no-length 65,537-byte request is rejected at the bounded-body layer;
- canonical device-path validation;
- signed durable identity conflict becomes HTTP 409 without extra durable growth.

### Current rerun-safe schema trigger simulation — PASS

Marker: `PHASE2_CURRENT_CLOUD_RERUN_TRIGGER_PASS`

A SQLite database was deliberately created with the earlier weaker Phase 2 batch-link table, then the current schema was rerun. The current idempotent triggers rejected a mismatched `(device,recordId,epoch,sequence)` link and accepted the exact identity. This proves rerunning the migration does not rely on `CREATE TABLE IF NOT EXISTS` retrofitting a foreign key.

### Current Android model/protocol — PASS

Marker: `PHASE2_CURRENT_ANDROID_KOTLIN_PROTOCOL_PASS`

The current `EvidenceModel`/`EvidenceProtocol` logic compiled with Kotlin/JVM and passed the shared BREV golden vector, round-trip, wire bounds and strict ordering checks.

### Current Android strict ACK parser — PASS WITH JVM STUB BOUNDARY

Marker: `PHASE2_CURRENT_ANDROID_ACK_JVM_STUB_PASS`

The current ACK parsing/network source compiled with Android/network dependencies stubbed and the deletion-authorizing parser was executed. It accepted exact integral ACKs and rejected quoted numeric fields, fractional fields, zero/out-of-range sequence, negative epoch and invalid API origins. This is useful source execution, but is **not** Android framework/device proof.

### Current Android dispatcher priority/deletion logic — PASS WITH JVM STUB BOUNDARY

Marker: `PHASE2_CURRENT_ANDROID_DISPATCHER_JVM_STUB_PASS`

The current dispatcher logic was executed with Android storage/Core/network dependencies replaced by fakes. Verified:

- Core backlog preempts evidence before transport;
- wrong ACK never deletes pending evidence;
- exact ACK removes the exact pending record;
- multi-record 409 isolation delivers valid neighbours and quarantines only the independently conflicting record.

This is logic execution, not Android framework/device proof.

### Current quarantine SQL semantics — PASS

Marker: `PHASE2_CURRENT_ANDROID_QUARANTINE_SQL_PASS`

Executed the current cleanup SQL semantics directly against SQLite. Verified:

- quarantined records older than 30 days purge;
- quarantine hard cap is 2,048 rows;
- even very old pending evidence is never age-purged;
- evidence sequence state survives cleanup and is not reset/reused.

## Platform compatibility verified from current vendor documentation

- AndroidX WorkManager 2.12.0 is current/released and `ExistingWorkPolicy.APPEND_OR_REPLACE` is a supported policy for unique one-time work. It drops failed/cancelled prerequisites and starts a usable new chain, matching Brick's successor-worker design.
- Cloudflare D1 uses SQLite semantics, supports trigger behavior, and enforces foreign keys by default. The current composite-FK + idempotent trigger design is compatible with D1's documented model.
- Android's legacy `InstrumentationTestRunner` / `InstrumentationTestCase` remain present in current API documentation, although deprecated. Their use is test-only; Brick runtime does not depend on them.

## Source acceptance audit result

No new Phase 2 source correctness blocker was found after the current hardening. The evidence foundation now has explicit protections for:

- Core priority and bounded retry;
- exact durable sequence ownership;
- re-pair isolation;
- exact ACK deletion boundary;
- malformed/coerced ACK rejection;
- permanent-conflict isolation;
- bounded quarantine retention;
- encrypted journal path using the existing Brick journal cipher;
- bounded signed HTTP request/response handling;
- replay/idempotency and storage-amplification resistance;
- concurrent batch/record claim races;
- schema link integrity on fresh and rerun migrations;
- raw evidence retention and privacy-reduced object naming;
- deterministic paired Cloud/Android source identity.

## Mandatory gates still required before ACCEPTED

1. A real GitHub/Android build execution of the exact frozen pair must run rather than fail before a runner is assigned.
2. Android dependency-lock verification, debug app compile, instrumentation APK compile and lint must actually pass.
3. Android instrumentation must actually execute the encrypted journal/process-reopen/ACK/Core-priority/re-pair/conflict/quarantine tests.
4. The required real OPPO/ColorOS Phase 2 qualification must execute and pass; emulator/JVM substitutes do not replace this gate.
5. The exact Phase 2 Cloud candidate must pass the required Cloudflare production deployment/verification gate before closeout.
6. Only after those gates pass may PR #6/#7 be merged and Phase 2 be marked `ACCEPTED`.

## Current status

**SOURCE IMPLEMENTED + HARDENED + CURRENT CLOUD LOGIC EXECUTED + CURRENT ANDROID PURE/JVM/SQL LOGIC EXECUTED / REAL ANDROID + OPPO + HOSTED/LIVE GATES PENDING / NOT ACCEPTED.**

Phase 3 remains locked until Phase 2 acceptance is truthfully achieved.
