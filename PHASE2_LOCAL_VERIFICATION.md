# Brick V1 Phase 2 — Local Verification Evidence

Date: 2026-10-31
Purpose: record checks that actually executed outside GitHub Actions while hosted runners were unavailable.

This file does **not** upgrade Phase 2 to `CI_VERIFIED` or `ACCEPTED`.

## Current exact paired source checkpoint

- Cloud: `60697dc37cb325574e9bd22283e2b3dd1d847817`
- Android: `4ec37a2021bcd575cfefeadd58c968675965a8e7`

The Cloud workflow pins that exact Android SHA. The newest source changes on these final paired heads have **not** received full local or hosted execution. Earlier executed evidence is retained below and is labelled accordingly.

## Environment

- Node.js 22.16.0
- TypeScript 5.8.3
- Kotlin/JVM 1.9.0 available
- Android SDK unavailable in this execution environment
- Node `node:sqlite` used for prior D1-style transactional harnesses
- in-memory R2-style harness used for prior Cloud tests
- Node Web Crypto used for prior P-256 signing/verification tests

## Cross-language BREV v1 protocol — earlier executed evidence

Android pure Kotlin evidence model/protocol and TypeScript protocol were locally executed against the shared fixed golden vector on earlier Phase 2 heads.

Golden batch UUID:

`00112233-4455-6677-8899-aabbccddeeff`

Golden record UUID:

`12345678-1234-5678-9abc-def012345678`

Expected encoded bytes:

`425245560100112233445566778899aabbccddeeff000112345678123456789abcdef01234567800000007000000000000002a00000000075bcd150000019a3b3636fbffff00000310000d64756d6d793a746573743a7363656e657068617365322d676f6c64656e`

Observed earlier:

`LATEST ANDROID KOTLIN PHASE2 PROTOCOL PASS`

Checks included golden bytes, decode payload content, canonical UUID validation and JavaScript-safe integer bounds. This did not prove Android framework integrations.

## Cloud protocol / persistence — earlier executed evidence

Phase 2 Cloud persistence was previously executed using TypeScript/Node plus SQLite/R2-style fakes.

Executed checks included:

- BREV golden vector and normal decode;
- bad version / trailing bytes / reverse ordering rejection;
- Android signed-Int epoch-bound rejection;
- first persistence into D1/R2-style stores;
- exact ACK after durable writes;
- exact same-batch retry without another R2 write;
- same durable records under a fresh batch UUID ACK without new batch/raw storage;
- record identity collision rejection;
- accepted batch UUID reused with changed bytes rejection;
- provider-health advancement by epoch/sequence despite regressed device wall clock;
- one-way hashed device key in raw evidence storage;
- content-addressed R2 key containing exact `batchSha`;
- simulated concurrent competing batch-ID claim with complete losing-transaction rollback.

Observed earlier:

`LOCAL_CURRENT_PHASE2_CLOUD_RACE_HARNESS_PASS`

A later targeted local SQLite transaction also reproduced the new-record identity race. A competing `(device,epoch,sequence)` claim caused the losing hard record insert to hit the unique constraint; the losing batch rolled back and only the competitor record remained.

That targeted result supports the hard-record-claim invariant, but it is not a run of the complete final repository test suite.

## Signed HTTP evidence route — earlier executed evidence

The actual evidence-route logic was previously executed using a real generated Web Crypto P-256 keypair and Brick's signature verification code.

Executed checks included:

- canonical v4 device path accepted;
- non-v4/path-control/malformed URL encoding rejected;
- missing/bad signatures rejected;
- unauthenticated traffic consumed only requester rate bucket;
- valid signed request consumed requester then authenticated-device bucket;
- durable D1/R2-style persistence before 200/exact ACK;
- exact retry and record replay without storage growth;
- requester/device rate-limit ordering;
- revoked device rejection;
- signed malformed BREV rejection.

Observed earlier:

`LOCAL_CURRENT_PHASE2_SIGNED_ROUTE_PASS`

A targeted P-256 format check also confirmed the Android signature shape: P1363 signature converted to ASN.1 DER, then through Brick's DER-to-P1363 path, verified successfully. The repository route test now uses `signLikeAndroid()` for valid requests.

## New final-head hardening prepared but not fully executed

The final paired source adds several protections after the earlier local harnesses:

### Cloud final-head changes

- evidence body uses `readBoundedBody(req, EVIDENCE_MAX_BATCH_BYTES)` instead of `req.arrayBuffer()`;
- a 65,537-byte no-length body test is present and expects 413 before authenticated-device rate consumption or persistence;
- identical same-batch races now converge to the already-durable exact ACK;
- mixed exact-record races re-read state and retry once, reusing exact winner records and persisting the remaining records;
- conflicting record/batch identities still fail closed;
- the race reconciliation retry is bounded to one pass;
- CI statically prohibits `INSERT OR IGNORE` for evidence batch/record identity and prohibits `req.arrayBuffer()` on the evidence route.

The updated complete Cloud test scripts have not executed on final Cloud head `60697dc37cb325574e9bd22283e2b3dd1d847817` because hosted runners still receive no runner assignment and the current tool environment did not expose a reusable exact-source checkout for local execution.

### Android final-head changes

- stale instrumentation pairing IDs were corrected to canonical v4/variant-2 IDs;
- pending evidence is read in strict `(epoch,sequence,id)` wire order;
- quarantined rows remain diagnostic history but do not permanently poison current journal health;
- `EvidenceJournal.refreshHealth()` performs a deterministic `SELECT COUNT(*) FROM evidence` read probe;
- health telemetry uses that probe so a quiet device can clear an expired failure latch without deleting quarantine history;
- `EvidenceDispatcher.drainDetailed()` reports explicit stop reasons;
- dispatcher independently verifies the complete exact ACK set before local deletion;
- persistent transport/ACK/identity failure uses durable bounded exponential retry delay up to 15 minutes, while healthy catch-up remains fast and Core backlog remains higher priority;
- new instrumentation source covers wire ordering, quarantine recovery, quiet health recovery, wrong/missing ACK deletion protection, stop-reason differentiation and retry bounds.

These Android source/tests have not been compiled or executed because no Android SDK exists in the current local environment and hosted Android jobs never receive a runner.

## Deterministic paired CI

The final Cloud workflow contains:

`ANDROID_PHASE2_SHA=4ec37a2021bcd575cfefeadd58c968675965a8e7`

Both Android jobs checkout this exact commit and assert the resulting `git rev-parse HEAD` value. This removes the previous ambiguity where re-running one Cloud commit could silently test a newer moving Android branch.

## Latest hosted Actions evidence

Latest checked run:

- run: `41215211883`
- Cloud head: `60697dc37cb325574e9bd22283e2b3dd1d847817`
- pinned Android head: `4ec37a2021bcd575cfefeadd58c968675965a8e7`

Observed jobs:

- Android compile/lint/dependency-lock: failure with `runner_id: 0`, empty runner name and `steps: []`;
- Cloud protocol/persistence/regression: failure with `runner_id: 0`, empty runner name and `steps: []`;
- Android instrumentation: skipped.

No source step executed. This is a hosted runner/infrastructure failure. It is neither a source pass nor a source failure.

## What remains unverified

Current evidence does **not** prove:

- final Cloud head TypeScript/typecheck/integration/regression execution;
- final streamed-body and race-convergence test execution;
- full Android project compilation against the Android SDK;
- Android lint;
- Android instrumentation/emulator execution;
- real Android SQLiteOpenHelper/upgrade behavior;
- Android Keystore AES-GCM behavior;
- WorkManager scheduling/backoff behavior on Android;
- final ACK-set guard/journal-health recovery on Android;
- full dummy-provider path against a deployed Worker;
- live Cloudflare D1/R2 behavior;
- retained Phase 6 regressions on the final Phase 2 head;
- physical OPPO/ColorOS behavior.

Therefore the correct Phase 2 evidence state is:

**SOURCE IMPLEMENTED + FURTHER HARDENED / PRIOR CLOUD-PROTOCOL-ROUTE LOCAL EVIDENCE RETAINED / FINAL PAIRED HEAD EXECUTION BLOCKED / NOT ACCEPTED**.
