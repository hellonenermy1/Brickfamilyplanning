# Group 1 — reviewed recovery schema definitions

11 November 2026, Singapore. G1.5/P8D-002. Executable `b68dfaf182dd0c758ce84b72e89dbe0fa5589623`, tree `7ce2510ae3db9259952785f34b3a5cbeedcd91ca`; baseline `591424bb59e5f7d5e01fc2b78d8dcd28ea47639b`. PR32 remains draft/unmerged against beta base `141cbf42efaa61873c4fa87138ca5a0a19d404a2`.

## Reproduced defects

Three independent controlled native reproductions are retained by `node scripts/test-phase8d-recovery-ddl.mjs --baseline-only`:

1. Dropping the unique public-key index left column and FK metadata unchanged. Restore returned success; another device could subsequently reuse the restored identity key.
2. Weakening the geofence radius CHECK also passed restore. The target then accepted radius1 although the reviewed minimum is25.
3. A populated application table named `sqliteXshadow` was silently omitted from capture. SQL `LIKE 'sqlite_%'` treated the underscore as a wildcard rather than checking SQLite's literal reserved prefix.

These are local disposable D1/source observations, not claims about deployed state or family data.

## Complete bounded schema identity

The existing inventory query now includes application-owned explicit indexes and checks the exact literal `sqlite_` prefix case-insensitively. Classified primary and diagnostics inventory remains mandatory; a lookalike application table cannot hide behind the internal-prefix exemption.

`src/cardfree-recovery-ddl.ts` compares canonical SQL-token definition identities for all117 reviewed application tables/indexes:49 primary tables,59 primary indexes,6 diagnostics tables and3 diagnostics indexes. Names, object type, bound table and token sequence participate. Existing exact two-trigger checks and view refusal remain separate and required. SQLite-owned autoindexes are represented by their parent table definitions; reserved provider/migration bookkeeping keeps its explicitly bounded existing handling.

The readable policy artifact is `PHASE8D_GROUP1_REVIEWED_DDL_POLICY.json`, derived from effective checked-in primary migrations/beta compatibility columns and `schema/beta_diagnostics.sql` on disposable SQLite. Primary digest: `3bd9901c9432c41fe9483b2d9dca31f0f9b41bf2ffd5c2dd856a807ea3bba7be`; diagnostics digest: `a2f985b2ab01091eac21a2ae3397e35ce8d3071bbe64d2b043662e4b6986b943`. It records no independent reviewer or production observation. A schema change requires explicit source/policy review and qualification, not auto-enrollment from the observed target.

ASCII whitespace and SQL comments outside quotes are ignored; quoted tokens/literal bytes, constraint operators, indexed columns/order, uniqueness/partial predicates, CHECKs, collations, conflict/deferred policies and table options remain significant. Unsupported or semantically equivalent alternative definitions can conservatively refuse. This is pinned token identity, not a general SQLite semantic-equivalence parser. Unicode spacing is not silently treated as SQLite ASCII whitespace. Definitions are limited to65,536 UTF-16 code units, and a store manifest has at most256 definitions; one SHA-256 operation verifies the manifest.

Both source export/capture and fresh-target preflight enforce it. The existing post-write inventory recheck also catches index/constraint changes after preflight. Additional or missing ordinary indexes refuse alongside unique-index drift; all reviewed ordinary indexes remain supported. Nothing silently drops an unrecognized index to make a restore succeed. The inventory still uses its existing SQL query, and existing relationship/capture suites demonstrate source max5 SQL calls per bounded page.

## Qualification and remaining gates

30 focused native tests cover actual retained unique-key/CHECK enforcement,19 target schema faults,3 full/bounded source refusals, post-preflight index drift, readable-manifest identity and SQL lexical edge cases. The existing24 relationship tests and26 capture/coordinator cases passed during implementation. All26 local workflow run groups passed. Exact source push42944392314/job130273561648 and PR42944398915/job130273583662 audits passed33/33 each; Phase2 42944398828/job130273582738 passed14/14 and portal42944398818/job130273582659 passed10/10. Complete decoded logs have zero error markers and both audits contain30 definition,24 relationship,12 value-parity,26 bounded capture/coordinator and full populated encrypted recovery successes. PR merge `03e5938118735ec1b08cf3c705411aebff5e2e91` has expected base/source parents and identical tree. Exact records are in `PHASE8D_GROUP1_REVIEWED_DDL_EVIDENCE.json`.

Actual provider schema/support, immutable trusted installation, complete writer quiescence, independent destination/key/journal custody, real schedule/alerts, isolated cloud interruption/rollback and agreed measured RTO/RPO remain required. Failed fresh restore targets must stay isolated and must not be repaired by blindly replaying into partial data. No distributed transaction or automatic rollback is promised.

The90-file Worker source graph and canonical525/full acceptance ledger remain unchanged. No runtime activation, cloud/provider/family-data operation, credential/permission change, notification, R2/card/billing, APK/UI change, merge or deployment. Group1 `IN_PROGRESS_NOT_READY`; P8D-002 `P1_OPEN`; Phase8D `NOT_PASS`.
