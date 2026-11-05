# Brick Phase 8D beta — complete fresh-start RESET PLAN (NOT EXECUTED)

Status: **PREPARATION / BLOCKED FOR LIVE DELETION**. This document is a safety plan, not an approval to erase data. No cloud resources, GitHub workflow, APK, or Phase 8D implementation have been changed.

## Scope lock

Only the already-deployed, isolated beta account/resources from `audit/beta-backend/D1_SETUP_STATE.json`:
- Account `43fd863702fe37609e629c450c5d596e`
- Worker `brick-family-beta`, URL `brick-family-beta.lumjayvian.workers.dev`
- Primary D1 `brick-family-beta` / `2d149970-35c9-4893-8f42-292da6433ced`
- Diagnostic D1 `brick-family-beta-diagnostics` / `1f24f9ee-a67b-4d49-8c9f-4aa784a9bfd4`
- Isolated device SQLite Durable Objects bound as `BRICK_DEVICE`
- Separate scheduler Durable Object `BETA_SCHEDULER` (preserve)
- APK release `brick-beta-20261105-01`; signed APK SHA-256 `0ab070bea12ca607b0a38ee863087aadddb44c9f2a8c60ac496b914d1166a6fc`.

No production D1, default branch, `beta/apk`, `beta/backend-portal`, Phase 8D SHA `71f5460fa6dfb47e276121e6c69db98cdae4485a`, Worker name/routes, existing sign-in secret, signed APK, cloud account settings, subscriptions, rate limits, or unrelated schedules may be changed. No R2 or payment card.

## Findings from the source (2026-11-05)

1. The primary D1 has 38 explicitly inventoried durable recovery tables (`BACKUP_TABLES` in `src/backup-v6.ts`), 4 transient recovery tables, 6 free-runtime tables and a migration ledger. Several tables have device foreign keys with ON DELETE CASCADE, but others do not. **Never use `DELETE FROM devices` as the whole reset.**
2. `dev_location_history` stores normal raw/trusted history independently, without a devices FK. It must be explicitly cleared.
3. `dev_object_store` + `dev_object_chunks` hold both device-linked objects **and the downloadable APK** at `beta/releases/brick-beta-20261105-01/Brick.apk`. Preserve the APK and all its chunks. Protect `backups/d1/` until independent recovery evidence and an agreed expiry. Inventory every object key category; deny unknown categories until classified.
4. Parent sign-in data is in `dev_parent_sessions`, `dev_parent_login_tokens`, and Worker secret `DEV_PARENT_LOGIN_HASH`. Preserve login, sessions and secret; do not regenerate credentials.
5. `dev_maintenance_state` and the `BetaScheduler` Durable Object keep maintenance running. Preserve both and all alarms. Do not touch any other DO namespace.
6. Six tables in the separate `BETA_DB`: `beta_requests`, `beta_latest`, `beta_challenges`, `beta_runs`, `beta_records`, `beta_reviews`. All are disposable beta device diagnostics, and should be emptied *only after backup checks*.
7. Each `BrickDevice` DO stores current position, health, safety/network state, replay high-water marks, socket revocation and alarms. `src/device-do.ts` currently has `revokeParentSockets()`, not a complete, authorised **device-state purge** RPC. Deleting D1 devices would leave DO state behind. This is a hard blocker until a guarded, tested reset mechanism exists.
8. Cloudflare D1 Time Travel (production storage subsystem) is automatically on, with a seven-day recovery horizon on Workers Free; it is *not* a durable off-platform backup. Existing `snapshotD1ToR2` naming is historical: under this beta adapter, snapshots can reside in the same primary D1 object store, so they cannot be treated as independent backups.
9. A previously installed phone may keep its current local device key and queue. Revoking/deleting cloud rows does not uninstall or deprovision Device Owner. Local phone rollback/removal must follow `beta/INSTALL.md`, with no factory reset.

## PRE-RUN: non-destructive checks (MUST all pass)

- Confirm both account and both D1 UUIDs match this scope; do not accept database names alone.
- Inspect *current* table inventory using `sqlite_master`, `PRAGMA foreign_key_check`, and per-table row counts. Reject unknown user tables/columns until reviewed. Do not print location, keys or other personal data.
- Count devices, active vs revoked, pairing sessions, each history/evidence/diagnostics table, object-key classes. Record only counts + hashes, not full payloads.
- Verify beta signed APK and map can still be fetched through authenticated portal; record verified SHA and release metadata.
- Verify there is no active 72-hour test, pairing attempt, in-flight uploads, SOS/safety event, or phone awaiting acknowledgment. Quiesce **beta-only** ingest, pairing and writes. Current runtime has no proven reversible quiesce control, so **block the destructive step** until one is implemented/tested.
- Retrieve **independent current D1 Time Travel bookmarks** for *both* named databases and verify both use D1 production storage.
- Export *both* complete databases to private, encrypted off-platform backup; do not commit, log, upload raw dumps as GitHub artifacts, or store passwords in the repo. Check hashes, table counts and recoverability with an isolated local SQLite import or disposable test D1. Preserve the recovery secret separately. An export generated from a live DB must not be presumed consistent with live DO state without a quiesce boundary.
- Capture/verify each existing device DO's recovery state separately via `exportRecoveryState` or an equivalent authenticated RPC with a secure encrypted destination. D1 bookmarks **do not** restore DOs. Verify the backups before touching any DO.
- Have an internal, non-public, no-remote-self-destruct, beta-only DO purge method built and tested with precise device-ID allowlisting; it must close sockets, durably fence writes, purge `BrickDevice` SQLite/KV/alarm data, and return validated postconditions. Preserve `BetaScheduler`.
- Have a reproducible, tested child-device re-pair/re-provision path; existing keys cannot silently be trusted or restored. Never wipe the phone remotely.

## RESET RUN (future only; explicit separate execution approval required)

1. Enter reversible **isolated beta maintenance mode**, refusing new pairings, uploads and parent mutations (except status/rollback), with current phone states recorded. Preserve portal login and APK download.
2. Read and freeze the exact existing device-ID set; reject if it changes. Revoke their keys and close active sockets, verifying rejection of new signed traffic. Store a private list for audit and DO cleanup.
3. Snapshot/bookmark/check backups again at the quiesced boundary. If any verification fails, exit without deleting anything.
4. Delete all 38 device-owned durable tables and 4 transient test tables, in a tested FK-safe transaction/batches that commit atomically for each logical unit. Explicitly clear `dev_location_history`. Do not delete the migration ledger, parent auth tables, maintenance table, schema or Worker configuration.
5. Remove *only verified device-bound object keys* and chunks; **never** blanket-delete the D1 object store. Preserve `beta/releases/`, the known signed APK and any protected recovery backups until their approved expiry.
6. Clear six `BETA_DB` diagnostic tables using their own verified, independently recoverable database transaction.
7. Purge/verify every former `BrickDevice` DO through the internal guarded method. Never purge `BetaScheduler` or other DO classes.
8. Prove zero old devices/history/diagnostics/object references/live DO states, zero remaining pairing sessions, healthy D1 integrity, and no stale device WebSocket. Preserve portal authentication and confirm APK download SHA unchanged.
9. Exit maintenance mode. Perform new independent pairing from the existing signed APK and confirm fresh device history/sequence starts and location updates. Do not claim 72-hour qualification automatically.

## Rollback and retention

- On any failure BEFORE destructive step: disable beta maintenance mode, keep state unchanged, and report the blocker.
- AFTER destructive step: keep writes blocked; restore both D1s from recorded bookmarks or independently verified encrypted exports as a coordinated unit; restore DO states from their separate verified encrypted snapshots; re-verify key binding and auth before resuming. Time Travel restore overwrites a live D1 and is itself destructive; only operate under a separate incident decision.
- A *fresh functional beta* means new sessions/devices/history in the live portal. It is not immediate cryptographic erasure: D1 Time Travel, DO point-in-time recovery and retained encrypted backups can temporarily retain old information under their retention rules. Do not describe it as secure deletion.

## Status and explicit blockers

- [x] Source-level scope and table/data dependencies identified.
- [x] APK, portal auth, scheduler and beta/production separation constraints documented.
- [ ] Live D1 inventories and recent bookmarks fetched.
- [ ] Independent encrypted backups made, test-restored and verified.
- [ ] Reversible beta-only ingest/pairing quiesce mechanism implemented and tested.
- [ ] Internal per-device DO purge implemented and tested on disposable beta state.
- [ ] Phone-side owner-release, removal/re-pairing and actual beta checks confirmed.
- [ ] Separate approval to perform the actual reset received.
- [ ] Destructive reset executed and postconditions verified.

**This preparatory branch has no production-effecting changes; do not deploy it as the Worker.**
