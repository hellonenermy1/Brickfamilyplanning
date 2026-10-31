# Brick V1 Phase 2 Progress / Verification Report

Date: 2026-10-31
Phase: 2 of 9 — Evidence Platform, Protocol & Durable Data Foundation
Current result: **SOURCE IMPLEMENTED — CI EXECUTION BLOCKED — NOT ACCEPTED**
Production qualification change: **none**

## 1. Phase 2 contract

Phase 2 is limited to the common evidence/data foundation needed by later positioning and Atlas phases. It does **not** claim particle positioning, environmental learning, Signal Trust scoring, Witness Mesh, Ground Network, Shizuku location evidence or unified fusion are implemented.

The Phase 2 exit gate remains:

> dummy evidence can be collected, durably persisted, survive process loss, transmit securely, dedupe on the server, receive exact ACK and be removed locally without degrading current location/SOS operation.

Source existence alone is not enough to pass this gate.

## 2. Working branches and PRs

Android staging branch:

- branch: `v1-p2-evidence-android`
- base: `apk-download`
- base SHA: `c99fe4ce7f74b14ba23d280739ed150a327b8520`
- current head after final source-review fix: `62401f69608bec2dcf13b3d897a783180b9a0e56`
- PR: #7 — `Brick V1 Phase 2 — Evidence foundation (Android)`
- PR state: draft / mergeable / not merged

Cloud staging branch:

- branch: `v1-p2-evidence-cloud`
- base: `main`
- base SHA observed by PR: `67c73bdcadcf9ed0f7e2929271f1e060c80a6421`
- current head after shared golden-vector test: `a1c6bb1df3a47644ab59893de55da9e71bfe1d47`
- PR: #6 — `Brick V1 Phase 2 — Evidence foundation (cloud)`
- PR state: draft / mergeable / not merged

Neither Phase 2 PR has been merged because the mandatory CI jobs have not actually executed.

## 3. Android implementation completed in source

Added a dedicated `com.brick.safety.evidence` foundation rather than expanding the 90-byte live-location packet.

### Canonical evidence model

`EvidenceModel.kt` defines:

- stable evidence provider IDs;
- stable evidence-family IDs;
- provider capability states;
- provider health states;
- evidence quality states;
- sampling classes;
- `EvidenceObservation` with record UUID, monotonic/wall time, provider, family, mandatory independence group, capability, health, quality and bounded provider payload;
- `EvidenceRecord(epoch, sequence, observation)`;
- exact `EvidenceAck(epoch, sequence, recordId)`.

Provider/family IDs reserve explicit later-phase sources such as Wi-Fi environment, BLE environment, LAN, magnetic, landmark, Wi-Fi RTT, witness, Ground receiver, companion, historical route and future ranging without implementing those algorithms early.

### Provider contract

`EvidenceProvider.kt` defines:

- `EvidenceProviderDescriptor`;
- capability/health status;
- `EvidenceSink`;
- provider lifecycle: `start`, `applySampling`, `stop`.

Every provider descriptor has an independence namespace. Every emitted observation has a concrete independence group. This establishes the anti-double-counting boundary before later radio/Atlas providers exist.

### Sampling coordinator

`EvidenceSamplingCoordinator.kt` defines bounded sampling policy for:

- SOS;
- degraded position;
- moving;
- stationary;
- deep stationary.

Radio sampling becomes increasingly sparse as the device becomes stable and uses bounded bursts rather than permanent max-rate scanning.

### Separate encrypted evidence journal

`EvidenceJournal.kt` uses its own SQLite database and Android-Keystore AES-GCM encryption through the existing journal cipher pattern.

Important semantics:

- append before network send;
- unique epoch/sequence;
- unique record UUID;
- pending/delivered/quarantined state;
- corruption quarantine instead of blocking all later evidence;
- reopen-safe pending records;
- exact ACK requires matching epoch + sequence + recordId;
- wrong/duplicate local ACK does not delete a pending record;
- recent delivered rows are retained temporarily while older delivered rows are cleaned up;
- evidence-journal health state is exposed to Brick health telemetry.

### Evidence dispatcher and safety priority

`EvidenceDispatcher.kt` is intentionally lower priority than Brick Core.

Before each evidence batch it checks for:

1. pending safety events;
2. pending durable live-location records;
3. pending crash reports.

If any exist, evidence does not send.

The dispatcher rechecks core backlog before each evidence network batch so new higher-priority work can preempt between evidence batches.

Evidence failure is best-effort from `RecoveryWorker`; `ServiceControl.ensureTracking()` runs first and an evidence upload failure cannot make core recovery fail.

### Evidence transport

`EvidenceApi.kt`:

- requires HTTPS;
- rejects API base paths/query/user-info changes;
- sends `application/vnd.brick.evidence`;
- signs the exact binary body with the existing device key;
- requires protocol-1 ACK;
- requires the same batch UUID;
- requires exact ACK count;
- requires exact ACK set `(epoch, sequence, recordId)` before local removal.

### Android health additions

`HealthEvidence.kt` now includes evidence-journal health, pending/quarantined count, oldest pending age and last evidence-journal failure age. Unsupported future providers are not yet reported individually because those providers belong to later phases.

## 4. Evidence Batch v1 wire contract

The Phase 2 binary protocol is deliberately separate from existing live `Protocol.VERSION = 2` and `LIVE_PACKET_BYTES = 90`.

Evidence Batch v1:

- magic: `BREV` / `0x42524556`;
- protocol version: `1`;
- batch UUID;
- record count;
- maximum 24 records per batch;
- maximum 2,048-byte provider payload per record;
- maximum 64-byte independence group;
- maximum 65,536-byte batch;
- strict epoch/sequence ordering;
- unique record UUIDs;
- bounded provider/family/capability/health/quality values;
- no trailing bytes accepted.

Each record contains:

- record UUID;
- epoch;
- evidence sequence;
- monotonic elapsed realtime;
- wall time;
- provider ID;
- family ID;
- provider capability;
- provider health;
- evidence quality;
- independence group;
- provider-specific bounded payload.

## 5. Shared Android/TypeScript golden vector

A fixed byte-for-byte golden vector was added to both Android instrumentation and Cloud protocol testing.

Batch UUID:

`00112233-4455-6677-8899-aabbccddeeff`

Record UUID:

`12345678-1234-5678-9abc-def012345678`

Key fields:

- epoch 7;
- sequence 42;
- elapsed realtime 123456789;
- wall time 1761930000123;
- dummy provider/family 255;
- supported/healthy/high;
- independence group `dummy:test:scene`;
- payload `phase2-golden`.

Expected complete encoded hex:

`425245560100112233445566778899aabbccddeeff000112345678123456789abcdef01234567800000007000000000000002a00000000075bcd150000019a3b3636fbffff00000310000d64756d6d793a746573743a7363656e657068617365322d676f6c64656e`

This is intended to catch cross-language wire drift that independent round-trip tests would miss.

During source review, an Android test defect was found and fixed: Kotlin data-class equality is not valid for comparing independently decoded `ByteArray` payload contents. The test now compares scalar fields individually and uses `contentEquals` for payload bytes.

## 6. Cloud implementation completed in source

### Strict decoder

`src/evidence-protocol.ts` mirrors Android's Evidence Batch v1 limits and rejects:

- bad magic;
- unsupported version;
- invalid batch size/count;
- unknown provider/family/capability/health/quality values;
- invalid ordering fields;
- invalid independence groups;
- oversized payloads;
- duplicate record IDs;
- non-increasing epoch/sequence order;
- truncated bodies;
- trailing bytes.

### Signed evidence endpoint

`src/worker-v7.ts` wraps the existing Phase 6 worker rather than replacing its location/SOS behavior.

New endpoint only:

`POST /api/device/{deviceId}/evidence`

It requires:

- non-revoked paired device;
- separate evidence rate-limit key;
- exact evidence content type;
- bounded body;
- device signature over exact body;
- valid Evidence Batch v1.

Malformed protocol returns a client error; record/batch identity conflicts return conflict; storage failure is not ACKed as success.

All existing Worker fetch/queue/scheduled behavior is delegated to the prior Worker implementation.

### Idempotent durable cloud persistence

`src/evidence-ingest.ts`:

- hashes complete batch and each provider payload;
- stores raw binary batch in R2;
- indexes batches and records in D1;
- uses `(device, epoch, sequence)` and `(device, recordId)` identity constraints;
- validates repeated batch ID against exact original batch hash/count/length;
- validates repeated records against all indexed metadata and payload hash;
- rejects identity collisions with different data;
- returns exact `(epoch, sequence, recordId)` ACKs only after persistence verification;
- same-batch retry does not rewrite R2;
- same records in a new retry batch remain record-idempotent.

### D1 foundations

`schema/008_v1_phase2_evidence.sql` adds:

- `evidence_batches`;
- `evidence_records`;
- `evidence_batch_records`;
- `device_evidence_state`;
- `evidence_provider_health`.

It also creates empty structured foundations for later phases only:

- `atlas_models`;
- `witness_authorizations`;
- `ground_receivers`;
- `device_commands`;
- `refined_history_runs`.

Those tables do **not** mean Atlas, Witness, commands or smoothing algorithms are implemented.

## 7. Safer Phase 2 provisioning

Initial Phase 2 setup source would have allowed a brief `worker-v7` deployment before schema 008 existed, followed by migration and redeploy. That would have been recoverable because the client retains unacknowledged evidence, but it was unnecessary.

The setup wrapper was revised to:

1. temporarily bootstrap the proven `worker-v6` through the existing resource/Access setup path;
2. immediately restore the canonical template;
3. apply schema 008;
4. switch only the generated config to `worker-v7`;
5. apply 30-day `evidence/raw/` R2 lifecycle retention;
6. deploy `worker-v7` only after schema/retention are ready;
7. record Phase 2 schema/protocol/retention metadata in setup state.

This prevents avoidable endpoint/schema skew during setup.

## 8. Test source prepared

### Android instrumentation source

`Phase2DummyEvidenceProvider` and `Phase2EvidenceInstrumentedTest` cover:

- protocol round trip and bounds;
- shared golden vector;
- encrypted local payload is not plaintext;
- journal survives close/reopen;
- wrong ACK does not remove record;
- exact ACK removes record;
- dummy provider → sink → encrypted journal;
- simulated restart/reopen → transport → exact ACK → no resurrection;
- evidence transport is not called while core backlog probe is true;
- adaptive radio cadence remains bounded.

### Cloud test source

`test-phase2-evidence.mjs` covers:

- shared golden vector;
- strict decoder;
- bad version;
- trailing bytes;
- reverse/non-increasing order;
- D1/R2 first persistence;
- same-batch duplicate retry;
- same-record/new-batch dedupe;
- sequence/record collision rejection;
- reused batch UUID with altered bytes rejection;
- latest evidence-state update.

The repository Phase 2 CI workflow is also designed to run critical existing Phase 6 regression gates so the new evidence path cannot be promoted merely because its own tests pass.

## 9. CI execution blocker — important

GitHub Actions is currently not providing a runner to the Phase 2 jobs.

Repeated Phase 2 workflow attempts have completed as failures with:

- `runner_id: 0`;
- empty runner name;
- `steps: []` for both Cloud and Android jobs;
- instrumentation skipped because Android build never started.

Example latest observed run after current cloud test commit:

- run ID: `41208244208`
- Cloud job: failed with zero executed steps / no runner assignment
- Android job: failed with zero executed steps / no runner assignment
- instrumentation: skipped

Earlier Phase 2 runs showed the same zero-step/no-runner pattern. Job log retrieval returns no useful build log because no runner job actually executed.

Therefore these runs are **not evidence that Phase 2 source fails**, but equally they are **not evidence that it passes**.

This exact distinction is mandatory under Brick's measured-over-guessed rule.

## 10. Current exit-gate status

| Gate | State |
|---|---|
| canonical evidence model/provider contract exists | IMPLEMENTED |
| independence-group boundary exists | IMPLEMENTED |
| adaptive sampling coordinator exists | IMPLEMENTED |
| separate encrypted evidence journal exists | IMPLEMENTED |
| exact local ACK semantics exist | IMPLEMENTED |
| evidence lower priority than safety/location/crash | IMPLEMENTED |
| separate bounded binary Evidence Batch v1 exists | IMPLEMENTED |
| Android/Cloud golden vector encoded in tests | IMPLEMENTED |
| signed evidence endpoint exists | IMPLEMENTED |
| D1/R2 idempotent persistence source exists | IMPLEMENTED |
| later-phase schema foundations exist without feature claims | IMPLEMENTED |
| setup avoids activating v7 before schema readiness | IMPLEMENTED |
| raw evidence R2 retention configured in setup source | IMPLEMENTED |
| Android build/lint actually executed on current Phase 2 head | **BLOCKED — NO RUNNER** |
| Android instrumentation actually executed | **BLOCKED — NO RUNNER** |
| Cloud typecheck/tests/regressions actually executed on current head | **BLOCKED — NO RUNNER** |
| dummy-provider full exit gate proven by executed tests | **NOT YET PROVEN** |
| canonical branches updated/merged | **NO — intentionally waiting for proof** |
| Phase 2 accepted | **NO** |

## 11. Required continuation

When GitHub Actions can actually assign a runner:

1. run/re-run the Phase 2 Evidence Foundation workflow against the current Phase 2 heads;
2. require Cloud job steps to execute and pass;
3. require Android compile/lint/instrumentation compilation to execute and pass;
4. require Android emulator instrumentation to execute and pass;
5. inspect failures if any and repair source rather than bypassing gates;
6. only after green evidence, promote PR #7 into `apk-download` and PR #6 into `main` using expected-head protection;
7. re-run appropriate canonical build/regression checks on merged heads;
8. update this report, `AUDIT_STATUS.md`, `PROGRESS.md` and `PROJECT_MEMORY.md`;
9. only then mark Phase 2 `CI_VERIFIED`/`ACCEPTED` as supported by the executed evidence.

Do not start Phase 3 as if Phase 2 were accepted while this blocker remains unresolved.
