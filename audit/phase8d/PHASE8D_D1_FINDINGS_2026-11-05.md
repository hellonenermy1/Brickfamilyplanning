# Phase 8D D1 storage reproductions — 5 November 2026
Baseline: beta/backend-portal @ 488b34f2f2f807c107b4c1e9eee9dccff717011f. Work branch: audit/phase8d-d1-qualification. No live deployment or user data mutation.
Requirements: BE-007/010/011, DAT-011, OPS-002/003, SEC-021; PDF8D.5/.6/.8/.16/.17/.19. Technology-specific R2 names remain historical; approved D1 substitution does not waive data integrity.

## P8D-068 — D1 object read may return mismatched metadata/content or corrupt bytes
Severity P1 (storage integrity); source reproduced, correction pending.
src/dev-free-runtime.ts D1ObjectBucket.get reads metadata and chunks in separate D1 transactions, concatenates ordered chunk bodies without validating exact indices or content digest, and trusts metadata size.
Actual local Miniflare D1 tests at the baseline:
1. Replace OLD with same-size NEW between metadata/chunk reads: returned ETag is hash(OLD) but body NEW.
2. Replace stored four-byte chunk good with evil without metadata change: get serves it rather than rejecting.
3. Move second chunk index from1 to9 while preserving byte count: get serves it.
No actual live corruption or exploit is claimed. APK download separately checks its pinned digest, but generic objects do not inherit that check.
Required: one atomic metadata/chunks read, validated size/count/contiguous indices and SHA256 before returning bytes. Exercise same-size overwrite race, corruption, missing/reordered chunks, bounds, range/metadata and native runtime behavior.

## P8D-069 — D1 adapter silently ignores conditional object writes
Severity P2 confirmed adapter contract defect; actual live history loss not established.
src/dev-free-runtime.ts D1ObjectBucket.put accepts options but ignores onlyIf. src/history-store.ts passes Headers If-None-Match:* or etagMatches for merge concurrency.
Actual local Miniflare D1 baseline: create-only overwrote existing object; stale expected-ETag overwrote new content/metadata; two concurrent writers with the same old ETag both succeeded. Direct-D1 append history is a distinct path and this reproduction does not claim that ordinary location ingest calls processHistoryBatch.
Required: transactional fail-closed conditional create/update preserving bytes/metadata on rejected precondition; exactly one concurrent winner; do not swallow unrelated D1 failures. Unsupported condition forms must not silently become unconditional writes.

## P8D-002 — D1 replacement recovery scope (existing P1, remains open)
backup-v6.ts snapshots38 durable legacy tables but explicitly classifies dev_location_history/dev_object_store/dev_object_chunks among DEVELOPMENT_RECOVERY_TABLES outside that snapshot. The approved deployed beta now uses those tables for primary history and private evidence/models/APK object bytes. Separate beta diagnostics and two DO namespaces also require explicit preserve/reconstruct policy.
This is source-confirmed coverage drift, not proof that Cloudflare PITR is absent or live data has been lost. Existing R2 recovery tests cannot qualify D1 replacement. Keep P8D-002 open until a synthetic full D1+diagnostics+DO capture/destruction/fresh restore and named cloud drill demonstrate required recovery.

## Original reproduction receipt
scripts/test-phase8d-d1-object-integrity.mjs against original runtime:6 FAIL /2 PASS in actual local Miniflare D1. Passing controls: unrelated database failure propagation and uncorrupted multichunk/range roundtrip. Tests contain synthetic objects only. Fixture API was corrected to use the installed Miniflare5 conversion helper before these results; harness initialization error is not counted as a product failure.
