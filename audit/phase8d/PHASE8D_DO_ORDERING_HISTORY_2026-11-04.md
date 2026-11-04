# Phase 8D continuation — DO archival/order boundaries and Git history

**IN PROGRESS / NOT PASS.** Continued the same branch from `3a294588613641fd9e608ff78a94a90bd8f8a921`, private GitHub ref verified unchanged. New executable `0a7e6eb6cbb35eae3d36d0621d8a7d3caa48f287` verified in hosted CI 41859178762, all 3 jobs SUCCESS. No Android edits, deployment, repository settings, Cloudflare resource/SQL writes or family data access.

## Reproduced defects

| Finding | Baseline failure | Correction | Evidence scope |
|---|---|---|---|
| P8D-054, confirmed P2 | Resident/reconstructed DO and stale constructor memory allowed health, network, latest safety event and three marker writes after persistent revocation. | Six writer methods check wsRevoked in the same transaction as compare/write; canEvaluateSafety refuses revoked state. Archived reads remain available. | Three focused archive checks; native workerd reconstructed object rejects all six writes and safety-evaluation permission. |
| P8D-055, confirmed P2 | Concurrent 102 then101 calls left three read-then-put high-water markers at101; epoch comparison could also regress. | Atomic conditional transaction per marker, ordered by epoch then sequence (scalar sequence for safety event marker). | Three focused concurrency cases including epoch2/sequence1 against epoch1/999; native RPC marker checks. |
| P8D-056, confirmed P2 | Health12 followed by delayed11, duplicate12 or unsequenced legacy overwrote the newer health snapshot. D1 replay reservation alone did not order subsequent DO publication. | Atomic health compare/write uses positive safe-integer healthSequence; duplicate/lower sequence rejected. Legacy accepted only before first sequence-aware record. | Two focused checks (stale/duplicate/legacy downgrade and active legacy/new sequence control); native RPC100/102/101 preserves102. |

Seven baseline negative checks failed; legacy/active control passed. All eight focused checks pass after correction. `PHASE8D_054_056_REPRODUCTION.txt` records the sanitized failure labels. No claim of publicly callable DO RPC or verified live exploitation.

State setters now return a boolean advancement result. Existing callers await and ignore it; rejected state writes do not broadcast. Health ordering follows the signed replay counter, not transport arrival time or an unsigned clock. Network and safety payloads receive a revocation fence; their broader delivery/time ordering semantics were not redesigned here.

These fixes **do not** create atomic D1+DO+Queue commits, serialize entire safety evaluation, remove the D1-to-DO revocation gap, or prove deployed behavior. A valid canEvaluateSafety result is not an exclusive claim/lease; two simultaneous evaluators and later D1 safety work remain separate audit concerns. Full safety event dedup/ACK and cross-store crash gates remain OPEN.

## Actual local native runtime

Extended existing production-entry workerd integration, with real local D1, Queue, R2 and DO. New internal RPCs run on a separate synthetic DO so returned RPC references do not pin the WebSocket hibernation target. These are test-only calls; no public route or test bypass added to production.

Native groups PASS locally:

- Signed location -> D1 -> Queue -> compressed R2, duplicate idempotency, DO state and synthetic Access JWT controls.
- Health publication ordering and three concurrent high-water markers.
- WebSocket survives hibernation/reconstruction and expires by idle storage alarm.
- After actual parent revocation and DO eviction/reconstruction, all six telemetry/marker writes returnfalse; safety evaluation refused; archived snapshot unchanged.
- Revoked D1/Fast Live route, subscription denial, current-state archive preserved.
- Actual38-table v3 snapshot/fresh D1 restore with revoked identity retained.

Harness initially deep-compared a returned RPC object proxy, then held that reference while requesting eviction of the same object. Corrected test reads proxy fields and uses a separate synthetic marker object; native checks pass. Those harness issues are not claimed Brick source defects. This remains local workerd evidence, not live Cloudflare acceptance.

## Read-only local Git history audit — 8D.15

New reproducible `scripts/phase8d-secret-history-audit.mjs` scans all unique blobs reachable from recorded **local refs**, refuses shallow history and oversized/unbounded inputs, reads values only in memory and emits only blob SHA, observed path and category. One observed path per unique blob is recorded; identical content can have other historical paths. Its positive/negative self-test is blocking in source CI; shallow Actions checkout is not falsely described as a full history audit.

Actual scan at HEAD3a29458:

| Measure | Result |
|---|---:|
| Reachable commits | 2,234 |
| Unique reachable blobs | 2,382 |
| Blob bytes inspected | 19,215,060 |
| Matching blobs | 10 |
| Matching category | Known historical weak development-verifier marker only |

Exact local refs and sanitized results: `PHASE8D_LOCAL_GIT_HISTORY_3a29458.json`. Known marker occurs in prior setup/template/workflow blobs and internal test/scanner source references. This confirms provenance for existing P8D-003; it is not proof of an active credential. No matches in the other inspected categories (private-key blocks with material, GitHub token formats, Slack tokens, Google key format, credential-container filenames). Status deliberately **FINDINGS_REVIEW_REQUIRED**, not a blanket clean-secret claim. Matching values/lines were not printed or saved.

This does not cover unknown/deleted remote refs, dangling objects, LFS payloads, releases, deployment/CDN/log contents, low-entropy unknown secrets, arbitrary Cloudflare token formats or actual credential rotation. Private visibility does not invalidate prior public exposure. P8D-003 live rotation verification and broader secret review remain open.

## Acceptance and next steps

Current exact-SHA source CI has verified all new and prior regressions; final proof below. Existing live evidence41839919454 attempt3 (old attestor SHA d74b30d, 15:16Z) remains NOT PASS: seven production/two dev missing bindings, absent expected Queue/DLQ, deployed source unknown, R2/Access read scope blocked, D1 catalog401 and public prod local login policy failure. No new live deployment/read-scope change has been demonstrated in this continuation.

Next unresolved work: deployed identity/bindings/Access, isolated current D1+R2+DO disaster recovery and cutover, Queue crash/ACK/DLQ, exclusive safety evaluation or equivalent idempotent D1 effects, live retention/rollback, configured repository protection and remaining method/auth/input coverage. Preserve the 19-section and 525-requirement ledgers; this report does not assert their exhaustive completion. **No Phase8D final PASS; no Phase 8E/8F.**


## Follow-up history scan at new executable source

After committing0a7e6eb6cbb35eae3d36d0621d8a7d3caa48f287, the same read-only scanner inspected2,235 reachable local commits,2,394 unique blobs and19,483,355 bytes. It reported11 matched blobs, all the known weak-verifier marker category; the extra marker is the scanner's own explicit legacy-verifier reference. No match in the other defined categories. Exact sanitized refs/paths in `PHASE8D_LOCAL_GIT_HISTORY_0a7e6eb.json`. Findings-review status and all coverage/rotation limitations remain unchanged. This scan includes the new code commit but not later documentation commits.


## Hosted source proof — 0a7e6eb6cbb35eae3d36d0621d8a7d3caa48f287

[CI 41859178762](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41859178762) **3/3 jobs SUCCESS**. Source job 126675937098: 65/65 steps; backup126675937168:7/7; deployment126675937752:7/7. Actual completed source log fetched: no error/FAIL lines; eight new DO tests, native RPC ordering/revoked archive checks, WS hibernation/expiry, scanner controls and all prior regressions including SQLite source-destruction/38-table restore PASS. Extract: `PHASE8D_SOURCE_CI_41859178762.txt` (106 PASS summary lines, not 106 independent tests).

P8D-054/055/056 **SOURCE/CI VERIFIED** to the exact scopes in `PHASE8D_DO_ORDERING_HISTORY_2026-11-04.md`. Latest local full reachable-history scan at executable HEAD0a7e6eb:2235 commits/2394 unique blobs/19,483,355 bytes;11 known weak-verifier-marker matches only among checked categories, including scanner's own legacy reference. `PHASE8D_LOCAL_GIT_HISTORY_0a7e6eb.json` is sanitized evidence, not rotation or all-secret absence proof.

Cross-store revocation and crash/ACK, exclusive safety evaluation, exact live source/config/Access, full Cloudflare D1+R2+DO disaster recovery, retention/rollback, repository protection and remaining endpoint coverage stay OPEN. Live attempt3 of41839919454 is still the latest inspected live evidence; no claim that this code is deployed. No Android edits, deployment, Cloudflare writes, user family data or repository settings changed. Follow-up commit contains documentation/evidence only. **Phase8D NOT PASS; no Phase 8E/8F.**
