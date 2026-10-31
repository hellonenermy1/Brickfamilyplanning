# Brick Progress — Phase 2 API-Origin / Bounded-Response Checkpoint

Date: 2026-10-31
User request: continue Phase 2 from existing work; do not restart.

Work continued directly on the existing Phase 2 staging PRs. No canonical merge and no Phase 3 acceptance work was started.

## Defect found and fixed

Android evidence enqueue previously treated any nonblank stored `apiBase` as valid. If that preference became corrupt (HTTP, credentials, path/query or malformed URL), Brick could keep durably journaling evidence even though the transport later rejected the origin. That creates a low-priority backlog that cannot drain automatically.

Phase 2 now has one canonical `EvidenceApi.normalizeBase()` HTTPS-origin validator used by both enqueue/drain and transport. Invalid origins are rejected before evidence persistence. Regression source covers HTTP, userinfo, non-root path, query and malformed URL cases.

The evidence HTTP client also caps ACK/error response reading at 65,536 bytes and disconnects in `finally`, so a broken/malicious server cannot return an unbounded response body to the evidence worker.

Cloud CI is pinned to the exact Android checkpoint and statically guards the origin validator, bounded response cap and regression source.

## Exact current pair

- Android: `82ac7f6b0279ac6a3740bc788515bd65af0478f4`
- Cloud: `c98d8aad6f63699984bd88394539b7c78efcab0b`

PR #6 and PR #7 descriptions were updated and remain draft/open/unmerged.

## Hosted execution

Run `41217632543` again failed before runner assignment:

- Cloud job: `runner_id: 0`, `steps: []`;
- Android build/lint job: `runner_id: 0`, `steps: []`;
- Android instrumentation: skipped.

No source executed. Phase 2 remains **NOT ACCEPTED**.

## Deliberate non-change

Android evidence retention/deletion was not changed. The fixed program assigns long-outage/storage-pressure qualification and 7–14-day backlog behavior to later reliability testing; deleting unsent evidence in Phase 2 without measurement would weaken durability semantics.

Cloudflare R2 lifecycle source was also left unchanged after verifying that age values are seconds and Brick’s Phase 2 setup writes the existing Brick-managed history/multipart rules plus the new raw-evidence rule as one complete lifecycle policy.
