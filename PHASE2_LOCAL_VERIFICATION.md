# Brick V1 Phase 2 — Local Verification Evidence

Date: 2026-10-31
Purpose: record checks that actually executed outside GitHub Actions while hosted runners were unavailable.

This file does **not** upgrade Phase 2 to `CI_VERIFIED` or `ACCEPTED`. It records executed evidence only.

## Cloud protocol / persistence harness

Core Cloud protocol/ingest source verified locally through runtime/protocol commit:

`15d48bb5da2bebbd7fcafba519f935b85544acfd`

Relevant verified source:

- `src/evidence-protocol.ts` with BREV v1 bounds, JavaScript safe-u64 checks and Android signed-Int epoch bound;
- `src/evidence-ingest.ts` blob `90db92db13bed85fa25402f45804eef3b31c53dd`;
- `schema/001_init.sql` blob `15e22a391ba1286e529136ef8b06f4a9ab5ab0de`;
- `schema/008_v1_phase2_evidence.sql` blob `74e5765e689b7d4f523a782d43e6794163a0e6ba`.

Environment:

- Node.js 22.16.0;
- TypeScript compiler 5.8.3;
- Node `node:sqlite` in-memory D1-style harness;
- in-memory R2-style object harness.

Executed checks:

- TypeScript compilation of evidence protocol/ingest source with Cloudflare interface shims;
- shared BREV v1 golden-vector exact bytes;
- normal batch decode;
- trailing-byte rejection;
- D1/R2-style first persistence;
- exact ACK result;
- same-batch retry returns duplicate and does not rewrite R2;
- same-record/new-batch retry remains one logical record;
- conflicting sequence/record identity rejects as `EvidenceConflict`;
- provider-health update follows durable epoch/sequence even if device wall clock regresses;
- raw R2 object metadata contains a 64-character hashed `deviceKey` and not raw `deviceId`;
- epoch `0x80000000` is rejected because it exceeds Android's signed-Int epoch contract.

Observed:

`LOCAL CLOUD PHASE2 HARNESS PASS`

`LATEST CLOUD EPOCH BOUND PASS`

## Current worker-v7 endpoint hardening harness

Cloud staging later advanced to:

`da250b09f1b5911ec1fb808a819b24c8c5f43656`

with one runtime change in `src/worker-v7.ts`: separate request-attempt and authenticated-device rate limiting.

The current worker-v7 logic was reconstructed from the staged file and locally checked with Cloudflare interface stubs plus Node's Fetch API.

Executed checks:

- TypeScript type-check of the current worker-v7 logic;
- unsigned evidence request with `CF-Connecting-IP: 1.2.3.4` returns 401 and consumes only `evidence-attempt:1.2.3.4`;
- valid signed request consumes `evidence-attempt:1.2.3.4` first and then `evidence-device:child-1`;
- unsigned traffic therefore cannot consume the authenticated child's device-scoped evidence bucket merely by knowing a device identifier.

Observed:

`LATEST CLOUD WORKER V7 TYPECHECK PASS`

`LATEST CLOUD WORKER V7 RATE-LIMIT HARNESS PASS`

This verifies the logic added by the latest current cloud runtime commit, but it is still not a deployed Cloudflare-platform test.

## Current Kotlin evidence protocol/model harness

The current Android evidence model/protocol was reconstructed from staged source and compiled locally after canonical-UUID and wire-safe-integer hardening.

Executed checks:

- Kotlin compile of current `EvidenceModel.kt` and `EvidenceProtocol.kt` logic;
- exact shared golden-vector bytes;
- decode payload-content check;
- sequence above JavaScript `Number.MAX_SAFE_INTEGER` rejected;
- non-canonical uppercase UUID rejected.

Observed:

`LATEST ANDROID KOTLIN PHASE2 PROTOCOL PASS`

This materially verifies current Android/Cloud wire parity but does **not** prove Android framework integrations such as SQLiteOpenHelper, Keystore or WorkManager.

## Shared golden vector

Batch UUID:

`00112233-4455-6677-8899-aabbccddeeff`

Record UUID:

`12345678-1234-5678-9abc-def012345678`

Expected encoded batch:

`425245560100112233445566778899aabbccddeeff000112345678123456789abcdef01234567800000007000000000000002a00000000075bcd150000019a3b3636fbffff00000310000d64756d6d793a746573743a7363656e657068617365322d676f6c64656e`

The locally executed current Kotlin protocol and current verified TypeScript protocol produced this exact value.

## Android source tests prepared but not executed

Current Android staging includes instrumentation source for:

- encrypted journal persistence across close/reopen;
- wrong ACK rejection and exact ACK deletion;
- dummy-provider → sink → encrypted journal → reopen → transport → ACK flow;
- refusal to drain evidence while core backlog exists;
- bounded adaptive radio sampling;
- DB-owned evidence sequence allocation surviving stale SharedPreferences and helper reopen;
- no evidence retention before pairing;
- canonical UUID/wire-safe integer validation cases.

The source also contains dedicated evidence WorkManager catch-up logic designed to avoid both continuous-enqueue starvation and exponential-backoff slowdown during a normal large backlog.

These remain **test/source evidence**, not executed Android proof, until Android runner/emulator execution occurs.

## Hosted Actions evidence

Latest checked run for the current Cloud runtime head:

`41210685918`

Head:

`da250b09f1b5911ec1fb808a819b24c8c5f43656`

Observed jobs:

- Cloud protocol/persistence/regression: failure with no executed steps/logs;
- Android compile/lint/dependency-lock: failure with no executed steps/logs;
- Android instrumentation: skipped.

The immediately preceding run `41210379525` showed the same zero-step behavior, and an explicit failed-job rerun also returned empty step lists.

This is consistent with hosted runner assignment/infrastructure failure. It is neither a pass nor evidence that source tests failed.

## What remains unverified

Local checks do **not** prove:

- current full Android project compile against Android SDK;
- Android lint;
- instrumentation runner/emulator execution;
- real Android SQLite helper/upgrade behavior;
- Android Keystore AES-GCM behavior;
- WorkManager evidence scheduling/catch-up behavior;
- actual signed device HTTP evidence upload against a deployed Worker;
- live Cloudflare D1/R2 behavior;
- complete retained Phase 6 regression suite on merged Phase 2 source;
- physical OPPO behavior.

Therefore Phase 2 remains:

**SOURCE IMPLEMENTED + HARDENED / CURRENT CLOUD ENDPOINT + CLOUD CORE + CROSS-LANGUAGE PROTOCOL LOCALLY VERIFIED / HOSTED CI BLOCKED / NOT ACCEPTED**.
