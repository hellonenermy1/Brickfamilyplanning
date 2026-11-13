# Group 1 — recovery relationship and deletion contract

11 November 2026, Singapore. G1.5/P8D-002; source `e1e1a6ccccc02dac5f083722fea90acc05343f1c`, tree `c94c4eb7a23fc9391c319fbc89406aeab2cb2a08`, parent `3679e20358bef47cdff40d35b2e395462759827a`. PR32 remains draft/unmerged against beta base `141cbf42efaa61873c4fa87138ca5a0a19d404a2`.

## Reproduced recovery defect

The prior native restore accepted a fresh target whose `dev_object_chunks` table had the same columns, PK and values, but lacked its foreign key to `dev_object_store`. Restore returned success and `PRAGMA foreign_key_check` returned no violations. Deleting the restored object's metadata then left its bytes orphaned. A violation query checks declared relationships; an absent constraint cannot report its own absence. This was a controlled local native D1 reproduction, not an observed deployed incident.

## Source correction

The internal recovery library now checks the reviewed effective primary migration contract:42 grouped constraints across35 tables,46 child/parent column links. Diagnostics currently declares no foreign keys; unexpected diagnostic relationships refuse. Foreign-key IDs and clause/result ordering are normalized; composite column sequence, referenced table/columns, update/delete action and match behavior remain significant. Missing, modified, duplicated, partial, malformed or unrepresented relationship metadata refuses.

Inventory obtains relationship metadata in a correlated table-valued SQLite PRAGMA projection in its existing schema query. Both legacy full export and held bounded capture pages use it, as does fresh-target preflight. Successful restore additionally rechecks schema inventory after writes; an intervening schema change cannot be excused by a good preflight. The bounded source page remains at most5 SQL calls; no additional query per table is added to that path.

Package finalization and restore also verify every declared primary child tuple against indexed parent tuples before sealing/writing. Composite tuples remain grouped and SQLite's optional-NULL relationship behavior is preserved. Device/place/witness/receiver/batch/evidence orphans refuse before either store receives restore writes. Parent indexes are reused by table/column identity; this is not a nested child-by-parent scan. No diagnostic-to-primary FK is invented where the reviewed schema declares none.

The new policy module is `src/cardfree-recovery-foreign-keys.ts`; it is an explicit reviewed contract, not permission to auto-accept whichever schema is observed. A legitimate relationship migration requires a policy/source review and qualification. Existing column/trigger/view checks, original BLOB/timestamp/all-column postflight, object hashes, command retirement and excluded credential state remain required.

## Validation and limits

24 native cases cover real cascade deletion,8 target schema mutations, unexpected diagnostic FK,3 source capture refusals, post-preflight schema drift,6 orphan data graphs, max5 source calls, order normalization and malformed composite metadata. Reproduction is retained via `node scripts/test-phase8d-recovery-foreign-keys.mjs --baseline-only`, which explicitly loads the old3679e20 recovery source into a disposable native fixture. Existing18 schema tests passed during implementation. All26 local workflow run groups passed. Exact-source push42942099796/job130266099374 and PR42942107024/job130266122467 audits passed33/33 each; portal42942107063/job130266122086 passed10/10 and Phase2 42942106763/job130266120753 passed14/14. Complete decoded logs have zero error markers; both audits contain24 new relationship cases,18 schema cases,12 value-parity cases and signed populated encrypted recovery. PR merge `130714e9e43199710ebfc7d75349db27fa51698b` has expected base/source parents and identical tree. Exact records are in `PHASE8D_GROUP1_RECOVERY_RELATIONSHIP_EVIDENCE.json`.

This establishes a bounded declared-FK contract, not a full SQLite DDL equivalence proof. It does not independently attest every CHECK, UNIQUE, collation, deferred-constraint, index or provider behavior. Current cloud support/schema, full writer quiescence, safe custody, scheduling, interruption/rollback and measured agreed RTO/RPO still require the approved isolated operational qualification. A failed restore can leave a partial isolated target; it must not be promoted or repaired by replaying into it. No cross-database transaction or automatic rollback is promised.

The90-file Worker graph and canonical525/full acceptance ledger remain unchanged. No production library activation, provider/cloud writes, family-data operation, key/permission change, notification, R2/card/billing, APK/UI change, merge or deployment. Group1 `IN_PROGRESS_NOT_READY`, P8D-002 `P1_OPEN`, Phase8D `NOT_PASS`.
