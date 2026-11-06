# Group1 — external tool ownership and uncertain outcomes

Group1 NOT READY; Phase8D NOT PASS; P8D-002 P1 OPEN. Four actual CLI entry points now contain inactive ownership boundaries. No production controller, authenticated broker/transport, authority binding or urgent-outage fallback is installed.

## Actual tool boundaries

| Tool | Operation | Configured boundary |
| --- | --- | --- |
| setup-beta-d1 | deployment | Metadata account discovery precedes admission; all later provisioning/schema/deploy/secret/provenance work is inside the boundary |
| ensure-beta-d1-columns | schema | Read-only account/database discovery precedes admission; schema queries, changes and verification are inside |
| publish-beta-d1-release | publication | Session INSERT, file read, HTTP publication, byte readback and final session DELETE are inside |
| verify-beta-live | probe | Boundary starts before the first Worker HTTP probe, includes session INSERT/DELETE and final report write |

staged-external-writer.mjs has no production installer or environment/request activation. Default unconfigured calls execute existing work unchanged. A trusted fixture controller is installed once per module; configured requests pin source/account/database/Worker host/name and the authority's resource-set identity. Extra/mismatched scopes, malformed/foreign tickets, uncertain or busy admission start no tool work. A deployment may explicitly name an unknown new database, since durable quarantine prevents the old resource/source proof being reused; this is not automatic approval of a new database.

CaptureAdmissionStore.enterExternalWriter performs source/resource checks and writer registration in the actual durable transaction. Publication/probe admissions refuse held/draining capture and retain a non-expiring writer until confirmed completion. Schema/deployment admission durably sets permanent capture quarantine BEFORE returning a ticket. Completion, initialize and restart cannot reset quarantine. Urgent work still admits/preempts normally. Changed source/resources require separate explicit requalification and proven reconciliation of old writers; no automatic reset or new-epoch shortcut is provided.

The registry state retains compatibility with prior ordinary/urgent writer records and validates external-operation records separately. Ticket IDs cannot switch between ordinary/runtime and external purposes. Transaction rollback returns no admission/quarantine acknowledgement. No public RPC route, DO binding/migration, schema or credential was added.

## P8D-093: rejection is not remote completion

The earlier compiled runtime helper released a writer after its work promise rejected. A controlled lost-response reproduction against the exact prior source observed zero active writers/one exit while a delayed remote effect remained pending, and that effect subsequently committed. This is a real counterexample in the compiled staged helper with controlled remote capabilities, not evidence of a live provider incident or an actual production archive.

Configured runtime and external helpers now retain unresolved ownership when primary work or registered deferred work rejects. The original error/result is preserved, other registered descendants still drain, and a generic WORK_OUTCOME_UNCERTAIN notice is emitted. A rejected HTTP/D1/process result is not treated as a rollback or proof remote effects stopped. No automatic mutation retry, writer expiry or arbitrary cleanup erases that uncertainty. Even a known local error is conservatively unresolved unless a separately proven reconciliation path establishes completion; that path remains unfinished.

Successful work awaits actual tool cleanup before bounded release. Lost/false/hung release preserves the completed result and leaves explicit uncertain ownership. A correctly bound late admission can be cleaned only because work never began; schema/deployment quarantine remains. These rules supersede earlier helper tests that expected a rejected promise to release its writer. P8D-093 source correction does not implement the urgent authority/storage/transport-outage fallback.

## Verification and remaining limits

- Native durable-admission suite:34 cases (26 inherited plus8 external admission/identity/quarantine/rollback/restart cases).
- Runtime helper:22 cases (21 revised/inherited plus1 delayed-effect regression); D1 adapter22 cases retain provider-error uncertainty.
- External helper and actual CLI modules:21 cases, using synthetic HTTP, blocked spawn and an actual local durable authority. All four actual tools refuse held capture before management writes or Worker traffic; setup/schema metadata reads remain permitted. Actual publication/verification keep native ownership through readback/final cleanup. Lost cleanup leaves capture DRAINING. Console messages emitted by actual CLI modules under stubs are not live portal, signed APK or provider acceptance.
- The full actual41+4/deviceDO encrypted source-destruction-and-restore drill remains separate inherited verification. Existing Miniflare RPC-stub disposal warning is retained.

All four production tools remain unconfigured, and direct administrators/credentials, untracked automation, raw bindings, detached descendants and process trees remain unaccounted. Operation admission is capture exclusion, not proof schema changes are isolated from urgent application writes. Live target/policy enforcement, broker authentication and latency, unknown-outcome reconciliation, source-transition procedures, complete coverage and urgent-outage handling must precede activation. Independent private card-free destination/separate key/context, schedule/monitoring, current PITR and isolated cloud restore/RTO/RPO also remain open. No live mutation, R2/card/billing, APK/UI/phone change, merge or deployment occurred.
