# P8D-083 — bounded inherited cleanup

Baseline74b359808924f884b98656bac689fc73ffc0aede. Initial6c486080 test bootstrap failed because fixture devices reused a public key; this is not product RED evidence. Fixed test-only1580ea7566ced54e61aa93f2aa7fea0d17aee8c5 push42059917929/job127358391575 reproduces0/5 passing:44-statement exhaustion and unbounded endpoint/audit/session/safety rows. Actual log inspected before remediation.

Implemented correction: D1 refinement-retention scans8 oldest frames plus8 oldest intervals, removes exact unchanged source identities and unchanged/unreferenced object metadata in one D1 transaction with chunk FK cascade, and sweeps256 old endpoints. Successful deletion is the durable continuation position; no cursor reset/restart. Changed source rows/objects and shared referenced objects survive stale selection. No new state table/archive inventory. A separate existing-namespace scheduler object owns a44-statement computation guard and raw durable receipt reserve. Remaining eligible backlog is PENDING, preserving last success. Other daily cleanup tables cap200 rows per table/call, preserving original raw/safety/health/crash/audit/auth policies. Index-only021 supports candidate seeks and key-reference guards; staged only, no live schema application.

Hosted verification completed at the exact source below; source/CI scope only. Existing legacy non-D1 refined cleanup remains unchanged. No new TTL7-day policy or UI/APK modifications. Row caps do not prove arbitrary fleet/day/CPU/storage or all watchdog/query-read bounds. Object chunk cascade cost remains tied to the existing32MiB object format limit, not constant CPU. Invalid metadata and continuously refreshed old data can require operator review; this does not invent a general poison-row repair protocol. Operational independent private backup/PITR/cloud recovery, Atlas authority/model history and all525 final reviews remain open. P8D-002 P1 OPEN, Phase8D NOT PASS. No live deletion, cloud mutation, binding/service/secret/R2/card/deployment.

## Scheduled cleanup coverage

| Task | Eligibility preserved | Per-call work after this correction | Verification scope |
| --- | --- | --- | --- |
| D1 hypothesis frames | First receipt/created_at older than30 days |8 source rows, exact composite identity, conditional object metadata + FK chunks | Backlog, rollback, source/object refresh and shared reference |
| D1 refined runs | to_ms older than90 days |8 source rows in same atomic transaction | Backlog/null-object/rollback |
| D1 precise endpoints | created_at older than30 days |256 rows |700-row fixture and indexed seek |
| Safety events | Per-device30–3650 days (default180), plus device-created time older than30 days |200 eligible rows | Custom365-day exclusion,701-row backlog and180/30-day boundaries |
| Pairing tokens / device events | expires_at older than1-day grace / created_at older than30 days |200 each | 701-row backlogs, boundary and fresh-row controls |
| Health samples / closed incidents | received_at older than35 days / ended_at older than365 days; open incidents retained |200 each |701-row fixture and open-incident control |
| Crash / audit | received_at older than365 days / created_at older than90 days |200 each | Audit701-row backlog and exact boundary controls |
| Parent sessions | Expired OR revoked more than7 days ago |200 total |701 expired, active/recent revoked controls |
| Legacy parent bootstrap tokens | Prior behavior purges all tokens, not a new TTL |200 per call | 701-row synthetic backlog; no new token TTL and no live auth mutation |
| Development object store / raw scrub | Existing per-prefix upload/receipt policies | Existing200 objects/prefix;5000 history deletes and5000 raw scrubs | Earlier qualified retention suite rerun; not newly recounted as independent cases |
| Semantic indexes / beta diagnostics | Existing aliases expiry,30-day sightings / beta's existing TTL | Existing500 rows/index;1000 rows/diagnostic table | Earlier suites rerun; no changed policy |

These are mutation/statement envelopes, not full read/CPU/day/storage/fleet guarantees. Safety's per-device retention predicate and auth's OR eligibility can inspect more rows than they mutate. FK chunk cascades remain proportional to selected object size (writer format caps32MiB); physical erasure/PITR expiry is not established. An oversized/malformed DB inserted outside supported writers is not certified by the object format limit.

## Explicit remaining source boundary
The inherited index.ts runOpsWatchdog still selects every active device and calls openOfflineIncident per overdue device before delivering alertPersistentIncidents (up to100 alerts) through device RPCs. This was inspected, not load-reproduced or corrected in this batch. That fanout can exceed a statement/CPU budget and still needs isolation and durable progress without weakening safety alert timing. Do not call all global maintenance bounded because cleanup batches now are bounded. Arbitrarily limiting safety checks without an evidence-backed delivery-latency contract would leave devices unchecked; resolve the intended envelope before declaring fleet acceptance.

Refinement-retention's partial work now reports PENDING; the other daily tables finish a bounded sweep and run again on the existing daily cadence. Their receipt means a bounded sweep succeeded, not that all old backlog was erased. At sustained input above a sweep's capacity, retained extra old data and timely pruning are unresolved capacity concerns. Global endpoint cleanup can race in-flight refinement; retained refreshed identities are guarded, but arbitrary distributed reader snapshots are not certified.

Legacy non-D1 refined cleanup remains historical behavior; D1 source qualification is not R2/Queue operation proof. The approved no-card D1 architecture and existing APK/UI are preserved. No final-production seven-local-day Logs feature was implemented here.

## Exact hosted verification
Push42060763413/job127361494675 and PR42060908234/job127362020429 completed-success, all29 steps each. Portal/map42060909270/job127362020566 all10 success. Actual logs inspected, exact sourceb46f306dcbb91648f15cd6f69dae068d888d1fdf confirmed, zero GitHub error markers. PR checkout3b16be9e771cd81577a7d021d1b98c170ba75476 merges the source into612d4a8b16fb829f9528b06ab6448ab85ac483e6. Twenty cleanup cases and the additional populated retention RPC/root-PENDING case pass; native budget suite4/4 includes3 inherited cases. Full inherited suites pass. Exact metadata/extracts: PHASE8D_CLEANUP_BACKLOG_HOSTED_EVIDENCE.json. No local runner available this turn; hosted Miniflare D1 is not live cloud proof.
