# Brick Progress — Phase 2 Conflict Isolation / Batch-Link Integrity Checkpoint

Date: 2026-10-31
User request: continue Phase 2 from existing work; do not restart.

Work continued directly on the existing Phase 2 staging branches. Nothing was merged into `main`/`apk-download`, and Phase 3 was not treated as accepted/unlocked.

## Permanent 409 head-of-line blockage fixed

A true server evidence identity/content conflict returns HTTP 409. Previously a conflicting front-of-queue record could retry forever and block all later evidence.

Android now uses typed `EvidenceUploadConflict`. For a multi-record 409, the dispatcher probes the already-selected records individually with fresh transport batch IDs. Valid records receive exact ACKs; only records that independently return 409 are retained as `acked=2` quarantine. Brick Core can preempt between probes. Quarantine is not deletion and not an ACK.

Instrumentation source `testServerConflictIsolatesOnlyConflictingRecordAndDoesNotBlockLaterEvidence` covers two valid neighbors plus one conflicting record and verifies later evidence is not blocked.

Health telemetry now includes server-conflict count/time, re-pair quarantine count/time and evidence upload failure streak.

## Low-priority wakeup reduction

Persistent Brick Core backlog now defers evidence by at least 60 seconds instead of polling every 10 seconds. Healthy evidence catch-up remains 2 seconds. This keeps evidence lower priority in both network ordering and wakeup behavior.

## Cloud 409 contract locked

The signed route harness now sends changed content using an already-durable record identity and requires HTTP 409, not 503, with no new D1 record/batch or R2 raw object. This makes Android conflict isolation depend on an explicit cross-layer contract.

## Batch-link integrity hardening

`evidence_batch_records` duplicates epoch/sequence for batch membership. Durable retry previously ordered by those duplicated values. Retry now orders by authoritative `evidence_records` epoch/sequence and rejects any link whose duplicated epoch/sequence do not exactly match its referenced record.

The mandatory persistence harness now corrupts one link epoch, requires `EvidenceConflict` without another R2 write, repairs it and proves exact duplicate ACK recovery. A focused helper script records the same corruption scenario independently.

No Phase 5/6/7 placeholder-table semantics were guessed into Phase 2 schema; those tables remain foundations only.

## Exact current pair

- Android: `c077a4a5bc7805dda81a55db52c33f73f0050626`
- Cloud: `df0824ce7f8f0c863960b267067f721470e4af5a`

PR #6 and PR #7 descriptions were updated and remain draft/open/unmerged.

## Hosted execution

Run `41218888600` again failed before runner assignment:

- Cloud job: `runner_id: 0`, `steps: []`;
- Android build/lint job: `runner_id: 0`, `steps: []`;
- Android instrumentation: skipped.

No source executed. Phase 2 remains **NOT ACCEPTED**.
