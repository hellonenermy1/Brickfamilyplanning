# Brick V1 Phase 2 — Local Verification Evidence

Date: 2026-10-31
Purpose: record checks that actually executed outside GitHub Actions while hosted runners were unavailable.

This file does **not** upgrade Phase 2 to `CI_VERIFIED` or `ACCEPTED`. It records additional executed evidence only.

## Cloud protocol / persistence harness

Exact current source copied from Phase 2 Cloud staging branch:

- `src/evidence-protocol.ts` blob `1af62b87ffaffdd03c69778b3f15ba77e9e99add`
- `src/evidence-ingest.ts` blob `c3f8b1d9345a1b5e199e5d4590ed2bbdbfd9a0b4`
- `schema/001_init.sql` blob `15e22a391ba1286e529136ef8b06f4a9ab5ab0de`
- `schema/008_v1_phase2_evidence.sql` blob `74e5765e689b7d4f523a782d43e6794163a0e6ba`

Environment:

- Node.js 22.16.0
- TypeScript compiler 5.8.3
- Node `node:sqlite` in-memory SQLite harness

Executed checks:

- TypeScript compilation of exact evidence protocol and ingest source with only Cloudflare interface shims;
- shared BREV v1 golden vector exact hex;
- decode of golden record;
- normal two-record batch decode;
- trailing-byte rejection;
- first D1/R2 persistence;
- exact ACK result;
- same-batch retry returns duplicate and does not rewrite R2;
- same-record/new-batch retry keeps one logical evidence record;
- conflicting sequence/record identity is rejected as `EvidenceConflict`.

Observed result:

`LOCAL CLOUD PHASE2 HARNESS PASS`

## Kotlin protocol harness

Exact current logic from:

- `EvidenceModel.kt` blob `d6fb53b6891182e9f096045432a9fbf9984c85af`
- `EvidenceProtocol.kt` blob `09b02baf43f038a68c01edf43c4cffa2c42ff340`

Environment:

- local JVM Kotlin compiler available in the execution environment.

Executed checks:

- pure Kotlin evidence model/protocol compilation;
- encode fixed Phase 2 golden record and batch;
- exact byte-for-byte comparison with the same golden hex used by the TypeScript harness;
- Kotlin decode of the encoded batch;
- sequence and payload-content verification.

Observed result:

`LOCAL KOTLIN PHASE2 PROTOCOL PASS`

## Shared golden vector

Batch UUID:

`00112233-4455-6677-8899-aabbccddeeff`

Record UUID:

`12345678-1234-5678-9abc-def012345678`

Expected encoded batch:

`425245560100112233445566778899aabbccddeeff000112345678123456789abcdef01234567800000007000000000000002a00000000075bcd150000019a3b3636fbffff00000310000d64756d6d793a746573743a7363656e657068617365322d676f6c64656e`

Both locally executed implementations produced this exact value.

## What remains unverified

These local checks do **not** prove:

- Android application compilation against the full Android SDK/source tree;
- Android lint;
- Android instrumentation manifest/runner wiring;
- real Android SQLite helper behavior;
- Android Keystore AES-GCM behavior;
- WorkManager execution;
- actual signed HTTP evidence upload against a deployed Worker;
- repository-wide Phase 6 regression suite;
- Cloudflare D1/R2 behavior in the live platform;
- physical OPPO behavior.

Those remain blocked on actual CI/live/device execution. Phase 2 therefore remains `SOURCE IMPLEMENTED / LOCAL CLOUD+PROTOCOL VERIFIED / CI BLOCKED / NOT ACCEPTED`.
