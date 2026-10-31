# Brick V1 Phase 2 Progress / Verification Report

Date: 2026-10-31
Phase: 2 of 9 — Evidence Platform, Protocol & Durable Data Foundation
Current result: **SOURCE IMPLEMENTED + HARDENED — CORE CLOUD/PROTOCOL LOCALLY VERIFIED — HOSTED CI BLOCKED — NOT ACCEPTED**
Production qualification change: **none**

## Phase 2 boundary

Phase 2 implements only the shared evidence/data foundation. It does not claim particle positioning, Atlas learning, Signal Trust scoring, Witness Mesh, Ground Network, Shizuku evidence, learned places/routes or unified fusion are complete.

Exit gate remains:

> dummy evidence must be collected, durably persisted, survive restart/process loss, transmit securely, dedupe server-side, receive an exact ACK and disappear locally only after that ACK, without degrading Brick's live-location or SOS path.

Source existence and source review alone are not enough to pass this gate.

## Current staging snapshot

Snapshot at this report update:

- Android `v1-p2-evidence-android`: `a795a91b10398a00ac64014cbd8d71b8caaaa627` — PR #7, draft/unmerged.
- Cloud `v1-p2-evidence-cloud`: `08d00d77d4b731d5e3d8029fa1ee7cd5c0dfb36f` — PR #6, draft/unmerged.

These are staging snapshots, not permanent release identifiers. The acceptance rule is tied to executed verification of the final paired heads. Neither branch is promoted into canonical `apk-download` / `main` yet.

## Android foundation implemented

The Android staging branch contains:

- canonical `EvidenceObservation`, `EvidenceRecord` and exact `EvidenceAck` identities;
- stable provider/family/capability/health/quality enums;
- mandatory independence groups for later anti-double-counting;
- provider lifecycle interface and adaptive sampling coordinator;
- separate encrypted `brick_evidence.db` SQLite journal;
- Android-Keystore AES-GCM through Brick's existing journal cipher pattern;
- pending/delivered/quarantined evidence states;
- corruption quarantine so one damaged record does not block later evidence;
- exact ACK by record ID + epoch + sequence;
- signed HTTPS evidence transport;
- evidence priority below safety, durable live-location and crash backlogs;
- dedicated low-priority WorkManager evidence catch-up path;
- evidence-journal health telemetry.

### Durable sequence allocation

The journal owns evidence sequence allocation in SQLite rather than SharedPreferences.

`appendNew(epoch, observation)` transactionally:

1. reads/creates durable epoch sequence state;
2. constructs the next record;
3. encrypts and inserts the record;
4. advances sequence state;
5. commits record + allocator together.

SharedPreferences is only an observable cache. A lost async preference write cannot cause sequence reuse after restart.

Instrumentation source covers stale-preference/reopen allocation and expects 1 → 2 → 3 from the DB-owned allocator.

### Android SQLite compatibility hardening

Deterministic `append(record)` no longer depends on newer SQLite `ON CONFLICT ... DO UPDATE` grammar. It uses `INSERT OR IGNORE` plus a conditional `UPDATE`, reducing OEM SQLite-version dependence while preserving monotonic allocator state.

### Pairing boundary

Evidence is not persisted before the installation has both a paired `deviceId` and valid Brick API base. This follows the existing live-location behavior and avoids accumulating unbound family-location evidence before a durable device identity exists.

A dedicated instrumentation test covers:

- no device/API identity → enqueue rejected, zero persisted evidence;
- device ID alone → rejected;
- device ID + API base → persistence allowed.

### Non-starving evidence backlog recovery

A source audit found that using the generic replaceable recovery work for every evidence enqueue could starve evidence uploads under continuous future evidence production. It was redesigned.

Current design:

- `scheduleEvidenceSoon()` uses a dedicated unique WorkManager chain and `KEEP`, so later observations cannot keep postponing the first drain;
- `EvidenceUploadWorker` is network-constrained and separate from Brick Core recovery;
- each evidence worker run drains at most eight batches;
- dispatcher rechecks safety/location/crash backlog before every evidence batch;
- if evidence remains, exactly one successor is appended with `APPEND_OR_REPLACE`;
- successful progress gets a short continuation delay;
- zero-progress conditions get a slower continuation;
- generic `RecoveryWorker` restores Brick Core first and only re-arms the evidence chain when evidence exists.

This prevents a large offline evidence queue from monopolising recovery while also avoiding hours-long exponential retry slowdown during ordinary backlog catch-up.

## Evidence Batch v1

Evidence remains separate from the existing 90-byte live-location V2 packet.

Evidence Batch v1:

- magic `BREV` (`0x42524556`);
- protocol version 1;
- batch UUID;
- maximum 24 records per batch;
- maximum 2,048-byte provider payload;
- maximum 64-byte independence group;
- maximum 65,536-byte batch;
- strict epoch/sequence ordering;
- unique record UUIDs;
- bounded provider/family/capability/health/quality values;
- no trailing bytes;
- JavaScript-safe integer bounds for long integer fields;
- Android signed-Int range for epoch.

Android additionally requires canonical lowercase UUIDs for record/batch identities.

## Shared cross-language golden vector

Batch ID:

`00112233-4455-6677-8899-aabbccddeeff`

Record ID:

`12345678-1234-5678-9abc-def012345678`

Fields:

- epoch 7;
- sequence 42;
- elapsed 123456789;
- wall 1761930000123;
- dummy provider/family 255/255;
- supported / healthy / high;
- independence group `dummy:test:scene`;
- payload `phase2-golden`.

Expected complete hex:

`425245560100112233445566778899aabbccddeeff000112345678123456789abcdef01234567800000007000000000000002a00000000075bcd150000019a3b3636fbffff00000310000d64756d6d793a746573743a7363656e657068617365322d676f6c64656e`

## Cloud foundation implemented

`worker-v7` adds only:

`POST /api/device/{deviceId}/evidence`

and delegates existing fetch/queue/scheduled behavior to the prior worker implementation.

Evidence endpoint enforces:

- non-revoked paired device;
- evidence-specific rate-limit key;
- exact evidence content type;
- bounded body;
- device signature over exact body;
- safe decoded device path;
- strict Evidence Batch v1 validation.

Malformed protocol returns a client error, identity conflict returns conflict, and storage failure is never ACKed as success.

### Idempotent D1/R2 persistence

Cloud persistence:

- hashes complete batch and every provider payload;
- stores raw binary batch in R2;
- indexes batches/records in D1;
- dedupes by device+epoch+sequence and device+record UUID;
- validates retries against original metadata/hash;
- rejects altered sequence/record/batch identity collisions;
- orders provider-health updates using epoch/sequence rather than device wall clock;
- updates per-device evidence state;
- reads back persisted batch membership before returning exact ACKs.

Raw R2 object path/metadata uses a one-way SHA-256 device key rather than raw/sanitized device ID.

## Schema foundation

Migration `008_v1_phase2_evidence.sql` adds:

- `evidence_batches`;
- `evidence_records`;
- `evidence_batch_records`;
- `device_evidence_state`;
- `evidence_provider_health`.

It also creates empty later-phase schema foundations:

- `atlas_models`;
- `witness_authorizations`;
- `ground_receivers`;
- `device_commands`;
- `refined_history_runs`.

These tables are **not** claims that those later algorithms exist.

## Provisioning / retention

Phase 2 setup avoids exposing `worker-v7` before schema 008 exists:

1. bootstrap/provision through the proven worker-v6 path;
2. restore canonical template;
3. apply schema 008;
4. switch generated config to worker-v7;
5. apply 30-day `evidence/raw/` R2 retention alongside existing history lifecycle rules;
6. deploy worker-v7;
7. record protocol/schema/retention in setup state.

Deployment verification source has also been extended to check the Phase 2 evidence schema/retention/state when the real deployment workflow eventually executes.

## Executed local verification

### Current Cloud core

The Phase 2 core Cloud protocol/ingest logic through runtime commit `15d48bb5da2bebbd7fcafba519f935b85544acfd` executed locally and passed:

- TypeScript compilation with Cloudflare interface shims;
- exact shared golden vector;
- strict normal decode;
- trailing-byte rejection;
- D1/R2-style first persistence;
- exact ACK generation;
- same-batch retry without R2 rewrite;
- same-record/new-batch idempotency;
- collision rejection;
- provider-health update under regressed device wall clock;
- hashed R2 `deviceKey` metadata without raw device ID;
- rejection of epoch `0x80000000` beyond Android signed-Int range.

Observed:

- `LOCAL CLOUD PHASE2 HARNESS PASS`
- `LATEST CLOUD EPOCH BOUND PASS`

Subsequent observed Cloud commits through the staging snapshot are CI/deployment-verification changes, not changes to the verified evidence runtime/protocol path.

### Current Android pure protocol/model

The newest Android `EvidenceModel.kt` + `EvidenceProtocol.kt` were compiled locally again after canonical-UUID/safe-integer hardening.

Executed checks:

- exact shared golden bytes;
- decode payload content;
- unsafe sequence above `Number.MAX_SAFE_INTEGER` rejected;
- non-canonical uppercase UUID rejected.

Observed:

`LATEST ANDROID KOTLIN PHASE2 PROTOCOL PASS`

This is useful protocol evidence, but it is not a full Android app/SQLite/Keystore/WorkManager/instrumentation pass.

Detailed local execution is retained in `PHASE2_LOCAL_VERIFICATION.md`.

## CI gate alignment

The Phase 2 CI workflow was updated after the WorkManager redesign. Its Android static architecture gate now checks the **current** design rather than the obsolete direct-drain design:

- live V2 packet remains unchanged;
- dispatcher uses DB `appendNew`;
- safety/location/crash priority checks remain present;
- evidence uses dedicated network-constrained `EvidenceUploadWorker`;
- initial work uses `KEEP`;
- continuation uses `APPEND_OR_REPLACE`;
- worker drains bounded batches and schedules a successor;
- generic RecoveryWorker still restores Brick Core first;
- pairing and sequence-allocation instrumentation sources are present.

## Hosted CI blocker

GitHub Actions still fails before assigning runners.

Latest checked run after the updated Phase 2 CI architecture gate:

`41210379525`

Observed jobs:

- Android compile/lint/dependency lock: failure with no executed steps;
- Cloud protocol/persistence/regression: failure with no executed steps;
- Android instrumentation: skipped.

The jobs have no useful logs/steps because runner execution never started. This is an infrastructure/no-runner failure, **not** a source failure and **not** a pass.

## Exit-gate status

| Gate | State |
|---|---|
| canonical evidence/provider model | IMPLEMENTED |
| independence-group boundary | IMPLEMENTED |
| adaptive sampling coordinator | IMPLEMENTED |
| encrypted durable evidence journal | IMPLEMENTED |
| DB-owned monotonic evidence sequence allocator | IMPLEMENTED |
| Android SQLite compatibility hardened | IMPLEMENTED |
| no unpaired evidence persistence | IMPLEMENTED |
| exact local ACK semantics | IMPLEMENTED |
| safety/location/crash priority over evidence | IMPLEMENTED |
| dedicated non-starving evidence backlog worker | IMPLEMENTED |
| separate bounded Evidence Batch v1 | IMPLEMENTED |
| signed evidence transport/endpoint | IMPLEMENTED |
| idempotent D1/R2 persistence source | IMPLEMENTED |
| raw-evidence privacy/retention foundation | IMPLEMENTED |
| latest core Cloud protocol/ingest local harness | PASS |
| latest Android pure Kotlin protocol/model harness | PASS |
| cross-language fixed golden vector | PASS locally |
| Android full compile/lint | BLOCKED — NO HOSTED RUNNER |
| Android instrumentation including SQLite/dispatcher tests | BLOCKED — NO HOSTED RUNNER |
| repository-wide Cloud/regression CI | BLOCKED — NO HOSTED RUNNER |
| live Cloudflare evidence endpoint | NOT DEPLOYED/VERIFIED |
| full dummy-provider exit gate | NOT YET PROVEN END-TO-END |
| canonical branches merged | NO — intentionally withheld |
| Phase 2 accepted | **NO** |

## Required continuation

Do not mark Phase 2 accepted and do not begin Phase 3 as accepted work yet.

When GitHub supplies a runner:

1. run Phase 2 CI against the final paired heads;
2. require Cloud typecheck/protocol/idempotency/retained regressions to execute and pass;
3. require Android dependency lock, compile and lint to execute and pass;
4. require Android emulator instrumentation to execute and pass;
5. repair any real failures rather than weakening gates;
6. only then promote PR #7 into `apk-download` and PR #6 into `main`;
7. rerun canonical post-merge checks;
8. then mark Phase 2 `CI_VERIFIED` / `ACCEPTED` only if the observed evidence supports it.
