# Group1 current beta read prerequisite — live read not dispatched

Source `311d78d4ee9fe43ff23d4f875e21ff8e0bb8fa5d`, tree `0aa180f17a0090f02e11648fddcd6bc340fef4f7`; integration base `141cbf42efaa61873c4fa87138ca5a0a19d404a2`. This is G1.5/G3.1 metadata/PITR prerequisite preparation, not operational acceptance. Group1 NOT READY, P8D-002 P1 OPEN, Phase8D NOT PASS; four-day forecast AT RISK.

## Problem and resulting check

The old account attestation targets production/development plus R2/Queues/Access. It cannot qualify the card-free D1 beta. `scripts/cardfree-beta-readonly.mjs` now checks the current `brick-family-beta` serving deployment and exact active version, approved beta modes/source label, two D1 bindings, two DO namespaces, account subdomain/Worker enabled hostname, both D1 identities and current bookmarks; optional historical bookmark reads require an explicit recent timestamp. A final deployment reread refuses observed drift. Every provider request is GET with no body and redirects disabled, bounded response bodies, individual/aggregate deadlines and sanitized fixed failure codes. No deployment-token fallback, family rows, D1 SQL, resource changes, R2/Queues/Access calls or credential changes.

A source SHA variable is a self-reported deployment label; it does not verify executed bytecode. Before/after deployment equality is not an atomic cross-service snapshot or proof against ABA drift. Successful reads show capability, not token least privilege, full retention, consistency or recoverability. RTO/RPO, independent custody and complete writer coverage remain unproved.

## Test and workflow boundary

44 synthetic transport/private CLI cases plus2 actual workflow event-loader cases pass. All26 local audit/build groups pass, including full signed encrypted source destruction/fresh native restore and populated relationship parity/restart. Hosted exact-source qualification is recorded separately in the JSON evidence. Production runtime graph90 files unchanged from the immediate baseline; historical carry projection remains unequal and no history pin moved.

The existing no-cloud-writes workflow has an opt-in `workflow_dispatch` job: `run_cardfree_metadata=true` and `plan_json`. Ordinary push/PR skips it. Only `CLOUDFLARE_AUDIT_READ_TOKEN` is available to the read step. The event JSON loader creates a private0700 directory/0600 plan without shell interpolation; the only uploaded14-day artifact is sanitized output. Never include tokens in inputs or artifacts. Manual dispatch availability on this nondefault source branch still requires verification; no merge is authorized to enable it.

## Actual access result and recovered pins

No current Cloudflare request was sent. The connector exposes rerun but no manual dispatch creation, and the browser workflow page is signed out. This is a dispatch/authentication blocker, not a new Cloudflare permission denial. Do not assume the dedicated secret is missing: historical run41839919454/job126994212008 read some Workers metadata on Nov5, while legacy provenance and R2/Access checks failed. Its current availability is unknown. Do not repeat obsolete denied R2/Access/login paths or substitute the deployment token.

Latest successful recorded beta deployment run42255984279 used source `141cbf42efaa61873c4fa87138ca5a0a19d404a2`. Artifact13521829322 ZIP SHA256 `60e5e6d17cba16b3f2c194708d3085c80d7f132e52527b05e9b9a36f6bd7ec82` was downloaded and verified. Only non-secret `beta-setup-state.json` was parsed; encrypted parent credential material was not opened. Account/D1/hostname/source pins were recovered to a private scratch plan; committed evidence contains hashes only. These are historical expected pins, not current provider observations. The state has no DO namespace IDs.

## Exact resumption

1. Finish exact-source CI qualification before live use. Verify source branch, tree and unchanged integration base from the evidence.
2. Restore the verified deployment artifact above when the private scratch plan is unavailable. Read only `beta-setup-state.json`; verify ZIP digest and recorded source first. Map accountId/d1Id/betaD1Id/workerHost/sourceGitSha to accountId/primaryId/diagnosticId/workerHost/expectedSourceSha. Set workerName to brick-family-beta. Do not open parent-login material or commit raw account/resource IDs.
3. Use an authenticated GitHub manual dispatch on the audit source branch, or a verified local dedicated read capability. No new credentials/permissions are implicitly authorized. The committed null template documents field names; it is deliberately not executable as-is.
4. With both namespace IDs absent, set them explicitly null for an observation-only read. It can hash observed valid namespaces and complete metadata reads, but must fail full qualification with DO_NAMESPACE_PINS_REQUIRED/exit2. Independently establish the actual two expected namespace IDs before a fully pinned run. Do not automatically trust newly observed IDs as reviewed pins.
5. On any denial, source/host/binding mismatch or timeout, retain sanitized evidence and stop unchanged retries. Never change the expected source merely to make the check pass. Review current identity first.
6. Even a fully pinned read PASS leaves actual recovery installation, restricted B2 runtime host/credential, separate key/record/digest/config/current journal custody, schedule/recipient, independent guard domain/TLS and isolated cloud restore/interruption/rollback with agreed measured RTO/RPO and real acceptance review open.

Canonical525 criteria/owners/reviews/dispositions and214/311 mapping remain unchanged; only OPS-002/003 supporting evidence is extended. `reviewedSourceSha=null`. Prior B2 roundtrip remains real evidence; no repeat provider upload or live cloud change occurred.

## Primary API references

- https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/list/
- https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/methods/get/
- https://developers.cloudflare.com/api/resources/workers/subresources/subdomain/methods/get/
- https://developers.cloudflare.com/api/resources/d1/subresources/database/subresources/time_travel/methods/get_bookmark/
