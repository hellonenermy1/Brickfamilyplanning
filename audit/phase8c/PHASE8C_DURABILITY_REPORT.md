# Brick V1 — Phase 8C Durability and Delivery Report


**FINAL SOURCE RECHECK — PASS (2026-11-04).** [Android 15 emulator run 41769491366](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41769491366) succeeded with 120 test methods, including the fault/reopen SOS and HIGH-fall atomicity cases, exact ACK and up to 100,000 queued rows, policy-ledger corruption and compaction, real post-purge state deletion and cold restart. It tests production code `2c492efff01095e17f96af3c24ac07ac0b5c3739`. Historic freeze and earlier runs shown below remain initial evidence, not the final source. P8C-001, P8C-004, P8C-007 and P8C-011 are formally VERIFIED CLOSED in [closure matrix](PHASE8C_FINDING_CLOSURE_MATRIX_2026-11-04.md). This is a local Android SQLite/emulator durability acceptance, not production backend acknowledgement or arbitrary phone storage guarantee.


Production freeze: `967e5d5ceb7e485af997eb0f6380e9544cd39e79`
Primary expanded emulator evidence: run `41670141287` — SUCCESS.

## Core Journal invariant

Brick follows:

`CREATE -> durable local persist -> SEND -> server durable accept -> ACK -> local delete/delivered`

The Phase 8C tests exercise exact and out-of-order ACK behavior. Batch ACK is atomic: if the requested set cannot be satisfied, the batch does not partially delete unrelated pending rows. Reopening the Journal preserves remaining pending rows.

Corrupt encrypted/persisted rows are quarantined instead of blocking later valid backlog. Quarantine counts remain inspectable.

## SafetyOutbox invariant

Safety events use a separate durable local outbox. Tests cover:

- logical duplicate append/idempotency across reopen;
- exact event ACK and second-ACK rejection;
- corrupt high-priority row quarantine without starving SOS;
- SOS event + authoritative SOS-active state atomicity;
- injected SOS transition failure commits neither event nor state;
- high-fall event + protection deadline atomicity;
- injected high-fall failure commits neither half;
- I'M SAFE (`safe_checkin`) survives reopen and remains pending until exact ACK.

## Backlog and network chaos

The 8C emulator suite executes backlog-scale and network-chaos tests covering the planned 100 / 10,000 / 100,000-row and age-based 7-day / 14-day logic, ordering, batching, retry/backoff and safety priority behavior. The app uses bounded batches rather than loading the full durable history into memory.

The CI evidence establishes algorithmic/storage behavior. It does not substitute for leaving an OPPO offline for 7–14 real days; that unattended physical qualification is Phase 9.

## Live-path relationship

Fast Live is allowed only after the local Journal has accepted the point. It may coalesce obsolete render candidates, but this does not delete history; the durable Journal retains the history stream until server ACK.

## Result

The source-level and emulator-level durability invariants required by Phase 8C are satisfied. Remaining durability work is device qualification, not a known Android source defect.
