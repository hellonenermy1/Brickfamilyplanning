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

## Current Cloud protocol / persistence harness

Current staged Cloud persistence behavior was locally executed using TypeScript/Node plus SQLite/R2-style fakes.

Executed checks:

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
- retry after competing claim becomes `EvidenceConflict`.

Observed:

`LOCAL_CURRENT_PHASE2_CLOUD_RACE_HARNESS_PASS`

This validates the Phase 2 persistence/idempotency/concurrency design in the local transactional harness. It is not live Cloudflare D1/R2 proof.

## Current signed HTTP evidence-route harness

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

Observed:

`LOCAL_CURRENT_PHASE2_SIGNED_ROUTE_PASS`

The current route TypeScript also compiled successfully in the local harness.

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

- run: `41212250461`
- Cloud head: `a5c2d375d3e08c35d3674e8405663bf1483d2f4c`

Observed jobs:

- Android compile/lint/dependency-lock: failure with `runner_id: 0` and `steps: []`;
- Cloud protocol/persistence/regression: failure with `runner_id: 0` and `steps: []`;
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

Therefore the correct Phase 2 evidence state is:

**SOURCE IMPLEMENTED + HARDENED / CLOUD CORE + REAL SIGNED ROUTE + CROSS-LANGUAGE PROTOCOL LOCALLY VERIFIED / HOSTED CI BLOCKED / NOT ACCEPTED**.
