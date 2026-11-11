# Group 1 — device restore identity and state postflight

11 November 2026, Singapore. G1.5/P8D-002. Executable `6f167ab3af2ee6f304b2d948b7a6385dfb6c8997`, tree `3a8af1a23f9082b00e85bab72b5c0d9d2a59b141`; baseline `5d93c411c5b2d5fddc17e9341a84ab13703ef7d9`. PR32 remains draft/unmerged against beta base `141cbf42efaa61873c4fa87138ca5a0a19d404a2`.

## Reproduced failures

`node scripts/test-phase8d-do-restore-postflight.mjs --baseline-only` loads the prior recovery helper against disposable native D1 and SQLite-backed Durable Objects. Controlled faults demonstrate:

- D1 revocation after the identity preflight was missed; restore returned success with `wsRevoked=false`.
- Native stored health changed after the restore transaction; restore still returned success.
- A lost transaction commit acknowledgement left restored state without a persistent revocation fence. The failed receipt did not prove the target empty or safe to retry.

These are bounded local helper/native-adapter observations, not observed deployed incidents. Fixture DO IDs match their actual namespace/device identities; fault injection is explicit and not available through production routes.

## Correction

Only the existing internal isolated-restore path changes. Its original mode, digest, device/key/namespace identity, fresh storage and sockets/alarm preconditions remain. After an attempted restore transaction it now rereads D1 identity, compares canonical key hash and revocation status, reads back every supported durable state key and nested value, and checks sockets/alarm again. JSON object insertion order is ignored; array order, values, missing markers and extra keys remain significant. Expected D1/snapshot revocation remains an allowed stronger fence.

A mutation-phase failure never produces a successful restore result. It sets the cached revocation flag, attempts persistent `wsRevoked=true`, and attempts to close any now-observed sockets. The attempt flag is set before `txn.put`, so a committed transaction with a lost acknowledgement is covered. The target is not cleared, replayed, repaired, or silently accepted. Preflight refusals before a write attempt preserve existing target state and do not create a new fence.

Persistent fencing is **best effort if storage itself is unavailable**. A dedicated negative case proves the function still refuses qualification when the fence write fails, despite having set the in-memory flag. That target must remain externally isolated; no successful durable-quarantine receipt or safe restart is inferred. Even a completed fence write is not proof that an older uncertain remote operation stopped; later completion could replace local state. This local fence must never substitute for independent isolation or complete writer ownership. When storage is available, the native restart case verifies the fence persists and retry cannot overwrite the occupied target.

The postflight check is point-in-time, not a cross-D1/DO transaction or a replacement for full writer quiescence. A writer outside installed controls can change identity after the final check. If any device restore is unqualified, the entire primary/diagnostics/DO recovery candidate must stay isolated; a successful D1 restore alone cannot promote it. A failed or unknown target needs explicit reconciliation/discard and a fresh approved target, not a timer or blind retry.

## Qualification

25 new native cases cover all supported state keys, D1/snapshot revocation, rising/falling revocation and key/removal races, value/marker/key/array drift, readback outages, sockets/alarm changes, commit uncertainty, persistent fence failure, preflight no-mutation, empty state, object-key ordering and actual persistence restart. Typecheck and the existing20-case remaining-writer suite passed during implementation. All26 local workflow run groups passed on this source. Push42947680587/job130284305518 and PR42947687154/job130284325775 audits passed33/33 each; Phase2 42947687126/job130284325679 passed14/14 and portal42947687240/job130284326370 passed10/10. Complete decoded logs have zero error markers and contain25 new DO cases plus existing30 DDL/24 relationship/12 value-parity/20 remaining-writer and full populated encrypted recovery successes. PR merge `5eb721ced151deaadf6c4d18bb5ba721eddd2fd7` has expected base/source parents and identical tree. Exact records are in `PHASE8D_GROUP1_DO_RESTORE_POSTFLIGHT_EVIDENCE.json`.

The runtime projection still has90 files, but its hash changes: `src/do-recovery.ts` is the changed runtime file. Write inventory, actor-hook and named-surface profiles were regenerated. Prior runtime CI is not carried as qualification of this changed helper. No controller installation, new recovery HTTP route, default activation, credential or production configuration is introduced.

Canonical525/full acceptance ledger fields remain unchanged. No deployment/merge, cloud/provider/family-data operation, key/permission change, notification, R2/card/billing or APK/UI change. Complete writer/bootstrap/raw-credential installation, independent guard/key/context/journal custody, real scheduling/alerts and isolated cloud recovery/interruption/rollback with agreed measured RTO/RPO and genuine review remain open. Group1 `IN_PROGRESS_NOT_READY`; P8D-002 `P1_OPEN`; Phase8D `NOT_PASS`.
