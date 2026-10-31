# Brick V1 Phase 2 Progress / Verification Report

Date: 2026-10-31
Phase: 2 of 9 — Evidence Platform, Protocol & Durable Data Foundation
Current result: **SOURCE IMPLEMENTED — CORE CLOUD/PROTOCOL LOCALLY VERIFIED — HOSTED CI BLOCKED — NOT ACCEPTED**
Production qualification change: **none**

## Phase 2 boundary

Phase 2 implements only the shared evidence/data foundation. It does not claim particle positioning, Atlas learning, Signal Trust scoring, Witness Mesh, Ground Network, Shizuku evidence, learned places/routes or unified fusion are complete.

Exit gate remains: dummy evidence must be collected, durably persisted, survive restart/process loss, transmit securely, dedupe server-side, receive an exact ACK and disappear locally only after that ACK, without degrading Brick's live-location or SOS path.

## Current staging snapshot

As of this report update:

- Android branch `v1-p2-evidence-android`: `ae20681d4e4fc938da9d13f1071c28199a6af1f7` — PR #7, draft/unmerged.
- Cloud branch `v1-p2-evidence-cloud`: `999b6573c90bab8352fe4f2bc648baf9bb8784e6` — PR #6, draft/unmerged.

Cloud runtime/protocol source through `15d48bb5da2bebbd7fcafba519f935b85544acfd` was locally re-verified. The only subsequent commit to `999b6573...` changes `.github/workflows/deploy-brick.yml`, not Phase 2 runtime/protocol source.

The branches are deliberately not promoted into canonical `apk-download` / `main` until real hosted Android/Cloud CI execution exists.

## Android foundation implemented

The Android staging branch contains:

- canonical `EvidenceObservation`, `EvidenceRecord` and exact `EvidenceAck` identities;
- stable provider/family/capability/health/quality enums;
- mandatory independence groups for later anti-double-counting;
- provider lifecycle interface and adaptive sampling coordinator;
- separate encrypted `brick_evidence.db` SQLite journal;
- Android-Keystore AES-GCM through Brick's journal cipher pattern;
- pending/delivered/quarantined evidence states;
- corruption quarantine so one damaged record does not permanently block later evidence;
- exact ACK by record ID + epoch + sequence;
- evidence transport signed with the existing device key over HTTPS;
- evidence priority below safety, durable live-location and crash backlogs;
- WorkManager best-effort evidence drain only after core tracking recovery;
- evidence-journal health telemetry.

### Durable sequence allocation hardening

The current journal is database version 2 and owns evidence sequence allocation in SQLite.

`appendNew(epoch, observation)` atomically:

1. obtains/creates the epoch's `next_seq` row;
2. constructs the record;
3. encrypts and inserts it;
4. advances `next_seq`;
5. commits the whole operation in one transaction.

SharedPreferences is now only an observable cache and cannot cause sequence reuse after a lost async preference write or process restart.

Dedicated instrumentation source tests the stale-preference/reopen case and expects 1 → 2 → 3 from the database-owned allocator.

### Latest wire hardening

The current Android model additionally requires:

- canonical lowercase UUID record IDs;
- sequence, monotonic elapsed time and wall time within JavaScript/TypeScript safe-integer wire range;
- positive wall time and sequence;
- bounded payloads and independence groups.

## Evidence Batch v1

Evidence remains separate from the existing 90-byte live-location V2 packet.

Evidence Batch v1 uses:

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
- no trailing bytes.

The TypeScript decoder now also rejects an epoch above Android's signed `Int` range so both platforms share the same epoch contract.

## Shared cross-language golden vector

Both Android test source and Cloud test source use the same fixed binary vector.

- Batch ID: `00112233-4455-6677-8899-aabbccddeeff`
- Record ID: `12345678-1234-5678-9abc-def012345678`
- Epoch: 7
- Sequence: 42
- Elapsed: 123456789
- Wall: 1761930000123
- Provider/family: dummy 255/255
- State: supported / healthy / high
- Independence group: `dummy:test:scene`
- Payload: `phase2-golden`

Expected encoded hex:

`425245560100112233445566778899aabbccddeeff000112345678123456789abcdef01234567800000007000000000000002a00000000075bcd150000019a3b3636fbffff00000310000d64756d6d793a746573743a7363656e657068617365322d676f6c64656e`

## Cloud foundation implemented

`worker-v7` adds only:

`POST /api/device/{deviceId}/evidence`

while delegating existing fetch/queue/scheduled runtime behavior to the prior Phase 6 worker.

The endpoint enforces:

- non-revoked paired device;
- evidence-specific rate-limit key;
- exact evidence content type;
- bounded body;
- device signature over the exact body;
- safe decoded device path;
- strict Evidence Batch v1 validation.

Malformed protocol returns a client error, identity conflicts return conflict, and storage failure is never acknowledged as success.

### Idempotent D1/R2 persistence

Cloud evidence persistence:

- hashes the complete batch and each record payload;
- stores raw binary evidence in R2;
- indexes batches/records in D1;
- dedupes by device+epoch+sequence and device+record UUID;
- verifies retries against the original metadata/hash;
- rejects sequence/record/batch identity collisions with altered data;
- updates provider health by durable epoch/sequence ordering, not device wall-clock order;
- updates per-device evidence state;
- reads back persisted batch membership before returning exact ACKs.

Raw R2 object paths/metadata now use a one-way SHA-256 device key rather than exposing/sanitizing the raw device identifier.

## Schema foundation

Migration `008_v1_phase2_evidence.sql` adds:

- `evidence_batches`;
- `evidence_records`;
- `evidence_batch_records`;
- `device_evidence_state`;
- `evidence_provider_health`.

It also creates empty schema foundations for later phases only:

- `atlas_models`;
- `witness_authorizations`;
- `ground_receivers`;
- `device_commands`;
- `refined_history_runs`.

These tables are **not** claims that later-phase algorithms exist.

## Provisioning/retention

The Phase 2 setup path avoids exposing `worker-v7` before schema 008 exists:

1. bootstrap/provision through the proven worker-v6 path;
2. restore the canonical template;
3. apply schema 008;
4. switch generated config to worker-v7;
5. apply 30-day `evidence/raw/` R2 retention alongside existing history lifecycle rules;
6. deploy worker-v7;
7. record Phase 2 protocol/schema/retention in setup state.

## Executed local verification

Actual local execution has now proven the latest core Cloud protocol/ingest logic through `15d48bb5...`:

- TypeScript compilation with Cloudflare type shims;
- exact shared golden-vector decode;
- normal batch decode;
- trailing-byte rejection;
- D1/R2-style first persistence;
- exact ACK generation;
- same-batch retry without R2 rewrite;
- same-record/new-batch idempotency;
- conflict rejection;
- provider-health update using epoch/sequence despite regressed wall clock;
- hashed R2 `deviceKey` metadata with no raw device ID;
- explicit rejection of epoch `0x80000000` above the Android signed-Int wire range.

Observed local output:

- `LOCAL CLOUD PHASE2 HARNESS PASS`
- `LATEST CLOUD EPOCH BOUND PASS`

A pure-Kotlin protocol harness also previously compiled the Brick evidence model/protocol and produced the identical golden bytes. The newest Android canonical-UUID/safe-integer hardening was source-reviewed afterward, but the full Android project has not executed on a hosted runner/emulator yet.

Detailed local evidence is retained in `PHASE2_LOCAL_VERIFICATION.md`.

## Hosted CI blocker

GitHub Actions is still failing before assigning runners.

Run `41208953558` on Cloud head `35eea8fe...` showed:

- Cloud job: `runner_id: 0`, empty runner name, `steps: []`, failure;
- Android build job: `runner_id: 0`, empty runner name, `steps: []`, failure;
- Android instrumentation job: skipped, `steps: []`.

A later run on the newer cloud source also completed failure before useful execution. These are infrastructure/no-runner failures, not source test failures and not passes.

## Exit-gate status

| Gate | State |
|---|---|
| canonical evidence/provider model | IMPLEMENTED |
| independence-group boundary | IMPLEMENTED |
| adaptive sampling coordinator | IMPLEMENTED |
| encrypted durable evidence journal | IMPLEMENTED |
| DB-owned monotonic evidence sequence allocator | IMPLEMENTED |
| exact local ACK semantics | IMPLEMENTED |
| safety/location/crash priority over evidence | IMPLEMENTED |
| separate bounded Evidence Batch v1 | IMPLEMENTED |
| signed evidence transport/endpoint | IMPLEMENTED |
| idempotent D1/R2 persistence source | IMPLEMENTED |
| raw-evidence privacy/retention foundation | IMPLEMENTED |
| latest core Cloud protocol/ingest local harness | PASS |
| cross-language fixed golden vector | PASS on earlier pure-Kotlin + current Cloud core; latest Android full build pending |
| Android full compile/lint | BLOCKED — NO HOSTED RUNNER |
| Android instrumentation | BLOCKED — NO HOSTED RUNNER |
| repository-wide Cloud/regression CI | BLOCKED — NO HOSTED RUNNER |
| live Cloudflare evidence endpoint | NOT DEPLOYED/VERIFIED |
| full dummy-provider exit gate | NOT YET PROVEN END-TO-END |
| canonical branches merged | NO — intentionally withheld |
| Phase 2 accepted | **NO** |

## Required continuation

Do not start Phase 3 as accepted work yet. Once GitHub actually supplies a runner:

1. run the Phase 2 CI against the current paired heads;
2. require Cloud tests/regressions to execute and pass;
3. require Android dependency lock, compile and lint to execute and pass;
4. require Android instrumentation to execute and pass;
5. repair any real failures rather than weakening the gate;
6. promote PR #7 into `apk-download` and PR #6 into `main` only after that proof;
7. rerun canonical post-merge checks;
8. then mark Phase 2 `CI_VERIFIED` / `ACCEPTED` only if the evidence supports it.
