# Phase 8D — Device authentication, ACK and history safety: source evidence

**Last exact source SHA:** `6ef174d366932e75852d50667e8c836108d653da` (all 3 CI jobs pass [41791862854](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41791862854)).

## Ingestion boundaries (8D.3–8D.9)
- `src/location-ingest-v6.ts` verifies the signed body against the device's registered ECDSA P-256 key and rejects revoked devices at the initial lookup. It sends location events to Queue, persists D1 logical index + endpoints, may advance DO newest fix, evaluates safety, and then returns HTTP ACK; R2 persistence follows asynchronously in the Queue consumer.
- `src/history-store.ts` processes Queue location messages into 15-minute raw and trusted R2 objects. **Queue message ACK** is after both conditional object writes return success; if one fails, message retries. These are not an atomic two-object transaction, and a partial write can exist until retry repairs it.
- `src/queue-v6.ts` checks that each safety receipt's matching event exists in D1 before acknowledging it; absence/error triggers retry.
- Both concurrent overwrite and duplicate overwrite have verified RED pre-fix evidence and GREEN exact-source regression evidence; see `PHASE8D_RETEST_EVIDENCE.md`.

## Negative test coverage achieved
- ECDSA P-256 actual signature over health body; wrong key, wrong path identity, unknown/revoked identity, modified body, absent signature, malformed/oversized, stale/future time, replayed/out-of-order health counter.
- R2 same-segment competing writers, first committed packet immutable under duplicate sequence, earliest receipt, finite conditional retry.
- R2 raw-success/trusted-failure partial write: no queue ACK; retry repairs, no logical duplicate; sustained conditional conflicts: no ACK.
- Safety receipt D1 row missing or D1 query failure: no ACK; durable matching row: ACK.

## Gate status (NOT ALL PASS)
- 8D.3, .4, .5, .6, .9: **PARTIAL SOURCE/CI EVIDENCE**, not complete.
- Real Cloudflare Queue/DLQ/S3-compatible behavior, crash-window injection, all device APIs, complete PDF epoch orderings, DO WebSocket snapshots, and end-to-end backend deployments still unverified.
- P8D-007/P8D-008 source fixes are verified; audit finding closure still needs Cloudflare execution and a complete persistence audit.
- Existing R2 raw/trusted legacy segment data may have been affected by the previously shipped algorithm; actual production exposure and corruption unknown. Do not assert that historical data was lost without forensic evidence.

## Cloudflare reference used to choose the implementation
Current official Workers R2 API describes `R2Bucket.head`, `R2Bucket.put(...,{onlyIf})`, ETag equality and null on conditional failure: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
Official R2 consistency model confirms atomic conditional-write preconditions: https://developers.cloudflare.com/r2/reference/consistency/

**No deployment or live user data accessed during this test session.**
