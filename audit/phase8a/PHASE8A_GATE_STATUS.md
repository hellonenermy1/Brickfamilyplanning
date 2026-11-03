# Brick V1 — Phase 8A Gate Status

## Status

**NOT DONE — BLOCKED BY ONE SOURCE-VALUE GAP**

Phase 8A has completed the requirement discovery, source reconciliation, conflict resolution, normalization, ownership/dependency mapping and acceptance-matrix work.

It is deliberately not marked PASS because the audit plan requires zero unresolved source gaps.

## Frozen current contract state

- Current unique V1 requirements: **525**
- Mandatory: **485**
- Forbidden: **24**
- Optional-if-supported: **14**
- Future-interface: **2**
- Superseded historical baseline rows retained for traceability: **3**
- Open semantic conflicts: **0**
- Unmapped latest-plan subsections: **0**
- Unknown/unowned current requirements: **0**
- Open source-value gaps: **1**

## The remaining blocker

`P8A-GAP-002 / LIVE-005`

The approved plan requires the Live Track pipeline to meet the `23R P95 latency budget`, but no recovered authoritative source provides the numeric threshold(s).

What is source-backed today:

- dedicated accepted-fix -> local persistence -> realtime packet -> Durable Object current state -> WebSocket -> map-render path;
- stage instrumentation for source age, persistence, phone send, backend, WebSocket and browser render delay;
- roughly 2-second Live Track update cadence where appropriate;
- heavy history/Atlas/reverse-geocoding/backlog work must not head-of-line block live state;
- real-device/browser P95 measurement is mandatory.

What is **not** source-backed enough to freeze as contract:

- a specific numeric end-to-end P95 latency threshold;
- specific numeric per-stage P95 thresholds.

Earlier assistant-proposed values are not treated as approved requirements without user/source evidence.

## Remaining work before Phase 8A can be DONE

1. Recover the authoritative numeric 23R P95 threshold(s), **or** explicitly amend the V1 contract with approved values.
2. Write the numeric values into `LIVE-005` and the Phase 9.7A acceptance matrix.
3. Re-run the requirement-count/hash/duplicate/conflict validation (count should remain 525 unless the amendment creates another atomic requirement).
4. Produce `PHASE8A_CLOSURE.md` with `PASS` only if open source gaps = 0.

No implementation audit is required to close 8A; implementation reality begins in Phase 8B after the contract is fully frozen.
