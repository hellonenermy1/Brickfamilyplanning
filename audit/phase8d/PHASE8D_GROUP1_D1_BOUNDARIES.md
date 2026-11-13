# Group1 — inactive D1 execution ownership

Group1 NOT READY; Phase8D NOT PASS; P8D-002 P1 OPEN. This source batch expands the inactive actor hooks to D1 execution. No production controller, authority binding, capture route or outage bypass is installed.

## Execution surface

stagedCaptureDatabase returns the exact original database when its internal writer controller is absent. stagedCaptureDatabases likewise preserves the exact original environment when neither database is configured. Active fixture adapters wrap both DB and BETA_DB at the card-free Worker fetch/scheduled entry and beta device/scheduler construction. These four placements are recorded by the source profile. There is no additional SQL or admission RPC on the default unconfigured path.

Configured prepared statements retain bind arguments and method options/receivers. Mutation ownership covers run, first, all and raw, including RETURNING; batch unwraps only statements belonging to that adapter, holds one envelope for a mutating batch and rejects foreign/raw/cross-database statements before execution. Session constraints/bookmarks/native receivers survive, and session writes use the same authority owner. exec is conservatively owned; the legacy read-only dump delegates normally. No original database/statement capability is returned through these APIs.

Only a plain leading SELECT without a semicolon bypasses admission. This is a conservative classification of application-owned SQL, not a general SQL parser, untrusted-query authorization or replica consistency guarantee. WITH/PRAGMA/EXPLAIN, leading comments and semicolon sequences remain conservatively owned. A future D1 API/method or mutating SQLite extension requires explicit review. Current installed worker type definitions supplied the D1 surface contract.

The adapter uses urgent admission for any mutation/unknown execution, since HTTP write classification is not yet complete. The default is inactive. A configured mutation can preempt capture, including excluded/operational writes; liveness under real traffic is not qualified. A successful SQL result is preserved if release becomes uncertain. Native query settlement has no artificial timeout that discards writer ownership; hung writes retain it. Failed admission starts no SQL. This is not the required urgent-outage fallback.

## Verification and limits

22 compiled-adapter cases with controlled database methods verify native argument/receiver preservation, all four mutation execution methods, conservative SQL classification, mixed/read/empty/foreign batches, sessions/bookmarks, exec/dump, independent stores, no double wrapping, busy/uncertain admission, query errors/hangs and uncertain release. These controlled cases are separate from native-provider proof.

The actual local41+4/deviceDO encrypted source-destruction-and-restore fixture installs controllers on test database capabilities before actors are constructed and before Worker dispatch. A native direct D1 UPDATE RETURNING preempts an already-held capture without calling an actor mutation; its changed device names are checked immediately and preserved by exact archive/restore parity. Plain SELECT preserves the drained generation. Existing actor retention refusal, release-boundary health preemption, authentication, history/object bytes, interruption and restart checks remain.

Raw fixture setup/Node capture readers and external operator/migration/publication scripts still have separate capabilities. The controlled outer writer envelope remains; no assertion of complete enforcement is made. Exported helper entry points, constructors/lifecycle changes, detached work and retained original bindings require continued coverage review. Production install calls remain zero. Full writer accounting, authenticated transport and urgent authority/storage/transport-outage fallback must precede activation. Independent private card-free destination/separate key/context custody, schedule/monitoring, current PITR and isolated cloud recovery/RTO/RPO also remain open. No other group or canonical acceptance is advanced.
