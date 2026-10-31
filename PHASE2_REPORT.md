# Brick V1 Phase 2 Progress / Verification Report

Date: 2026-10-31
Phase: 2 of 9 — Evidence Platform, Protocol & Durable Data Foundation
Current result: **SOURCE IMPLEMENTED + HARDENED — CLOUD CORE/SIGNED ROUTE LOCALLY VERIFIED — FINAL RECORD-RACE + ANDROID-DER INVARIANTS TARGET-VERIFIED — HOSTED CI BLOCKED — NOT ACCEPTED**
Production qualification change: **none**

## Phase 2 boundary

Phase 2 implements the common evidence/data foundation only. It does not claim Phase 3+ particle positioning, Atlas learning, Signal Trust scoring, Witness Mesh, Ground Network, Shizuku evidence, learned places/routes or unified fusion are complete.

Exit gate remains:

> dummy evidence must be collected, durably persisted, survive restart/process loss, transmit securely, dedupe server-side, receive an exact ACK and disappear locally only after that ACK, without degrading Brick's live-location or SOS path.

Source existence or source review alone does not pass this gate.

## Current staging snapshot

Snapshot at this report update:

- Android `v1-p2-evidence-android`: `389bc8744341aebcc42f74f79403fd2b3d5d5873` — PR #7, draft/unmerged.
- Cloud `v1-p2-evidence-cloud`: `20a459f11f99195a0c56b3c1d82f2e7659976859` — PR #6, draft/unmerged.

These are staging snapshots, not permanent release identifiers. Neither branch is promoted into canonical `apk-download` / `main` until the final paired heads receive real hosted verification.

## Android foundation implemented

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
- instrumentation source for protocol, restart, ACK, priority, sequence and pairing behavior.

### DB-owned sequence allocation

`EvidenceJournal.appendNew()` transactionally allocates sequence, encrypts/inserts the record and advances allocator state in SQLite. SharedPreferences is only an observable cache. A stale/lost preference write therefore cannot cause sequence reuse after restart.

### Non-starving recovery

Evidence uses its own WorkManager chain rather than generic replaceable recovery work:

- initial evidence work uses `KEEP`;
- worker requires network connectivity;
- each run drains a bounded number of batches;
- safety/location/crash backlog is rechecked before every evidence batch;
- remaining evidence schedules one successor using `APPEND_OR_REPLACE`;
- Brick Core recovery still runs first and only rearms evidence afterward.

### Paired identity boundary

Brick's server pairing creates IDs using `crypto.randomUUID()`. Android refuses to persist or drain evidence unless stored `deviceId` is canonical lowercase RFC-4122 version 4 / variant 2 and `apiBase` is present. Corrupt/path-like or non-v4 IDs therefore cannot create an unsendable evidence backlog or unsafe URL path.

Instrumentation source covers unpaired/API-base cases plus path-like corrupt IDs and canonical-looking non-v4 UUIDs.

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

Shared Android/TypeScript golden vector remains byte-identical:

`425245560100112233445566778899aabbccddeeff000112345678123456789abcdef01234567800000007000000000000002a00000000075bcd150000019a3b3636fbffff00000310000d64756d6d793a746573743a7363656e657068617365322d676f6c64656e`

## Cloud foundation implemented and hardened

`worker-v7` preserves prior worker behavior and adds only the evidence route. The signed evidence handler is isolated in `src/evidence-route.ts` so the actual request path can be executed in a focused integration harness.

Evidence route requires:

- canonical lowercase v4 Brick device ID;
- requester attempt rate limit;
- non-revoked paired device;
- exact evidence content type/body bounds;
- valid P-256 device signature over exact bytes;
- authenticated device-specific rate limit only after signature proof;
- strict BREV validation;
- durable persistence before ACK.

Unsigned/bad-signature traffic therefore cannot consume the child's authenticated device bucket merely by knowing a device ID.

### Android-compatible ECDSA format

Android `DeviceKeys.sign()` uses Java `SHA256withECDSA`, which emits ASN.1 DER. Brick Cloud already converts DER ECDSA to 64-byte P1363 before Web Crypto verification. The Phase 2 signed-route test now deliberately converts locally generated P1363 signatures to DER (`p1363ToDer` / `signLikeAndroid`) before sending valid requests, so the test source exercises the Android-format boundary rather than only Web Crypto's native raw signature format.

### Content-addressed raw evidence

Raw R2 keys are:

`evidence/raw/<sha256-device-key>/<batchId>-<batchSha>.brev`

The raw device ID is not exposed in the R2 key/metadata. Including `batchSha` also means concurrent conflicting requests that reuse one batch UUID write different raw objects instead of overwriting each other.

### Atomic D1 batch-ID claim

The first D1 statement is a hard `INSERT INTO evidence_batches`, not `INSERT OR IGNORE`.

A concurrent request that already claimed the same `(deviceId,batchId)` makes the losing transactional D1 batch fail and roll back all later evidence-record/link/state writes. The losing raw object is unreferenced and expires under bounded raw-evidence retention.

### Atomic new-record claims

Records that were already present and matched exactly during preflight may be reused. Records that were absent during preflight now use hard `INSERT INTO evidence_records`, and batch-record links are hard inserted as well.

This closes the record-level race where a competing signed batch could previously claim the same `(device,epoch,sequence)` or record ID after preflight and before commit. A unique-constraint collision now rolls back the entire losing batch instead of silently linking to the competitor's record.

### Record replay protection / storage amplification prevention

If every record in a fresh transport batch UUID already exists and exactly matches durable record identity/metadata/payload hash, the server returns the exact ACK set immediately with `duplicateRecords:true`.

It does **not** create another `evidence_batches` row or raw R2 object.

### Idempotency and collision behavior

- exact same batch retry → exact ACK, no R2 rewrite;
- same durable records under a new batch UUID → exact ACK, no new durable storage;
- record ID/epoch/sequence collision with changed content → conflict;
- accepted batch UUID reused with changed bytes → conflict;
- concurrent batch identity claim → losing D1 transaction rolls back;
- concurrent new-record identity claim → losing D1 transaction rolls back;
- provider health orders by durable epoch/sequence, not device wall clock;
- newly persisted batch membership is read back before exact ACK.

## Schema / provisioning foundation

Migration `008_v1_phase2_evidence.sql` adds evidence batch/record/link/state/provider-health tables plus empty schema foundations for Atlas, witness, receivers, commands and refined history. These are not claims that later algorithms are implemented.

Phase 2 setup applies schema and 30-day `evidence/raw/` R2 retention before activating `worker-v7`.

## Executed local verification

Environment used for local Cloud checks:

- Node.js 22.16.0;
- TypeScript 5.8.3;
- Node `node:sqlite` / SQLite transactional harnesses;
- in-memory R2-style harness;
- Node Web Crypto P-256 for signed-route/signature-format checks.

Cloud protocol/persistence harness passed before the final record-claim refinement, covering:

- exact shared golden vector;
- protocol bounds/trailing/version/order rejection;
- first D1/R2-style persistence and exact ACK;
- exact batch retry without storage rewrite;
- same-record/new-batch replay ACK without new batch/R2 storage;
- record/batch collision rejection;
- provider-health ordering under regressed wall clock;
- content-addressed raw key and hashed device metadata;
- Android epoch-bound rejection;
- simulated competing batch-ID claim between preflight and D1 transaction with full losing-transaction rollback.

Observed:

`LOCAL_CURRENT_PHASE2_CLOUD_RACE_HARNESS_PASS`

The final new-record race invariant was then target-executed separately with SQLite. A competitor claimed `(device-1, epoch=55, sequence=1)` before the losing transaction's hard record insert. The hard insert raised the expected unique constraint and rollback left:

- losing batch rows: `0`;
- epoch-55 records: `1`, the competitor only.

Repository test source now contains the same `record-race` scenario; the complete latest repository test script awaits hosted execution.

Signed HTTP route checks passed with a real generated P-256 keypair, covering canonical path validation, signature failure/success, split rate buckets, persistence-before-ACK, replay behavior, revocation and signed malformed protocol.

Observed:

`LOCAL_CURRENT_PHASE2_SIGNED_ROUTE_PASS`

The Android DER/P1363 signature-format invariant was also target-executed locally: a 64-byte P1363 P-256 signature was converted to DER (70 bytes in the observed run), converted back through Brick's DER→P1363 logic, and verified successfully (`true`). The updated repository route test now uses Android-style DER for valid requests and awaits hosted execution on the final head.

Current Android pure Kotlin model/protocol has also been locally compiled and matched the shared golden bytes, including safe-integer/canonical-UUID rejection. This is protocol evidence only; it is not Android framework integration proof.

## CI gate alignment

Current Phase 2 CI source now requires:

Cloud:

- type/static checks;
- hard D1 batch-ID claim and no `INSERT OR IGNORE` for batch identity;
- hard D1 new-record claims and no `INSERT OR IGNORE` for evidence record identity;
- content-addressed raw object key;
- record-replay no-storage path;
- split requester/authenticated-device rate buckets;
- canonical device-ID route boundary;
- signed-route test retaining `p1363ToDer` and `signLikeAndroid`;
- protocol/persistence harness;
- signed HTTP route harness;
- retained Phase 6 regression suite.

Android:

- exact dependency lock;
- full debug app + instrumentation build;
- lint;
- original live packet remains V2 / 90 bytes;
- DB-owned evidence append;
- canonical lowercase v4/variant-2 paired identity checks;
- safety/location/crash priority;
- dedicated evidence worker with `KEEP` + `APPEND_OR_REPLACE` continuation;
- network constraint;
- Core recovery first;
- pairing and sequence instrumentation sources;
- emulator instrumentation execution.

## Hosted CI blocker

Latest checked hosted run for the current Cloud staging head:

- run `41212933879`
- head `20a459f11f99195a0c56b3c1d82f2e7659976859`

Observed:

- Cloud protocol/persistence/regression: failure, `runner_id: 0`, empty runner name, `steps: []`;
- Android compile/lint/dependency-lock: failure, `runner_id: 0`, empty runner name, `steps: []`;
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
| exact local ACK semantics | IMPLEMENTED |
| safety/location/crash priority over evidence | IMPLEMENTED |
| dedicated non-starving evidence worker | IMPLEMENTED |
| bounded separate Evidence Batch v1 | IMPLEMENTED |
| signed evidence transport/endpoint | IMPLEMENTED |
| atomic D1 batch-ID claim | IMPLEMENTED + LOCAL HARNESS PASS |
| atomic new-record claim | IMPLEMENTED + TARGETED LOCAL RACE PASS |
| content-addressed raw evidence storage | IMPLEMENTED + LOCAL HARNESS PASS |
| record replay storage-amplification prevention | IMPLEMENTED + LOCAL HARNESS PASS |
| split unsigned/authenticated rate-limit buckets | IMPLEMENTED + LOCAL ROUTE PASS |
| actual signed route with P-256 verification | LOCAL ROUTE PASS |
| Android DER ECDSA format compatibility | IMPLEMENTED + TARGETED LOCAL PASS; FINAL ROUTE TEST HOSTED-PENDING |
| Android/TypeScript protocol golden parity | LOCAL PASS |
| Android full compile/lint | BLOCKED — NO HOSTED RUNNER / NO LOCAL ANDROID SDK |
| Android instrumentation | BLOCKED — NO HOSTED RUNNER |
| retained Cloud regression CI | BLOCKED — NO HOSTED RUNNER |
| live Cloudflare D1/R2 evidence endpoint | NOT DEPLOYED/VERIFIED |
| full dummy-provider Android → live Cloud exit gate | NOT YET PROVEN |
| canonical branches merged | NO — intentionally withheld |
| Phase 2 accepted | **NO** |

## Required continuation

Do not mark Phase 2 accepted or treat Phase 3 as unlocked yet.

When GitHub supplies a runner:

1. execute Phase 2 CI against the final paired heads;
2. require Cloud typecheck, both Phase 2 integration harnesses and retained regressions to pass;
3. require Android dependency lock, compile and lint to pass;
4. require Android emulator instrumentation to pass;
5. repair any real failures rather than weakening gates;
6. only then merge PR #7 into `apk-download` and PR #6 into `main`;
7. rerun canonical post-merge checks;
8. deploy/verify the evidence endpoint against real Cloudflare before claiming live integration;
9. mark Phase 2 accepted only if the observed evidence supports it.
