# Brick V1 — Phase 8C Durability and Delivery Report

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
