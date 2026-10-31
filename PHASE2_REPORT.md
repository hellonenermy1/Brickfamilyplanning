# Brick V1 Phase 2 Progress / Verification Report

Date: 2026-10-31
Phase: 2 of 9 — Evidence Platform, Protocol & Durable Data Foundation
Current result: **SOURCE IMPLEMENTED + FURTHER HARDENED — PRIOR CLOUD/PROTOCOL LOCAL EVIDENCE RETAINED — FINAL PAIRED HEADS HOSTED-CI BLOCKED — NOT ACCEPTED**
Production qualification change: **none**

## Phase 2 boundary

Phase 2 implements the common evidence/data foundation only. It does not claim Phase 3+ particle positioning, Atlas learning, Signal Trust scoring, Witness Mesh, Ground Network, Shizuku evidence, learned places/routes or unified fusion are complete.

Exit gate remains:

> dummy evidence must be collected, durably persisted, survive restart/process loss, transmit securely, dedupe server-side, receive an exact ACK and disappear locally only after that ACK, without degrading Brick's live-location or SOS path.

Source existence or source review alone does not pass this gate.

## Current exact paired staging checkpoint

- Android `v1-p2-evidence-android`: `4ec37a2021bcd575cfefeadd58c968675965a8e7` — PR #7, draft/unmerged.
- Cloud `v1-p2-evidence-cloud`: `60697dc37cb325574e9bd22283e2b3dd1d847817` — PR #6, draft/unmerged.
- Phase 2 CI pins Android to the exact SHA above rather than the moving branch name and asserts the checked-out SHA in both Android jobs.

Neither branch is promoted into canonical `apk-download` / `main` until this exact paired checkpoint, or a deliberately newer paired checkpoint, receives real executed verification.

## Android foundation implemented and hardened

Android Phase 2 includes:

- canonical evidence/provider/family/capability/health/quality model;
- mandatory independence groups;
- adaptive sampling coordinator;
- separate encrypted `brick_evidence.db` journal using Brick's Android-Keystore-backed cipher;
- DB-owned transactional sequence allocation;
- pending/delivered/quarantined states and corruption quarantine;
- exact ACK by record ID + epoch + sequence;
- signed HTTPS evidence transport;
- evidence priority below safety, durable live-location and crash backlogs;
- dedicated network-constrained WorkManager evidence catch-up path;
- evidence-journal health telemetry;
- instrumentation source for protocol, restart, ACK, priority, sequence, pairing, journal recovery and retry behavior.

### DB-owned sequence allocation

`EvidenceJournal.appendNew()` transactionally allocates sequence, encrypts/inserts the record and advances allocator state in SQLite. SharedPreferences is only an observable cache. A stale/lost preference write therefore cannot cause sequence reuse after restart.

### Canonical paired identity boundary

Brick pairing creates IDs with `crypto.randomUUID()`. Android refuses to persist or drain evidence unless stored `deviceId` is canonical lowercase RFC-4122 version 4 / variant 2 and `apiBase` is present.

A source audit found older instrumentation still used the pre-hardening string `phase2-test-device`; those tests were corrected to use the same canonical v4 identity contract as production.

### Wire-order-safe pending queue

BREV requires strict `(epoch, sequence)` ordering. `EvidenceJournal.nextPending()` now reads pending rows using:

`ORDER BY epoch,seq,id`

Normal `appendNew()` insertion is already monotonic, but deterministic recovery/import tooling can insert exact records out of insertion order. The journal now guarantees that such a valid durable queue cannot become unsendable merely because row IDs are out of wire order.

Instrumentation source includes `testPendingRowsAreReadInWireOrderAfterRecoveryInsert`.

### Recoverable quarantine health

Quarantined records remain retained and counted as diagnostic history, but they no longer permanently force current journal health to false after Brick has isolated the bad row and recovered.

- fresh journal failures remain unhealthy for the existing 120-second hold;
- clock rollback during the hold is treated conservatively as still unhealthy;
- later successful journal operations can prove recovery;
- `EvidenceJournal.refreshHealth()` performs a deterministic `SELECT COUNT(*) FROM evidence` read probe without deleting pending/quarantined data;
- `HealthEvidence.collect()` calls this probe so a quiet device can recover an expired health latch even when no new evidence is written;
- `evidenceQuarantinedRecords` remains visible and is not cleared merely because current journal health recovered.

Instrumentation source covers both active-operation recovery and quiet read-probe recovery.

### Exact ACK deletion boundary

`EvidenceDispatcher` now exposes `drainDetailed()` with explicit stop reasons:

- `EMPTY`
- `BUDGET_EXHAUSTED`
- `CORE_BACKLOG`
- `TRANSPORT_FAILURE`
- `ACK_FAILURE`
- `IDENTITY_UNAVAILABLE`

Before deleting anything locally, the dispatcher independently reconstructs the expected ACK set from the exact pending records and requires the transport result to contain exactly that set. This means a buggy/custom transport cannot cross the deletion boundary with a missing, partial or wrong ACK even if it bypasses the production `EvidenceApi` response validation.

`drainIfSafe()` remains as a compatibility wrapper returning only the sent-record count.

### Non-starving recovery and failure backoff

Evidence uses a dedicated WorkManager chain rather than generic replaceable recovery work:

- initial evidence work uses `KEEP`;
- worker requires network connectivity;
- each run drains at most eight batches;
- safety/location/crash backlog is rechecked before every evidence batch;
- healthy backlog catch-up uses a short 2-second continuation;
- Core backlog uses a 10-second low-priority continuation;
- persistent transport/ACK/identity failure increments durable `evidenceUploadFailureStreak` and backs off 30, 60, 120, 240, 480, then 900 seconds maximum;
- successful progress/healthy conditions reset the failure streak;
- unexpected local worker/journal failure still uses WorkManager `Result.retry()`;
- Brick Core recovery still runs first and only rearms evidence afterward.

This avoids low-priority evidence waking the phone every 30 seconds forever during a persistent server/auth/ACK failure while preserving fast catch-up when the path is healthy.

Instrumentation source covers the ACK boundary, transport-vs-Core stop reasons and bounded retry policy.

## Evidence Batch v1

Evidence remains separate from Brick's existing 90-byte live-location V2 packet.

BREV v1 uses:

- magic `BREV` / `0x42524556`;
- version 1;
- batch UUID;
- max 24 records;
- max 2,048-byte provider payload per record;
- max 64-byte independence group;
- max 65,536-byte batch;
- strict epoch/sequence ordering;
- unique record UUIDs;
- bounded provider/family/capability/health/quality values;
- no trailing bytes;
- JavaScript-safe integer bounds for long fields;
- Android signed-Int epoch bound.

Shared Android/TypeScript golden vector remains:

`425245560100112233445566778899aabbccddeeff000112345678123456789abcdef01234567800000007000000000000002a00000000075bcd150000019a3b3636fbffff00000310000d64756d6d793a746573743a7363656e657068617365322d676f6c64656e`

## Cloud foundation implemented and hardened

`worker-v7` preserves prior worker behavior and delegates the evidence endpoint to `src/evidence-route.ts`.

Evidence route requires:

- canonical lowercase v4 Brick device ID;
- requester attempt rate limit;
- non-revoked paired device;
- exact evidence content type;
- bounded actual body bytes;
- valid P-256 device signature over exact bytes;
- authenticated device-specific rate limit only after signature proof;
- strict BREV validation;
- durable persistence before ACK.

Unsigned/bad-signature traffic therefore cannot consume the child's authenticated device bucket merely by knowing a device ID.

### Streaming body bound

The evidence route no longer uses `req.arrayBuffer()` for the body. It reuses Brick's existing `readBoundedBody()` helper with `EVIDENCE_MAX_BATCH_BYTES`.

- a declared oversized `Content-Length` is rejected immediately;
- missing/dishonest `Content-Length` is still bounded while streaming the actual bytes;
- more than 65,536 actual bytes returns 413 before signature verification, authenticated-device rate consumption or persistence.

The signed-route test source includes a 65,537-byte no-length request and asserts requester-only rate consumption and zero persistence.

### Android-compatible ECDSA format

Android `DeviceKeys.sign()` uses Java `SHA256withECDSA`, which emits ASN.1 DER. Brick Cloud converts DER ECDSA to 64-byte P1363 before Web Crypto verification.

The route test source uses `p1363ToDer()` / `signLikeAndroid()` for valid requests so the intended test boundary matches Android signature format rather than only Web Crypto's native raw format.

### Content-addressed raw evidence

Raw R2 keys are:

`evidence/raw/<sha256-device-key>/<batchId>-<batchSha>.brev`

Raw device ID is not exposed in the R2 key/metadata. Including `batchSha` prevents concurrent conflicting requests reusing one batch UUID from overwriting the same raw object.

### Atomic D1 identity claims

- new batch IDs use hard `INSERT INTO evidence_batches`;
- new evidence records use hard `INSERT INTO evidence_records`;
- exact records observed during preflight may be reused;
- batch-record links are hard inserted;
- no `INSERT OR IGNORE` is permitted for batch or evidence-record identity in the current CI contract.

A unique-constraint collision therefore rolls back the losing transaction rather than silently linking a batch to a competing record.

### Replay and bounded concurrency convergence

If every record in a fresh transport batch UUID already exists and exactly matches durable identity/metadata/payload hash, the server returns the exact ACK set with `duplicateRecords:true` without creating another batch row or raw object.

The newest ingest source also reconciles legitimate races once, without weakening conflict detection:

- if another request completes the exact same batch during our transaction window, return its already-durable exact ACK with `duplicateBatch:true, raced:true`;
- if a different valid batch wins one or more exact record identities, re-read and revalidate state and retry the current batch once to reuse those exact records and persist the remaining new records;
- changed content still becomes `EvidenceConflict`;
- if no D1 state changed, the original storage error is preserved rather than masked;
- retry depth is bounded to one race reconciliation pass.

Repository test source now contains exact same-batch, mixed exact-record and conflicting-record race scenarios.

## Schema / provisioning foundation

Migration `008_v1_phase2_evidence.sql` adds evidence batch/record/link/state/provider-health tables plus empty schema foundations for Atlas, witness, receivers, commands and refined history. These are not claims that later algorithms are implemented.

Phase 2 setup applies schema and 30-day `evidence/raw/` R2 retention before activating `worker-v7`.

## Verification evidence — exact level

Prior Phase 2 local execution remains useful evidence for the protocol and earlier Cloud route/persistence design:

- Android pure Kotlin model/protocol matched the shared golden vector and rejected unsafe integers/non-canonical UUIDs;
- Cloud TypeScript/SQLite/R2-style harness passed golden decode, persistence-before-ACK, retry/dedupe, collision handling, content-addressed raw storage, provider-health ordering and the original batch-ID race rollback;
- signed HTTP route harness passed P-256 signature/rate/revocation/malformed-protocol behavior;
- targeted local checks exercised the record-identity unique-constraint rollback and Android DER↔P1363 verification shape.

Observed earlier markers include:

- `LATEST ANDROID KOTLIN PHASE2 PROTOCOL PASS`
- `LOCAL_CURRENT_PHASE2_CLOUD_RACE_HARNESS_PASS`
- `LOCAL_CURRENT_PHASE2_SIGNED_ROUTE_PASS`

These results were earned on earlier Phase 2 heads. They are **not** being promoted as full execution proof of the final paired heads `60697dc3...` / `4ec37a20...`.

The final paired heads add streaming-body bounds, race convergence, exact dispatcher ACK-set validation, failure backoff, wire-order-safe pending reads and journal-health recovery. Test source and CI gates exist for these changes, but the complete latest Cloud suite and Android framework/instrumentation suite have not executed in the available environment.

## Deterministic CI contract

The current workflow pins:

`ANDROID_PHASE2_SHA=4ec37a2021bcd575cfefeadd58c968675965a8e7`

and asserts that exact SHA in both Android build and emulator jobs.

Cloud gates cover hard batch/record claims, content-addressed raw storage, replay dedupe, bounded race reconciliation, streaming body bounds, split rate limits, canonical IDs, Android-DER test format, protocol/persistence tests, signed-route tests and retained Phase 6 regressions.

Android gates cover the original live V2/90-byte packet, DB-owned evidence append, canonical paired identity, exact ACK-set guard, Core priority, wire-order pending reads, recoverable journal health, quiet-health probe, dedicated WorkManager architecture, bounded persistent-failure backoff and the corresponding instrumentation sources.

## Hosted CI blocker

Latest checked hosted run for the current exact Cloud head:

- run `41215211883`
- Cloud head `60697dc37cb325574e9bd22283e2b3dd1d847817`
- pinned Android head `4ec37a2021bcd575cfefeadd58c968675965a8e7`

Observed:

- Android compile/lint/dependency-lock: failure with `runner_id: 0`, empty runner name and `steps: []`;
- Cloud protocol/persistence/regression: failure with `runner_id: 0`, empty runner name and `steps: []`;
- Android instrumentation: skipped.

No runner executed source steps. This is an infrastructure/no-runner failure, **not** a source failure and **not** a pass.

## Exit-gate status

| Gate | State |
|---|---|
| canonical evidence/provider model | IMPLEMENTED |
| independence-group boundary | IMPLEMENTED |
| adaptive sampling coordinator | IMPLEMENTED |
| encrypted durable evidence journal | IMPLEMENTED |
| DB-owned monotonic sequence allocator | IMPLEMENTED |
| paired canonical-v4 identity guard | IMPLEMENTED |
| exact local ACK semantics + dispatcher ACK-set guard | IMPLEMENTED / FINAL ANDROID EXECUTION PENDING |
| wire-order-safe pending recovery | IMPLEMENTED / FINAL ANDROID EXECUTION PENDING |
| quarantine + quiet journal health recovery | IMPLEMENTED / FINAL ANDROID EXECUTION PENDING |
| safety/location/crash priority over evidence | IMPLEMENTED |
| dedicated evidence worker + bounded failure backoff | IMPLEMENTED / FINAL ANDROID EXECUTION PENDING |
| bounded separate Evidence Batch v1 | IMPLEMENTED |
| signed evidence transport/endpoint | IMPLEMENTED |
| streamed actual-byte request bound | IMPLEMENTED / FINAL CLOUD EXECUTION PENDING |
| atomic D1 batch and new-record claims | IMPLEMENTED; EARLIER/TARGETED LOCAL EVIDENCE RETAINED |
| content-addressed raw evidence storage | IMPLEMENTED; EARLIER LOCAL EVIDENCE RETAINED |
| record replay storage-amplification prevention | IMPLEMENTED; EARLIER LOCAL EVIDENCE RETAINED |
| bounded legitimate-race convergence | IMPLEMENTED / FINAL CLOUD EXECUTION PENDING |
| split unsigned/authenticated rate-limit buckets | IMPLEMENTED; EARLIER LOCAL ROUTE EVIDENCE RETAINED |
| Android DER ECDSA compatibility | IMPLEMENTED; TARGETED FORMAT EVIDENCE RETAINED / FINAL ROUTE EXECUTION PENDING |
| Android/TypeScript protocol golden parity | EARLIER LOCAL PASS |
| exact paired CI reproducibility | IMPLEMENTED — CLOUD WORKFLOW PINS ANDROID SHA |
| Android full compile/lint | BLOCKED — NO HOSTED RUNNER / NO LOCAL ANDROID SDK |
| Android instrumentation | BLOCKED — NO HOSTED RUNNER |
| final Cloud protocol/route/regression CI | BLOCKED — NO HOSTED RUNNER |
| live Cloudflare D1/R2 evidence endpoint | NOT DEPLOYED/VERIFIED |
| full dummy-provider Android → live Cloud exit gate | NOT YET PROVEN |
| canonical branches merged | NO — intentionally withheld |
| Phase 2 accepted | **NO** |

## Required continuation

Do not mark Phase 2 accepted or treat Phase 3 as unlocked yet.

When a runner actually executes:

1. run Phase 2 CI against Cloud `60697dc37cb325574e9bd22283e2b3dd1d847817` paired with Android `4ec37a2021bcd575cfefeadd58c968675965a8e7`, or deliberately repin both if a real defect requires another change;
2. require Cloud typecheck, both Phase 2 integration harnesses and retained regressions to pass;
3. require Android dependency lock, compile and lint to pass;
4. require Android emulator instrumentation to pass;
5. repair real failures rather than weakening gates;
6. only then merge PR #7 into `apk-download` and PR #6 into `main` with expected-head protection;
7. rerun canonical post-merge checks;
8. deploy/verify the evidence endpoint against real Cloudflare before claiming live integration;
9. mark Phase 2 accepted only if the full dummy-provider durability/secure-upload/exact-ACK/no-Core-degradation exit gate is actually observed.
