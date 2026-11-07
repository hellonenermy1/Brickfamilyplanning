# Phase 8D — approved D1 architecture reconciliation

Phase 8D IN PROGRESS / NOT PASS. Baseline beta source488b34f2f2f807c107b4c1e9eee9dccff717011f; separate formal audit checkpoint9f28f7c4. Work branch audit/phase8d-d1-qualification preserves both branches. Latest user constraint (no R2/payment card) supersedes technology-specific deployment instructions, not safety, durability, privacy or acceptance requirements.

## Authority and invariant preservation
The attached76-page Phase8 plan remains authoritative. All525 original IDs/classes/titles/authority text remain unchanged; the draft214 PHASE8D/311 CROSS_PHASE scope and525 unresolved final dispositions are not converted to PASS. Read the existing findings ledger, current handoff and the new D1 findings alongside this file. This supplements historical evidence; it does not delete or relabel R2/Queue tests.

| Requirement | Approved architecture interpretation | Remaining obligation |
|---|---|---|
| BE-010/011 | D1 history rows synthesize compressed15-minute raw/trusted segments; bounded D1 objects hold evidence/models/APK | Integrity/retention/size/query limits and recovery must be proven for this adapter |
| BE-006/019 | Immediate authoritative DO live path; background work still needs durable bounded independent processing | Direct D1 events do not automatically prove async Atlas/fusion isolation or live latency |
| BE-007 | Stable logical identity/idempotency also applies to synchronous direct-D1 retries | Partial batch and duplicate tests are scoped evidence; cannot claim Cloudflare Queue delivery |
| BE-008 | No Cloudflare Queue is configured in beta | Equivalent durable failed-work/retry visibility is still an OPEN requirement; no automatic unsupported/removal disposition |
| OPS-002/003 | Primary D1 now includes history/objects; diagnostics D1 and device/scheduler DO have explicit recovery policies | Scheduled/export/PITR/off-platform protection, named cloud drill, scale and recovery timing remain open |
| SEC-021/OPS-001 | SQL cleanup and separate scheduler DO replace bucket lifecycle/cron dependencies | Full policy/age/budget/revoked isolation must still be qualified; current D1 cleanup periods need reconciliation |

## Fixed19-section execution matrix for D1
Source review, local tests, CI, live deployment and actual browser/phone acceptance are separate scopes. No row below grants final acceptance.

| Section | D1-specific evidence / current work | Still open |
|---|---|---|
| 8D.1 Deployment/config | Existing inspected beta deploy63075728/run41996937662; D1 template enters worker-beta-cardfree.ts; primary+diagnostics D1, device+scheduler DO, no R2/Queues | Exact new candidate versus actual deployed identity/schema/config and account/PITR evidence |
| 8D.2 API inventory | Existing layered source inventory plus beta readiness/observations, status/ack/import, downloads/publish, login/logout and authenticated map proxy | Complete beta method/auth/storage/side-effect/rate inventory; actual deployed route probes |
| 8D.3 Device auth | Signed actual Worker/D1/DO tests, wrong key and exact revoke-before-direct-append reproduction/fix P8D-072 | Live identity/family isolation and broader race matrix |
| 8D.4 Validation | Existing beta malformed/replay/privacy suite; supported20-point native batch defect P8D-071 reproduced/fixed | Full malformed current-D1 API matrix and quotas |
| 8D.5 Idempotency/order | P8D-069 atomic create/CAS, partial20-point history retry, immutable row/readback; P8D-068 coherent reads | Broader epoch/out-of-order/cross-service races and evidence/model retry contracts |
| 8D.6 ACK boundary | Actual signed Worker: history outage503; device-event durability alone produces no ACK; partial second group has no range ACK and retry fills holes | Physical child journal cleanup/ACK matching and live cloud failure timing |
| 8D.7 Current state | Actual device DO in beta/native tests; transactional active predicate on primary event and direct history writes | Live concurrent revoke/publish, fallback/current/history races |
| 8D.8 Database | Atomic D1 metadata/chunk batch, conditional writes and20-row VALUES insert; all48 primary source tables classified in recovery policy | Large queries, quota/performance, interrupted cloud migration/rollback |
| 8D.9 Retry/DLQ | Direct D1 failure propagates without ACK; stable retry identity and partial catch-up tested | Durable visibility/reprocessing of failed async Atlas/evidence work; BE-008 remains OPEN |
| 8D.10 WebSocket | Existing beta selected-device actual socket ACK and production hibernation/revoke regressions | Actual browser/session cross-family/logout/reconnect/timing |
| 8D.11 Parent sessions | D1 private session path preserved; recovery excludes login/session tokens | Live session/rotation/ownership/cookie matrix; no Access activation requirement |
| 8D.12 CSRF/Origin | Existing beta integration rejects wrong Origin; recovery has no HTTP route | Complete new route/live browser mutation/upgrade matrix |
| 8D.13 Commands | Fresh restore retires pending commands and preserves schedules/results | Actual phone action/result/nonce/full lifecycle; no silent Wi-Fi actions |
| 8D.14 Rate limiting | Existing beta template has separate rate bindings; signed/malformed cases preserved | Actual D1/query/NAT budgets, SOS fairness, provider limits |
| 8D.15 Secrets | New synthetic fixtures contain no family credentials/locations; no recovery HTTP path | Full actual build/CDN/log/history/rotation evidence |
| 8D.16 Recovery | New bounded internal41-table primary+4-table diagnostics archive; fresh-store destruction/restore with separate beta DO snapshots and scheduler reconstruction; P8D-070 diagnostic-key correction | Scheduled/off-platform backup integration, authenticated manifest/storage, named cloud drill, large data/RTO/RPO; P8D-002 remains P1 OPEN |
| 8D.17 Retention | Restore preserves original object uploaded_at and history timestamps; recursive backup objects omitted | Approved per-class durations versus existing14/30/35/7-day D1 cleanup; revoked isolation and backlog bounds |
| 8D.18 Observability | Current outages and transient partial target are explicit failures; no canned PASS | Durable failed-work observability, live alarms/provider/storage failure distinctions |
| 8D.19 CI/release | New pinned no-cloud-write D1 audit workflow, exact source hashes and PR; original production deploy gate preserved | Actual candidate CI, release protection, isolated migration/rollback and final ledger acceptance |

## Recovery policy implemented in the internal primitive
- Primary: all38 existing durable tables plus dev_location_history, dev_object_store, dev_object_chunks =41.
- Primary exclusions: four legacy transient tables; dev_parent_login_tokens/dev_parent_sessions/dev_maintenance_state. Fresh auth and fresh maintenance leases are required. Prior backups/d1/ objects/chunks are omitted to prevent recursive archive growth.
- Diagnostics: beta_latest, beta_runs, beta_records, beta_reviews =4; nonce beta_requests and beta_challenges are not restored. Historical readiness evidence keeps its original timestamps; recovery is not a readiness/72h PASS.
- Device DO: separate eight-key export/restore with identity/hash/revocation guards. Beta-only betaDiagnostic is validated then omitted from the captured copy, without deleting live probe state; unknown keys still fail.
- Scheduler DO: reconstructed and armed independently; old alarms/live sockets/credentials are never resurrected.
- Quiescence is an explicit operator assertion, not a distributed transaction or proof that traffic actually stopped. Each database capture uses one atomic read batch; both databases and DOs require coordinated traffic pause.
-16MiB decoded archive/100k rows per table are explicit supported safety envelopes, not large-history qualification. Objects retain byte digests, chunk integrity and original age. Hashes protect integrity relative to a trusted manifest; no authentication/encryption claim.
- Restore is disabled without BRICK_RECOVERY_MODE=isolated-restore. Both schemas, all row shapes/BLOBs and object digests are validated before the first write. Service/SQL failure during later batches may leave a partial target: discard it and start fresh. Retry into a partial target is refused.
- No existing scheduled backup route has been silently replaced. The new primitive is not reachable from production HTTP or scheduled execution. P8D-002 cannot close until operational capture/storage/restore is integrated and qualified.

## Concrete next cloud drill, not executed
Proposed disposable resource prefix: brick-p8d-d1-drill-20261105, separate source-primary/source-diagnostics/target-primary/target-diagnostics databases and source/target Worker-local device+scheduler namespaces. Create no R2/Queue/Access/payment dependency. Operator must verify resource IDs do not alias brick-family-beta or brick-family-v1(-dev), use synthetic devices only, arrange private off-platform manifests/archive, quiesce and check source inventories, then perform deletion/fresh restore/rollback only within the explicitly named disposable resources. Measure restore timing and reconcile required data; test interruption/corruption/revocation/expired commands. No resource was provisioned, deleted or deployed by this audit batch.

## Continuation
Use the new D1 primitive/tests and this matrix rather than re-requesting R2 scopes or replaying old denied audits. Next: close operational backup integration and retention-policy gaps; inventory failed-work/async processing under BE-006/008/019; map exact per-ID evidence and ownership/reviews without inventing acceptance. Browser map/Wi-Fi UI and physical OPPO/endurance evidence remain separate, tracked in issue26. Preserve existing features, signed APK, user data and latest92vh/70vh layout.
