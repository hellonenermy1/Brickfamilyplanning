# Group1 — operational backup/recovery implementation checkpoint

Group1 remains IN PROGRESS / NOT READY; P8D-002 remains P1 OPEN. Work is restricted to this group. Atlas, deployment/capacity qualification and final requirement acceptance are not advanced or waived here.

## Source-backed write-path inventory

PHASE8D_GROUP1_WRITE_INVENTORY.json is generated from the actual beta entry's relative import/export graph. Its87 source Git blobs were independently matched to candidate basis0d61bcde05b7c64bfeda156a316fd54712b4be2b. There are no unresolved relative imports in that graph.298 prepare sites include169 write-or-unknown candidates;69 mutation/wrapper sites and20 waitUntil sites are retained for review. These are conservative static candidates, not counts of independent writers or complete runtime coverage. Read-only queries, wrappers, caches, excluded transient state and reachable legacy branches remain visible. External operators/scripts, dynamic dispatch, constructors/lifecycle and package behavior require separate accounting.

| Write family | Actual source boundary | Integration obligation |
| --- | --- | --- |
| Worker requests | worker-beta-cardfree.ts calls maintenance before routing/authentication, then delegates through worker-beta and the inherited Worker chain | A GET or rejected request is not automatically read-only; retain ownership through all relevant deferred descendants |
| Durable D1 data and virtual objects/events | dev-free-runtime.ts, evidence-ingest.ts, phase4.ts, phase5-ops.ts, p8b-controls.ts, beta-api.ts and the full indexed graph | Cover direct DB/BETA_DB statements and batches plus HISTORY/EVENTS facade work; method names alone do not classify SQL |
| Device Durable Object state | beta-device.ts and inherited device-do.ts public RPCs/fetch; recovery helpers | Independently account for latest/health/network/safety/replay/revocation and restore writes; parent request ownership alone does not cover independent RPC/lifecycle work |
| Scheduler/background work | beta-scheduler.ts runGroup/runDerivedWork/runRetentionWork/runDailyBackup/watchdog/kick/runTick/alarm | kick can return before work finishes; account for separate objects/invocations, alarms and their descendants until effects settle |
| Socket lifecycle and disposable diagnostics | Device constructor/alarm/fetch and beta probe | Review actual captured-state vs reconstructible/diagnostic exclusions; do not pause urgent safety, revocation or required live-state operations by assumption |
| Direct external writers | setup-beta-d1.mjs, publish-beta-d1-release.mjs, migration/recovery/operator tools | Establish an explicit maintenance exclusion/control path; a Worker-only gate cannot fence account-level SQL or deployments |

## Implemented staged durable admission component

src/cardfree-capture-admission.ts uses actual Durable Object storage transactions. It is not imported/exported by the production Worker/scheduler and adds no binding, route, class migration, schema or credential. It accounts only for writers explicitly declared to it. A native DRAINED result must not be used as proof of uninstrumented production writers.

- Initialization pins source/resource identity and an authority epoch. Existing mismatched or malformed state is never silently reset. Storage loss/uninitialized state refuses operations; manual reinitialization is unsafe until external proof establishes that older writers stopped.
- Ordinary admissions are counted durably and blocked while a capture drains/holds. Duplicate writer retries preserve the same ticket; completion removes exactly that registered writer. Tickets have **no time-based expiry**: abandoned/unresolved writers stay visible rather than manufacturing quiescence. The caller must wait for actual side-effect/deferred-work completion before releasing ownership.
- Capture requests have a bounded maximum300-second lease and fresh generation. The last declared writer's completion transitions DRAINING to DRAINED. A held pin must match the exact identity/generation/time and zero declared writers. Capture expiry invalidates that capture and opens normal admission, while preserving unresolved writers. It does not certify that a writer timed out safely.
- Urgent admission durably preempts the capture instead of waiting for it. Stale pins cannot attest; a stale release can confirm its known closure without releasing a newer unrelated capture. Only the most recent closed capture identity is retained; this is not a global history/idempotency registry.
- The active-writer map caps128 entries without evicting unresolved owners. Ordinary overflow refuses. Urgent overflow is admitted only after a durable permanent capture quarantine; no later capture is allowed, and this component deliberately exposes no reset that could discard unknown work.
- Failed transactions return no admission/completion acknowledgement. Native rollback tests retain the prior capture or unresolved writer. **This is not a proven urgent-operation outage fallback:** if authority/storage/transport is unavailable, production activation still needs a safe path that preserves urgent processing and durably invalidates any capture. Simply ignoring an admission error or expiring a writer would violate the design.

## Native evidence and activation boundary

test-phase8d-capture-admission.mjs has24 native SQLite-backed Durable Object cases: drain/hold, urgent preemption, concurrent/duplicate admissions and completion, stale generations/releases, expiry without writer expiry, identity/ticket errors, transaction rollback, malformed state, clock regression, restart persistence, capacity and permanent quarantine. Test-only fixture capabilities are not deployed APIs.

The existing card-free destruction-and-restore drill now uses this durable component instead of an in-memory fence. A single declared synthetic writer envelope covers controlled fixture mutations and is released only after its disposable scheduler is settled/paused. The coordinator then acquires its generation/time from that authority, captures actual41+4 D1 tables and actual device DOs, seals an encrypted package, confirms release, destroys source persistence and restores a fresh local target. Timestamp alignment changes only the expected capture timestamp; history/object bytes, device identities, revocation, exclusions and interruption checks remain. This is controlled native-fixture integration, not proof that production ingress/RPC/alarms have been instrumented or a real cloud fence exists.

Do **not** connect the component to production until the indexed paths and external writers have enforced ownership, urgent/outage behavior is proved, source/resource/authority identity is pinned, transport is authenticated, and live latency/failure behavior is qualified. A single top-level pause flag or wrapping only POST requests is insufficient. No HTTP capture route or operator credential is added here.

## Remaining Group1 work, in order

1. Complete reviewed runtime/external writer accounting, ownership lifetime and urgent classification from this source inventory. Install all required hooks together with a proven urgent-operation authority-outage fallback; partial coverage must never enable capture.
2. Connect authenticated source/authority transport with strict resource/source identity and bounded cancellation/release. Source functions and private local crypto/publication are prepared; the real transport is not installed.
3. Verify an actual private card-free destination independent of source failure, plus separate encryption-key/trusted-context custody. No production family export or secret is created by this work.
4. Qualify real scheduled capture/readback, archive-age/failure monitoring and interruption behavior. The legacy same-D1 scheduled snapshot is insufficient for this gate.
5. Obtain usable least-privilege Cloudflare access for current PITR metadata and isolated cloud target identity. Failed login/unchanged denied-read retries remain stopped; no broad deploy-token fallback.
6. Execute an explicitly scoped isolated cloud restore/interruption/rollback drill, verify all required parity and measure RTO/RPO. The native drill does not satisfy this operational acceptance.

No R2/card/billing dependency, production configuration/data/schema/permissions/credentials change, APK/UI/phone change, merge/deployment or Group1/Phase8D PASS is implied. All final per-ID owners/criteria/independent dispositions remain unchanged.
