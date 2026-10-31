# Brick V1 Phase 2 — Local Verification Evidence

Date: 2026-10-31
Purpose: record checks that actually executed outside GitHub Actions while hosted runners were unavailable.

This file does **not** upgrade Phase 2 to `CI_VERIFIED` or `ACCEPTED`. It records executed evidence only.

## Cloud protocol / persistence harness

Core Cloud source verified locally through runtime/protocol commit:

`15d48bb5da2bebbd7fcafba519f935b85544acfd`

Relevant current blobs at/through that runtime state:

- `src/evidence-protocol.ts`: includes BREV v1 bounds, JavaScript safe-u64 checks and Android signed-Int epoch bound;
- `src/evidence-ingest.ts` blob `90db92db13bed85fa25402f45804eef3b31c53dd`;
- `schema/001_init.sql` blob `15e22a391ba1286e529136ef8b06f4a9ab5ab0de`;
- `schema/008_v1_phase2_evidence.sql` blob `74e5765e689b7d4f523a782d43e6794163a0e6ba`.

The later Cloud staging commit `999b6573c90bab8352fe4f2bc648baf9bb8784e6` changes deployment-workflow wiring only; it does not alter the core protocol/ingest logic verified here.

Environment:

- Node.js 22.16.0;
- TypeScript compiler 5.8.3;
- Node `node:sqlite` in-memory D1-style harness;
- in-memory R2-style object harness.

Executed checks:

- TypeScript compilation of exact evidence protocol/ingest source with only Cloudflare interface shims;
- shared BREV v1 golden-vector exact bytes;
- normal batch decode;
- trailing-byte rejection;
- D1/R2-style first persistence;
- exact ACK result;
- same-batch retry returns duplicate and does not rewrite R2;
- same-record/new-batch retry remains one logical record;
- conflicting sequence/record identity rejects as `EvidenceConflict`;
- provider-health update follows durable epoch/sequence even if device wall clock regresses;
- raw R2 object metadata contains a 64-character hashed `deviceKey` and not the raw `deviceId`;
- an epoch of `0x80000000` is rejected because it exceeds Android's signed-Int epoch contract.

Observed output:

`LOCAL CLOUD PHASE2 HARNESS PASS`

`LATEST CLOUD EPOCH BOUND PASS`

## Kotlin evidence protocol harness

The pure Kotlin Evidence model/protocol was also compiled locally during Phase 2 verification and produced the same fixed golden bytes used by TypeScript.

The original locally executed Kotlin protocol check covered the pre-final-hardening model/protocol. The later Android changes added stricter canonical-UUID and wire-safe integer validation without changing the golden record encoding. Those latest Android source changes are source-reviewed, but no claim is made that the **full current Android project** has compiled/executed until hosted Android CI/instrumentation runs.

Observed output from the executed Kotlin protocol harness:

`LOCAL KOTLIN PHASE2 PROTOCOL PASS`

## Shared golden vector

Batch UUID:

`00112233-4455-6677-8899-aabbccddeeff`

Record UUID:

`12345678-1234-5678-9abc-def012345678`

Expected encoded batch:

`425245560100112233445566778899aabbccddeeff000112345678123456789abcdef01234567800000007000000000000002a00000000075bcd150000019a3b3636fbffff00000310000d64756d6d793a746573743a7363656e657068617365322d676f6c64656e`

The locally executed Kotlin and TypeScript protocol implementations produced this exact value.

## Android source tests prepared but not executed

Current Android staging additionally contains instrumentation tests for:

- encrypted journal persistence across close/reopen;
- wrong ACK rejection and exact ACK deletion;
- dummy-provider → sink → encrypted journal → reopen → transport → ACK flow;
- refusal to drain evidence while core backlog exists;
- bounded adaptive radio sampling;
- DB-owned evidence sequence allocation surviving stale SharedPreferences and helper reopen;
- canonical UUID/wire-safe integer validation cases.

These remain **test source**, not executed proof, until Android runner/emulator execution occurs.

## Hosted Actions evidence

GitHub Actions run `41208953558` demonstrated the continuing infrastructure blocker:

- Cloud job: failure with `runner_id: 0`, no runner name and `steps: []`;
- Android compile/lint job: failure with `runner_id: 0`, no runner name and `steps: []`;
- Android instrumentation: skipped with no steps.

Later Phase 2 runs have continued the same no-useful-runner pattern at the time of this record.

## What remains unverified

Local checks do **not** prove:

- current full Android project compile against Android SDK;
- Android lint;
- instrumentation runner/emulator execution;
- real Android SQLite helper/upgrade behavior;
- Android Keystore AES-GCM behavior;
- WorkManager recovery execution;
- actual signed device HTTP evidence upload against a deployed Worker;
- live Cloudflare D1/R2 behavior;
- complete retained Phase 6 regression suite on the merged Phase 2 source;
- physical OPPO behavior.

Therefore Phase 2 remains:

**SOURCE IMPLEMENTED / CORE CLOUD+PROTOCOL LOCALLY VERIFIED / HOSTED CI BLOCKED / NOT ACCEPTED**.
