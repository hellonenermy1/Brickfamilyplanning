# Phase 8D continuation — private repository and recovery failure boundaries

**IN PROGRESS / NOT PASS.** Continued `v1-p8d-backend-deep-audit` from `ec9d61d864a89dfd411b1c929e766bc509a985be`; latest executable `f93e3c858da1b270aa1cd4619995c1736c3a32e5` is green in hosted CI 41856987680, all 3 jobs. No Android changes, deployment, live SQL/resource writes, secret access or family-record access.

## Private GitHub access and controls

Authenticated repository metadata confirms `visibility: private`. Connected GitHub can read source, branches, Actions jobs/logs and write audit commits. The user's stated GitHub Team subscription is acknowledged; no billing/account entitlement has been verified or inferred from it.

Read-only GitHub observations this continuation:

| Surface | Actual result | Meaning |
|---|---|---|
| Audit branch | Head ec9d61d; protected=false, required checks off | Source CI exists but branch protection does not enforce it. |
| main | Head 57343b3cab0c5c18572a8dcafda0a3cfc09209c0; protected=false, checks off | Main is not protected according to branch metadata. No merge or branch change performed. |
| Repository rulesets | GET returned [] | No repository ruleset was returned. This is not an organization-wide policy audit. |
| main/protection detail | HTTP403 Resource not accessible by integration | Detailed administration read is blocked even though the repository's normalized user permission map includes admin. Do not confuse user permissions with integration scopes. |

No settings were changed. Before release, configure applicable branch policy with required successful audit checks and reviewed changes, explicitly decide admin bypass/force-push/deletion policy, and verify through permitted metadata/UI. The production accepted-branch/final-PASS workflow barriers remain intact. Private visibility does not itself establish deployed Cloudflare security or make prior public Git history/credential audit unnecessary.

## P8D-052 — deterministic recovery errors and stale transient state

**Confirmed P2; correction SOURCE/CI VERIFIED at f93e3c8.** Baseline native SQLite tests reproduced six failures:

- An unknown column or missing required field in the final restore table caused rejection only after devices had committed.
- Targets containing pairing_tokens, pairing_pin_sessions, provider_rate_window or provider_cache were accepted despite being described as fresh; stale one-time credentials could remain beside restored identities.

The restore now validates all rows' allowlisted columns, required field presence and bindable values before the first committed insert. Freshness requires all 38 durable tables **and all four transient production tables** to be empty. Rejection preserves preexisting target records. It never silently deletes credentials.

Seven native SQLite checks now pass: two late malformed-row cases commit zero inserts; four occupied transient cases are refused before inserts; injected second-batch D1 outage propagates failure and retry into that partial target is refused. The last case intentionally demonstrates the remaining limitation: SQL constraints, network/service faults or concurrent writes can still leave partial batches. This is not an atomic whole-restore claim. Discard a failed isolated target and restore into a new one; never run against active production or accept a partially recovered database.

Development-only D1 tables are not covered by this production restore API. Its live drill must explicitly target a fresh isolated production-schema database; no development credential migration is implied.

## P8D-053 — supported backup byte envelope

**Confirmed P2; correction SOURCE/CI VERIFIED at f93e3c8.** Before correction, a structurally valid >16MiB gzip expansion was accepted, and an oversized generated snapshot was published. The existing per-table row cap did not bound byte volume.

Explicit supported envelope introduced:

| Representation | Maximum | Enforcement |
|---|---:|---|
| Compressed backup input | 8 MiB | Reject before hash/decompression. |
| Decoded UTF-8 JSON | 16 MiB | Count decompressed stream bytes, cancel on overflow, reject before JSON parse. |
| Generated snapshot JSON | 16 MiB | Reject before compression/publication; compressed result is also validated before put. |

These are conservative engineering limits, **not asserted Cloudflare service quotas**. Exact decoded boundary is accepted; one byte over rejected; high compression ratio does not bypass the limit. UTF-8 decoding is strict. Failed oversized generation performs no R2 put, list or prune, preserving prior recovery objects.

Four tests pass: compressed max+1, valid high-ratio decoded max+1, exact decoded boundary and oversized producer no-publication/no-pruning. The guard does not bound D1 response allocation before serialization or prove production memory/CPU/throughput safety. Database response size, high-volume snapshots, streaming/partitioned recovery and observability remain open scale gates. No existing backup was deleted or truncated.

## Native local Workers hibernation evidence

The existing actual production-entry Miniflare/workerd integration now subscribes a WebSocket with a 3-second lease, requests DO eviction with `webSockets: hibernate`, verifies an unexpired socket survives, wakes the object via authenticated state read, and observes idle alarm expiry with code4001. Existing signed ingest -> D1 -> Queue -> R2, duplicate idempotency, synthetic Access JWT, revoked-object reconstruction and fresh v3 D1 restore also pass.

This raises **local native runtime** evidence for 8D.10; it does not prove live Cloudflare hibernation/session ownership/device behavior. No production code was changed for this test.

## Fresh live evidence — attempt 3, unchanged blockers

Reran failed jobs of [41839919454 attempt3](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41839919454/attempts/3), still executing old attestor SHA d74b30d97e97a01ce55171f1931c685d51f4d180. Actual logs read:

- Metadata job126664822391 at 2026-11-04 15:16:55Z: prod active/latest lack HISTORY, MAPS, EVENTS and four parent rate bindings; dev lacks geocode/commute quotas; Queue/DLQ absent from paginated account inventory; deployed source SHA unknown; R2 lifecycle and Access policy read blocked.
- D1 catalog job126664822472: HTTP401, D1 Read/resource scope required.
- Parent status-only job126664822858: 9 expected outcomes, 2 prod local-login redirects inconclusive, publicly served prod /parent/login FAIL. Protected device/map APIs reject missing credentials/forged dev marker with401. No body/cookie/family data read.

Changing GitHub visibility or subscription did not change these live results. Token owner still needs scoped Workers R2 Storage Read, Access Apps and Policies Read, D1 Read on the existing dedicated audit token/account. Then rerun read-only audit before preparing authorized configuration changes. Never paste private token values.

## Remaining acceptance work

Keep the previous 19-section/525-requirement tracking and findings. These changes do not close full P8D-002 recovery, deployed identity/schema, production Access policy, binding/Queue drift, live cross-store failure/ACK/DLQ proofs, real retention, rollback, repository protection or physical phone gates. Upgrade the old live 18-table helper before running it; its current guard still prevents accidental incomplete qualification.

New blocking source CI includes recovery preflight and byte-limit tests; exact hosted result follows below. **No 8D final PASS; 8E/8F not started.**


## Hosted source verification — f93e3c858da1b270aa1cd4619995c1736c3a32e5

[Source CI 41856987680](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41856987680) **3/3 jobs SUCCESS**. Source job 126668176641: 64/64 steps; deployment job 126668176592: 7/7; backup job 126668175549: 7/7. Job log was fetched and inspected after completion, with no error/FAIL lines. Seven P8D-052 checks, four P8D-053 checks and native socket hibernation/reconstruction/expiry all pass, along with prior route/auth/Queue/recovery regressions and actual SQLite CLI source-destruction/38-table restore. Evidence: `PHASE8D_SOURCE_CI_41856987680.txt` (PASS summaries, not an asserted 95 independent tests).

P8D-052 and P8D-053 are **SOURCE/CI VERIFIED** at this SHA, to the exact limits above. Whole-restore SQL/service atomicity, high-volume D1 allocation/memory behavior and live cloud recovery remain OPEN. GitHub repository private and authenticated source/log/write access verified. main/audit branch metadata unprotected; no settings modified. Live read-only run 41839919454 attempt 3 remains failure with unchanged drift/scope/Access findings. No Android edits, deployment, Cloudflare writes or family data access. Follow-up commit is documentation/evidence only. **8D NOT PASS; no Phase 8E/8F.**

Next: obtain scoped read metadata for Cloudflare, prepare authorized infrastructure/Access repair and isolated current full-stack recovery/rollback. Preserve branch ec9d61d→f93e3c8 lineage; do not restart or infer final PASS from source CI.
