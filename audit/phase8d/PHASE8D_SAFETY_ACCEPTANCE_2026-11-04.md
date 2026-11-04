# Phase 8D continuation — signed safety acceptance and transactional state ownership

**IN PROGRESS / NOT PASS.** Continued existing private audit branch from `807025e341df327bcac9385180602f76b570ef7c`. No new endpoint, schema migration, Android edit, deployment, repository settings, Cloudflare resource/SQL mutation or family-data access. Hosted exact-SHA evidence is pending below; prior executable0a7e6eb remains previous accepted source-test evidence.

## Findings confirmed before source edits

| Finding | Reproduced behavior | Correction |
|---|---|---|
| P8D-057, P2, 8D.3/.6/.7 | Fall inserts after Queue-time revocation; ordinary signed SOS inserts after revocation at final authorization read. | Shared D1 INSERT SELECT condition requires active identity within event insertion itself. Refused insert classified401; no D1 event/DO publication. |
| P8D-058, P2, 8D.5/.6 | Global event ID already owned by deviceB caused deviceA request to receive false successful duplicate ACK. Both fall and ordinary SOS paths reproduced. | Ignored insert is a duplicate only after confirming active device plus existing row with same owner and kind. Conflict409, no publication, prior row retained. Fall early duplicate path also checks lifecycle/kind. |
| P8D-059, P2, 8D.4 | Signed malformed fall coordinates/accuracy were silently converted or persisted, consuming Queue and creating partial evidence. | Coordinate pair/type/finite/range and accuracy validated before Queue work; invalid400. Valid0,0 and accuracy0 preserved. |
| P8D-060, P2, 8D.5/.7/.9 | Stale evaluator lost conditional state write but still inserted/reported an alert; revoked snapshot wrote state/event; duplicate concurrent snapshots published same event twice. | Event inserts and geofence/trip state updates share snapshot-marker compare conditions plus active identity in one D1 batch transaction. Only newly inserted rows returned/published. Losing newer work re-reads and retries; no false global marker advancement. |

Sanitized baseline failures: `PHASE8D_057_060_REPRODUCTION.txt`. Final RED route bundle was built from exact baseline source with valid `sos_started` kind. Initial test fixture used nonexistent `sos`; that fixture error was corrected before the recorded RED proof and is not a source defect.

## Current evaluator transaction

1. Read geofence/trip snapshot and compute qualified dwell/transition effects.
2. Prepare event INSERT SELECT statements guarded by the original entity epoch/sequence (or absent-state condition), current enabled fence/active trip and active device.
3. Execute those event inserts followed by guarded state updates in **one D1 batch transaction**. Event inserts precede state changes so all events of an owned multi-transition batch see the original ownership condition.
4. Use actual event-insert `meta.changes` to return/broadcast only newly durable events. A state-write error rolls back prior event inserts; nothing is broadcast before successful batch completion.
5. If state compare loses, re-read current state. Device revoked/missing returns without marker advancement. Active contention retries at most twice after the initial attempt; unresolved contention raises a dedicated error. Single/batch location routes turn that error into retryable503 so the child retains its journal and resubmits.

No DO-wide exclusive lock or new migration introduced. A losing earlier input may correctly be obsolete; a losing newer input is not silently skipped. A queued location retry still executes safety evaluation even when location persistence was already idempotently accepted.

## Focused tests —24 pass locally

**12 actual outer Worker tests:** real P256 signatures/native SQLite; two revocation interleavings, two cross-device ID collisions, seven malformed signed fall coordinate/accuracy cases, active valid0,0 persistence and own duplicate control.

**12 actual evaluator/native SQLite tests:** geofence newer/revoked winners, concurrent duplicate snapshots, ordinary success, trip newer/revoked winners, concurrent overdue duplicate, missing initial geofence state, multiple legitimate transitions in one batch, forced state-write failure with event rollback, deterministic different-input contention/re-read and bounded sustained contention failure. Phase7 qualified/degraded position runtime fixture remains passing.

Existing Fast Live, DO telemetry/revocation/markers and native integration regressions rerun locally. Native production-entry workerd now also verifies malformed fall rejection, valid0,0 signed event and actual own duplicate, then denies a new signed event after parent revocation. Existing local D1/Queue/R2/DO/Access/WS/38-table restore integration retained. Hosted complete CI must verify the new exact executable SHA before source closure.

## Limits and open safety questions

- D1 event/state atomicity is not atomic Queue+D1+DO. Queue receipt can precede a later refused insert; orphan receipt/retry/DLQ handling remains a live fault/observability gate.
- Cross-store revocation after a committed insert but before publication remains separate; the existing DO persisted fence prevents writes once reached.
- These changes do not establish a globally durable eventSequence ledger across distinct UUIDs/kinds. Fall still reads DO high-water separately from insert/commit; simultaneous distinct IDs with a shared sequence remain an unresolved replay/concurrency audit target. Do not call safety replay globally closed.
- Snapshot ownership covers the current `evaluateSafetyBatchV6` used by location ingestion. Dormant legacy `evaluateSafetyV6` was not silently treated as equivalent; its reachability/retirement and source inventory remain to verify.
- Comparing state epoch/sequence assumes changes to evaluator state advance that marker. Simultaneous parent place/config edits and full live D1/Queue concurrency need their own proof.
- Realtime push failure after durable event can leave a missed live update; archived D1 truth remains. Do not claim exactly-once end-to-end notification delivery.

## Remaining Phase 8D gates

Latest inspected live evidence remains41839919454 attempt3, old attestor source d74b30d: prod seven/dev two missing bindings, expected Queue/DLQ absent, deployed source unknown, R2/Access read permission blocked, D1 catalog401 and public production local-login policy failure. None is fixed by these source commits. Dedicated read token still needs Workers R2 Storage Read, Access Apps & Policies Read and D1 Read for the correct account; no token values requested.

Full isolated current Cloudflare D1+R2+DO backup/destroy/restore/cutover, live fault/ACK/DLQ, ownership/session/WS/rate enforcement, retention/log/rotation, migration/rollback, configured repository protection and19-section/525-requirement reconciliation remain open. **No final8D PASS; no8E/8F.**


## Exact source commit and queued hosted verification

Executable `9b2601d9742c02bf55e45f5a2ddaf40e2661a916` pushed on the same audit branch. [Hosted CI41862396858](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41862396858) currently **QUEUED**, all3 jobs unstarted on repeated API checks. No runner-failure/billing/permission cause established; no hosted PASS inferred. Prior green executable remains0a7e6eb for CI claims.

Current source local evidence:24 focused signed-route/evaluator checks PASS, Phase7 safety-quality fixture PASS, typecheck PASS, native actual Workers D1/Queue/R2/DO/Access/WS/recovery plus signed fall route PASS. Broader source-build command run:55 groups attempted,54 exited0 within explicit command omissions,1 stopped at missing sqlite3 executable in test-phase8d-controls-sqlite.mjs. Other CLI-dependent commands/schema replay were omitted; this is not a full local CI pass. Exact grouping/omissions: `PHASE8D_LOCAL_REGRESSION_9b2601d.json`.

P8D-057/058/059/060 status: **SOURCE FIXED, LOCAL RETEST VERIFIED, HOSTED CI PENDING**. Next continuation must inspect this exact hosted run and job logs, resolve any real regression, then record source closure. Do not restart or call the queued run green. Existing live Cloudflare findings, distinct-ID sequence replay ledger, full cloud recovery/rollback and remaining audit gates stay OPEN. No deployment, schema migration, Android/family data or settings changes. **Phase8D NOT PASS.**
