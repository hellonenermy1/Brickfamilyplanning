# Phase 8D P8D-002 — destructive local multi-store recovery milestone

**Status: local verification, live P1 OPEN; Phase8D NOT PASS.** Continues the existing P8D-002 recovery finding, not a new audit or final acceptance record. Baseline is clean `ff020438ce97638ec4af6a584dd33112c82d1ba5`, following executable `cd5e50ca050a8afa8932434c590d923e3ade62a4` and source CI 41869667667.

## Gap reproduced and implementation

The previous local integration recovered D1 into a second DB and inspected R2, but had no production DO state export/restore and did not destroy source service stores. The new test against the previous `device-do.ts` fails because RPC `exportRecoveryState` does not exist (recorded RED). P8D-002 remains the existing finding authority recorded before this change.

`src/do-recovery.ts` adds a versioned, bounded server-only recovery primitive. `BrickDevice` exposes internal export/restore RPCs; no production HTTP recovery endpoint or automatic cron snapshot call is introduced. The accepted persistent key inventory is latest, health, networkEvidence, lastSafetyEvent, sequenceHighWater, safetyEvaluationHighWater, safetyHighWater and wsRevoked. Unknown keys, lossy/nonfinite/non-JSON values, excessive nesting or a snapshot over 64 KiB are refused, rather than silently dropping state. Storage listing is bounded to detect unknown additional keys.

The snapshot contains the device ID, canonical public-key fingerprint, original telemetry timestamps, capture time and state. Restore requires an exact SHA-256 of the serialized snapshot, correct format/device, existing D1 identity and matching DO namespace/name mapping. SHA integrity assumes a trusted manifest; it is not authentication, encryption or a substitute for private backup storage. Semantic Base64 aliases of the same valid P-256 key compare canonically.

Restore is disabled unless `BRICK_RECOVERY_MODE=isolated-restore`; no checked-in production/development configuration enables it. This explicit operator flag declares intent, **it does not itself attest cloud-account isolation**. A real operator must separately prove named isolated resources and prevent traffic before enabling it. The target must have no stored keys, attached WebSockets or alarm. Its insertion is a single DO storage transaction within a concurrency block; the in-memory revoke fence is set before that block releases. Both restored D1 revocation and a snapshot fence prevent revival. Sockets, alarms, credentials and pending commands are not re-created by this primitive. Expected refusals are caught inside the block before throwing to the caller.

## Reproducible evidence

`node scripts/test-phase8d-full-store-recovery.mjs` runs the locked Miniflare/workerd engine, D1, real local Queue→R2, R2 HISTORY/MAPS and SQLite-backed BrickDevice. Its generated test-only worker delegates normal requests to the production entry and catches expected RPC errors inside workerd, because the host proxy asserts on immediate rejected RPCs. This harness endpoint exists only in a disposable test build.

The test signs a synthetic device location, waits for real local Queue raw/trusted objects, seeds health/network/safety/markers, a pending command and a second revoked identity, then explicitly quiesces the fixture. It calls actual D1 backup and DO export functions, records R2 bytes/digests/metadata/original upload timestamps, closes the source runtime, requires actual persistent SQLite files to exist, and deletes the entire source persistence directory. A fresh independent namespace/database/bucket set is then restored solely from saved artifacts.

It reconciles all 38 durable D1 table counts (many intentionally empty; the separate prior native test supplies all-38 nonempty coverage), foreign keys, expired pending commands and all four fixture R2 objects (raw, trusted, D1 backup and map). Missing or corrupted R2 objects are rejected by the **test coordinator** before its first R2 write; this is not a new production R2 orchestration tool. DO recovery compares all state/timestamps, checks marker and old-health rejection, then restarts the restored runtime on disk and verifies persistent revocation still denies writes/WS. It also tests bad hashes/identity fingerprints, wrong device mapping, occupied targets, unknown keys, invalid markers, overlarge input, disabled ordinary environments, unpadded historical keys and D1-revoked target overriding an active snapshot. Native DO checks also reject nonfinite/oversized stored state during export and an attached WebSocket/alarm during restore.

A test development issue was caught and corrected: locked Miniflare 5 ignores old per-service persistence options. The final test uses `resourcePersistencePath` and `isolatedResourcePersistencePath`, requires actual SQLite files before deletion and verifies state after restart. Earlier intermediate runs are not counted as destructive recovery evidence.

Local targeted logs: `PHASE8D_FULL_STORE_RECOVERY_LOCAL_2026-11-05.txt`. CI adds one blocking source job step; hosted exact-source verification **58285064fbf3d6b707dd15d8ef2fd3fb967ae47d**, [CI41952880677](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41952880677), attempt1 completed SUCCESS, all three jobs and source67/67 steps. Actual logs inspected; `PHASE8D_SOURCE_CI_41952880677.txt`. Existing workerd integration and TypeScript/public asset checks also run for this change.

## What this does not close

- No Cloudflare deployment/resource/data write, real cloud source destruction, cloud recovery/rollback or actual RTO/RPO measurement.
- Capture is only consistent because the synthetic source is quiesced. A DO transaction is not a cross-store D1/R2/DO transaction; production snapshot cutoff/traffic/Queue drain coordination remains to be implemented and verified.
- R2 copying preserves content and configured metadata, but provider-managed upload time changes. Original upload times in the manifest do not enforce original retention expiry. Restored old-object retention handling is an open acceptance gate.
- No large-history/DO/many-device performance qualification, interrupted multi-store restore coordinator, private backup/IAM/lifecycle attestation or backup signing. The existing live restore script remains guarded against obsolete 18-table scope; it was not run or bypassed.
- The new internal RPC must remain unreachable from public routing. Do not add bindings/restore mode to a live environment without an explicit approved isolated drill plan.

The fixed next-action queue is `PHASE8D_LIVE_ACCEPTANCE_NEXT.md`. Attempt 5 again confirms unchanged live binding/Access/read-permission blockers; repeating identical inaccessible checks is not progress. No final PASS record is created.
