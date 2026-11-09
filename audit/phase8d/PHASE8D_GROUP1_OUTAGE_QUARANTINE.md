# Group 1 urgent outage quarantine — staged only

This batch addresses the previously unimplemented urgent-outage source path. An installed writer controller may now use an independently durable quarantine capability when admission or START acknowledgement is uncertain. Only urgent work can use it. A correct committed receipt must arrive before actual work; explicit busy/malformed admission, ordinary work, missing/corrupt guard, a failed write, a lost acknowledgement or a deadline cannot authorize effects.

`src/capture-outage-quarantine.ts` supplies a SQLite Durable Object transaction store, pinned to the exact source/resource identity. The guard must be a separate failure domain from the admission authority. Its poison is constant-sized and permanent: successful work, elapsed time, process restart, normal release and repeated initialization never clear it. There is no reset/TTL/reconciliation endpoint. Replacing/restoring/deleting guard storage is not an approved way to resume capture; a new independently reviewed operational epoch and complete writer reconciliation are still required.

All source/capture holders and the final release must use `guardedCaptureAuthority` with that same pinned guard. It checks before and after held assertions and before and after final authority release. Cleanup still attempts authority release when guard reads fail, but cannot acknowledge a usable archive. This rejects poison racing with source paging, device reads or sealing/release. A write beginning only after the final clear check is ordered after the completed capture; it cannot change bytes already read. Failed/unknown older writers remain tracked under the existing rules; the fallback does not cancel STARTED/legacy work or declare quiescence.

The writer helper retains the normal scoped deferred-work handling and generic notices. A fallback never sends a fabricated ticket to normal exit. No runtime code installs a controller or guard, creates a route/binding or modifies a deployment. The native fixtures explicitly install trusted test capabilities only.

## Verification

- 25 new native cases cover real SQLite guard transactions, rollback, exact identity, corruption, both paths down, lost/late receipts, uncertain START, nested deferred errors, release races, constant storage and disposal/restart persistence.
- Those cases invoke the actual beta device revocation and actual D1 execution adapter: neither changes state with an uninitialized guard; both perform their actual durable mutation after independent quarantine commits. Revocation and quarantine both survive restart.
- Four new full coordinator cases use actual Miniflare D1/BLOB data, a separate native guard object, encrypted journals and authenticated archives. Healthy capture succeeds; poison during paging, device snapshot or final release prevents any returned archive. The coordinator suite has 26 passing cases and retains the five-source-statements maximum.
- Existing writer boundary cases remain 29. New native/coordinator cases total 29. The full audit workflow and exact-source hosted results are recorded in the companion evidence file once available.

## Activation gaps

This is source/local proof, not operational acceptance. A trusted installation must pin and authenticate the separate guard transport and enforce that **every** capture/export/journal-resume/seal/release path observes it. A raw admission authority or old coordinator must never remain an alternate capture route. Guard bootstrap, least-privilege access, deletion/restore protections, outage independence and operator alerts need review.

Fallback eligibility must apply only after genuine urgent operation authorization. Generic `worker.fetch`/`worker.scheduled` boundaries currently include broad work; blindly assigning their controller a permanent fallback would let unrelated requests poison backups. Their authorization/urgency classification and full root-to-descendant behavior remain unqualified. Actual device/D1 fixture success does not close that gap, complete writer coverage, raw/operator credentials, started/legacy reconciliation or production rollout. If both admission and guard durability are unavailable, the implementation refuses effects; no safety-preserving third path is claimed.

Independent B2 runtime credentials/key/context custody, installed scheduling/real-recipient monitoring, current PITR and isolated Cloudflare recovery/RTO/RPO remain open. The earlier approved synthetic B2 test is preserved and was not repeated. Group 1 remains NOT READY, P8D-002 P1 OPEN and Phase 8D NOT PASS. No deployment, merge, live Cloudflare mutation, family-data export, R2, card or account-permission change occurred.
