# Brick V1 Phase 2 — Local Verification Evidence

Date: 2026-10-31
Purpose: record checks that actually executed outside GitHub Actions while hosted runners were unavailable.

This file does **not** upgrade Phase 2 to `CI_VERIFIED` or `ACCEPTED`.

## Environment

- Node.js 22.16.0
- TypeScript 5.8.3
- Kotlin/JVM 1.9.0 available
- Android SDK unavailable in this execution environment
- Node `node:sqlite` used as a D1-style transactional harness
- in-memory R2-style object harness
- Node Web Crypto used for real P-256 signing/verification tests

## Cross-language BREV v1 protocol

The Android pure Kotlin evidence model/protocol and TypeScript protocol have been locally executed against the shared fixed golden vector.

Golden batch UUID:

`00112233-4455-6677-8899-aabbccddeeff`

Golden record UUID:

`12345678-1234-5678-9abc-def012345678`

Expected encoded bytes:

`425245560100112233445566778899aabbccddeeff000112345678123456789abcdef01234567800000007000000000000002a00000000075bcd150000019a3b3636fbffff00000310000d64756d6d793a746573743a7363656e657068617365322d676f6c64656e`

Observed:

`LATEST ANDROID KOTLIN PHASE2 PROTOCOL PASS`

Checks include golden bytes, decode payload content, canonical UUID validation and JavaScript-safe integer bounds. This does not prove Android framework integrations.

## Cloud protocol / persistence harness

Phase 2 Cloud persistence behavior was locally executed using TypeScript/Node plus SQLite/R2-style fakes.

Executed checks include:

- BREV golden vector and normal decode;
- bad version / trailing bytes / reverse ordering rejection;
- Android signed-Int epoch-bound rejection;
- first persistence into D1/R2-style stores;
- exact ACK after durable writes;
- exact same-batch retry without another R2 write;
- same durable records under fresh batch UUID ACK without new `evidence_batches` row or raw object (`duplicateRecords:true`);
- record identity collision rejection;
- accepted batch UUID reused with changed bytes rejection;
- provider-health advancement by epoch/sequence despite regressed device wall clock;
- one-way hashed device key in raw evidence storage;
- content-addressed R2 key containing exact `batchSha`;
- simulated concurrent competing claim of the same batch UUID between preflight and D1 `batch()`;
- hard D1 batch insert failure rolls back the losing transaction, leaving zero loser evidence records and zero loser batch links;
- retry after competing batch claim becomes `EvidenceConflict`.

Observed on the pre-final-record-claim harness:

`LOCAL_CURRENT_PHASE2_CLOUD_RACE_HARNESS_PASS`

## Final record-level concurrency hardening — targeted local execution

A later source audit found a second concurrency edge: a competing signed request could claim an individual `(device,epoch,sequence)` or `(device,recordId)` after preflight but before the D1 transaction. Phase 2 now tracks which exact records already existed during preflight and:

- reuses only those exact matched records;
- hard-inserts records that were absent during preflight;
- hard-inserts batch-record links;
- never uses `INSERT OR IGNORE` for new evidence record identity.

A targeted local SQLite transaction reproduced the race:

1. competitor record was inserted after the losing request's conceptual preflight;
2. losing transaction inserted its batch claim;
3. losing transaction then hard-inserted the same `(device,epoch,sequence)` with another record ID;
4. SQLite raised the unique constraint;
5. transaction rolled back.

Observed targeted result:

- error: `UNIQUE constraint failed: evidence_records.device_id, evidence_records.epoch, evidence_records.sequence`
- losing batch rows after rollback: `0`
- epoch-55 records after rollback: `1` — only the competitor record remained.

Repository test source now includes the equivalent `record-race` scenario in `scripts/test-phase2-evidence.mjs`. The complete latest repository script still awaits hosted execution; the transactional invariant itself was executed locally as described above.

## Signed HTTP evidence-route harness

The actual Phase 2 route logic lives in `src/evidence-route.ts`, with `worker-v7` delegating the evidence endpoint to that handler. A local route harness used a real generated Web Crypto P-256 keypair and Brick's signature-verification implementation.

Executed checks:

- canonical v4 Brick device path accepted;
- non-v4 UUID rejected;
- path-control/decode-slash input rejected;
- malformed URL encoding rejected;
- missing signature returns 401;
- bad signature returns 401;
- missing/bad signature consumes only requester attempt-rate key;
- valid signed request consumes requester key then authenticated device key;
- valid signed request persists D1/R2-style state before 200/exact ACK;
- exact signed retry returns duplicate ACK without another raw write;
- fresh batch UUID containing already-durable records returns exact ACK without storage growth;
- requester rate-limit rejection happens before device signature path;
- authenticated device rate-limit rejection happens only after valid signature and before persistence;
- revoked device returns 401 without persistence;
- correctly signed malformed BREV payload returns 400 without persistence.

Observed on the route harness:

`LOCAL_CURRENT_PHASE2_SIGNED_ROUTE_PASS`

## Android DER ECDSA compatibility — targeted local execution

Android `DeviceKeys.sign()` uses Java `SHA256withECDSA`, which emits ASN.1 DER signatures. The Cloud verifier converts DER to 64-byte P1363 before Web Crypto verification.

The route test source was tightened so valid requests use `signLikeAndroid()` / `p1363ToDer()` rather than passing Web Crypto's native raw signature directly.

A targeted local Node/WebCrypto check executed the exact format conversion shape:

- generated P-256 signature: 64-byte P1363;
- converted to ASN.1 DER: 70 bytes in the observed run;
- converted back through the same DER→P1363 logic used by Brick Cloud;
- signature verification: `true`.

This materially tests the Android/Cloud signature-format boundary, but the updated full route script on the newest repository head still awaits hosted CI execution.

## Android source tests prepared but not executed

Current Android staging includes instrumentation source for:

- encrypted journal persistence across close/reopen;
- wrong ACK rejection / exact ACK deletion;
- dummy provider → sink → encrypted journal → reopen → transport → ACK;
- refusal to drain evidence while core backlog exists;
- bounded adaptive sampling;
- DB-owned sequence allocator surviving stale SharedPreferences and reopen;
- no evidence retention before pairing;
- canonical lowercase v4/variant-2 device-ID requirement and corrupt/non-v4 rejection;
- shared BREV golden vector.

Current Android source also contains a dedicated network-constrained evidence WorkManager chain using `KEEP` for first scheduling and `APPEND_OR_REPLACE` for bounded follow-up catch-up, while Brick Core recovery stays first.

These are **source/test definitions**, not executed Android proof, because the current environment has no Android SDK and hosted Actions has not assigned a runner.

## Hosted Actions evidence

Latest checked run:

- run: `41212933879`
- Cloud head: `20a459f11f99195a0c56b3c1d82f2e7659976859`
- Android staging snapshot: `389bc8744341aebcc42f74f79403fd2b3d5d5873`

Observed jobs:

- Cloud protocol/persistence/regression: failure with `runner_id: 0`, empty runner name and `steps: []`;
- Android compile/lint/dependency-lock: failure with `runner_id: 0`, empty runner name and `steps: []`;
- Android instrumentation: skipped.

No source step executed. This is a hosted runner/infrastructure failure. It is neither a source pass nor a source failure.

## What remains unverified

Local checks do **not** prove:

- full Android project compilation against the Android SDK;
- Android lint;
- Android instrumentation/emulator execution;
- real Android SQLiteOpenHelper/upgrade behavior;
- Android Keystore AES-GCM behavior;
- WorkManager execution on Android;
- the full Android dummy-provider path to a deployed Worker;
- live Cloudflare D1/R2 behavior;
- retained Phase 6 cloud regressions on the final Phase 2 head;
- physical OPPO/ColorOS behavior.

Therefore the correct Phase 2 evidence state remains:

**SOURCE IMPLEMENTED + HARDENED / CLOUD CORE + SIGNED ROUTE + CROSS-LANGUAGE PROTOCOL LOCALLY VERIFIED, WITH FINAL RECORD-RACE AND DER FORMAT INVARIANTS TARGET-VERIFIED / HOSTED CI BLOCKED / NOT ACCEPTED**.
