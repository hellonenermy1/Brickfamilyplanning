# Brick Progress — Phase 2 Identity-Bound Journal Checkpoint

Date: 2026-10-31
User request: continue Phase 2 from existing work; do not restart.

Work resumed directly on PR #6 / `v1-p2-evidence-cloud` and PR #7 / `v1-p2-evidence-android`. No canonical merge and no Phase 3 acceptance work was started.

## Defect found

The Phase 2 evidence journal did not retain a durable owner identity. A re-pair while old evidence remained offline could therefore allow those records to be sent under the new paired device ID.

## Fix implemented

- evidence DB schema v3 adds `evidence_owner`;
- owner binding and normal evidence insert occur transactionally;
- dispatcher verifies journal owner before drain;
- identity change quarantines old pending evidence instead of re-attributing it;
- fresh evidence under the new identity continues automatically;
- `JOURNAL_FAILURE` separates local persistence failure from remote transport/ACK failure;
- worker includes journal failures in bounded persistent-failure backoff;
- instrumentation source proves old child-A evidence gets zero network calls after re-pair to child B and remains quarantined while B can collect/send fresh evidence.

Because sequential contents writes were observed rebuilding from stale connector trees, the final Android changes were assembled with one Git tree/commit and the branch was advanced with an expected-SHA lease.

Exact current pair:

- Android `8bc21222a327e15e24503a1ec5ad20c5a4cbcdf7`
- Cloud `e8a12f14894f3dca13a9dcb97d16c1a2c9a1b592`

Cloud CI pins that exact Android head and checks the new ownership/re-pair invariants.

Latest hosted run `41216812499` again had `runner_id: 0` and `steps: []` for both prerequisite jobs; instrumentation was skipped. Nothing ran, so Phase 2 remains **NOT ACCEPTED**.

PR #6 and PR #7 descriptions were updated to the exact pair and remain draft/open/unmerged.
