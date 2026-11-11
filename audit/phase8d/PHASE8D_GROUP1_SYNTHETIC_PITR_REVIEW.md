# Group 1 — isolated synthetic D1 PITR drill, awaiting approval

Prepared 11 November 2026, Singapore. Qualified executable source: `a5713ae7578120d8d0c5fb7946a25677a285abe8`, tree `a9cc556c4031d54416eb52162960767b37a088b0`. This is an executable review packet, not authorization or a live observation. Source is in draft PR32. The final counter correction supersedes the initial98c3b7f source; the launcher workflow blob is unchanged. Draft [PR62](https://github.com/hellonenermy1/Brickfamilyplanning/pull/62) proposes only the disabled workflow registration on main; its current head is `4b6815bc9539dfbc7eaef751ffbb11a0b3aa9a8c`, parent `cb380fe821b16cf5304843af2ce713d21f575788`. Neither PR is merged. No provider operation was executed in preparing this packet.

## Concrete proposed operation

| Item | Reviewed scope |
| --- | --- |
| Account | Existing independently pinned beta account; source compares SHA256 `f3596e86fd73a8d069151b0e9fd0e08f6bf5a1518fb3066d1db6daf4f4962a83`. Existing account secret is read only in the plan-validation step. No account discovery or fallback. |
| New synthetic primary | `brick-g1-20261111-c004458eeca590ce-primary` |
| New synthetic diagnostics | `brick-g1-20261111-c004458eeca590ce-diagnostics` |
| Existing resources | No existing database target input, Worker binding/deployment, DO operation, family rows, archive transfer, notification, permission/credential change or resource deletion. Both existing beta D1 hashes are explicitly refused. |
| New data | One canary table and two fixed synthetic rows per new database. Save both current bookmarks before either fault; update one canary and delete the other in each database. |
| Recovery and rollback observation | Restore each saved checkpoint and verify exact two-row parity; undo each restore using the returned previous bookmark and verify the damaged one-row state; restore the checkpoint again and verify exact baseline parity. At most six restore requests total. |
| Bounds | At most two creations and 44 API requests. No API retries, parallel requests, resource lookup/reuse by name, deletion, automatic upgrade or billing activation. Replication explicitly disabled and checked. Each request including body has a 20-second maximum; 15-minute admission budget, 20-minute job limit. A provider quota/feature refusal stops; it does not authorize changing the account plan. |
| Proposed criterion, still unagreed | Synthetic pair fault-to-first-verified-restored-parity <=900 seconds, measured with a monotonic client clock including network/query/verification time. Both stores must recover all four checkpoint canaries: zero checkpoint rows lost. Later undo/re-restore must also verify. This is neither an agreed full Brick RTO nor time-based production RPO. |
| Credential use requiring approval | Use the existing GitHub deployment operator secret only in this bounded manual job, exposed to the executable as `CLOUDFLARE_D1_DRILL_TOKEN`. No fallback from the dedicated metadata read secret. This does **not** establish least privilege or install the operator credential in any runtime/backup system. No secret value is requested in chat. |
| Retention | Leave the two new unbound databases in place, whether passed, failed or uncertain. No cleanup deletion is authorized. Sanitized Actions result and progress artifact retention:14 days. The small databases still consume account quota. |

## Dispatch gates

1. Finish and inspect the exact-source offline and hosted qualification in the companion evidence record. Runtime remains the previously qualified90-file graph; this batch changes only operator/test/workflow source and its inventory.
2. Obtain explicit approval to merge the **one-file registration PR62**, then separately dispatch the above bounded operation using the existing operator secret and proposed criterion. Approval may cover both actions explicitly. PR32's application/audit changes remain draft and unmerged.
3. Recheck actual main/audit refs and PR62's one-file diff before any approved merge. Dispatch only the exact reviewed audit-branch head. If evidence-only descendants follow executablea5713ae, verify the relevant source/workflow/policy blobs unchanged and record the actual dispatch head; do not label that descendant a separate exact-source CI run. The workflow requires `approved_source_sha` to equal the actual dispatch `GITHUB_SHA`.
4. Inputs: `execute_new_synthetic_d1=true`, `run_id=20261111-c004458eeca590ce`, `rto_goal_seconds=900`, `approved_source_sha=<actual reviewed dispatch head>`. Read these as event JSON, never shell-interpolate user input. The existing account secret must satisfy the fixed account pin before the operator token step.
5. Save the run/job/source identity, complete sanitized progress/result artifacts and measured values. This packet provides no unattended execution or blanket re-run permission. A subsequent run requires reconciliation and a fresh approved run identity.

## Stop and reconciliation

The CLI defaults to a zero-request plan. Execution also requires manual event, exact audit branch/source and matching run approval. Every request intent is appended and fsynced before dispatch; sanitized progress is also emitted to Actions stderr. Envelope acknowledgement is recorded separately from semantic identity/parity checks. This local journal is not independent durable custody or an anti-rollback service.

An HTTP denial, redirect, oversized/malformed/error body, wrong created identity, metadata drift, invalid bookmark, unexpected query/restore shape, failed journal write, lost acknowledgement, timeout or parity mismatch stops the whole candidate. No blind retry, automatic recovery of an uncertain candidate, or deletion follows. A request which ignores abort can still finish remotely; the code prevents its late result advancing this invocation, not remote completion. A malformed acknowledged mutation result is also classified unknown. Successful API envelopes alone are never recovery acceptance.

For an uncertain create, reconcile the **exact proposed new name** through separately authorized read access; do not infer no database exists from a missing ID/result or retry creation. For uncertain SQL/restore, retain and isolate both candidates and inspect the sanitized request journal plus actual new-resource state. A job hard kill or lost runner can also lose final artifacts; lack of an uploaded result is always unqualified. No new database may be attached to the beta runtime or used for family data based on this drill.

## What a live pass would establish

Only current-bookmark Cloudflare D1 restore/undo/re-restore with exact synthetic canary parity and one explicitly defined synthetic timing measurement on two newly created unbound databases. The source-only/offline pass establishes none of this live behavior.

It would not establish independent backup/key/context/journal custody, actual restricted B2 runner installation, an installed schedule/recipient, complete writer fencing/bootstrap, full retention-window survival, coherent capture across stores, whole41+4-table encrypted restore, device-DO recovery, outage/interruption behavior, actual family-data recoverability, full-production RTO/RPO, genuine independent sign-off or Group1 closure. Group1 remains `IN_PROGRESS_NOT_READY`; P8D-002 `P1_OPEN`; Phase8D `NOT_PASS`. Canonical525 and full acceptance ledger are unchanged. No R2/card/billing/APK/UI operation is part of this scope.

## Primary API contract checked 11 November 2026

- [Create D1 database](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/create/): POST database collection with name and disabled read replication.
- [Query D1 database](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/): POST fixed SQL/string parameters; inspect both API and per-query success envelopes.
- [Read current bookmark](https://developers.cloudflare.com/api/resources/d1/subresources/database/subresources/time_travel/methods/get_bookmark/): GET current bookmark after verified baseline insertion.
- [Restore by bookmark](https://developers.cloudflare.com/api/resources/d1/subresources/database/subresources/time_travel/methods/restore/): POST restore with bookmark in the **query string**, not an invented JSON body. Validate new and previous bookmarks; use the previous bookmark only on the newly created candidate for the planned undo.
- [Time Travel semantics](https://developers.cloudflare.com/d1/reference/time-travel/): restore overwrites in place and can cancel in-flight queries; Free history is7 days, distinct from Paid30 days. Neither historical-window limit is requalified by this current-bookmark drill. Bookmarks can advance without application changes, so data parity is checked directly instead of demanding bookmark equality.
