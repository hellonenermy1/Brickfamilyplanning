# Group1 — current portal-base integration

Group1 NOT READY; Phase8D NOT PASS; P8D-002 P1 OPEN. The audit candidate is integrated with the observed approved portal branch at141cbf42efaa61873c4fa87138ca5a0a19d404a2, while retaining the complete prior audit head2069e3373663c99b4d9d9cd93ac919610758b958 as first parent. This is a candidate merge, not merging PR32 into the live branch or deploying it. Historical qualification against612d4a8b16fb829f9528b06ab6448ab85ac483e6 remains historical evidence.

Twenty-four paths changed only on the portal side and are retained byte-for-byte from that branch. Six overlapping files were merged from the common frozen baseline; five merged automatically and were reviewed against the newer portal source. The single textual conflict in setup-beta-d1's migration list is resolved by retaining both the four Group1 maintenance migrations and the new Phase2 parent-credential migration. Phase2 passphrase rotation/session preservation, client freshness, history device/gap isolation, Health truth, fall quarantine/manual SOS behavior and newer beta-release metadata are carried forward. Their source/native regressions do not close field/browser/OPPO issues or qualify another audit group.

| Overlap | Resolution |
| --- | --- |
| scripts/setup-beta-d1.mjs | Both migration sets; preserve newer login-provisioning/session behavior and inactive external deployment boundary |
| scripts/test-beta-workerd.mjs | New portal scenarios plus current card-free fixture and probe-only cleanup assertion |
| scripts/verify-beta-live.mjs | New private password-form and credential-schema probes within existing staged external ownership/cleanup |
| src/beta-api.ts | New portal observations plus Group1 background-work status |
| src/dev-parent-auth.ts | New private rotation/authentication behavior plus bounded Group1 session/login-token cleanup |
| src/worker-beta-cardfree.ts | New authenticated portal routes plus Group1 scheduler/maintenance ownership and inactive D1 boundaries |

## Credential schema compatibility

The actual new dev_parent_credentials table stores a parent verifier. The previous candidate's closed recovery inventory refused this new table as unclassified. A native synthetic regression reproduces that refusal before the correction; this is an integration availability gap and a fail-closed observation, not a production credential leak.

The table is now explicitly listed among excluded authentication tables. It is never put into a card-free backup and is not restored from source. Capture leaves its verifier intact. An isolated target that already has a verifier refuses restore as nonempty without deleting or overwriting it. A fresh target restores device/history/config data with an empty credential table; independent parent bootstrap/credential provisioning is still an operator duty. Unknown credential-like tables remain unclassified and fail closed. The card-free fixture and provisioner include the additive migration; no migration is run on a real account. Native tests use a clearly synthetic non-secret verifier.

The external-tool fixture was updated to model the newer private password route's exact303/Location response, authenticated confirmation form and explicit read-only credential-schema query. These remain synthetic HTTP/process capabilities. The actual beta native test and full Phase2 source/VM/auth regressions independently exercise the composed implementation. No real secret is changed and CLI stub output is not a live-portal or signed-APK acceptance claim.

## Qualification limits

Current exact source, CI checkout identity/parents, full audit and Phase2 job outcomes and target-base ancestry must be verified before calling integration qualified. No production controller, authority binding, key, transport route, capture schedule or monitoring service is installed. Full runtime/operator/credential/lifecycle/deferred/process-tree coverage and safe urgent-outage fallback remain incomplete. Actual independent card-free storage/separate key/context, scheduling/readback/monitoring, current PITR and isolated live-cloud restore/interruption/rollback/RTO/RPO remain open. Existing Miniflare RPC-stub disposal warnings remain. Canonical requirements/status/owners/reviews/dispositions are unchanged.

The newly available B2 connection was checked read-only: connected, with no visible buckets at inspection. No bucket, key, file, sharing, retention, lifecycle, encryption or billing setting was created/changed. This is not proof of a usable independent backup destination, free-tier/card status, key custody or encrypted cloud readback. Do not infer those from connection success. Account identifiers and credentials are not committed.
