# Group1 — external management source boundary

Group1 NOT READY; Phase8D NOT PASS; P8D-002 P1 OPEN. The source profile and CI drift guard do not install external writer admission or an urgent-outage fallback. Runtime/source activation remains prohibited.

## Current beta tools

| Tool | Source-observed effects | Required external boundary |
| --- | --- | --- |
| setup-beta-d1.mjs | D1 creation/migrations/session invalidation, Worker deploy/secrets and generated provenance | Explicit maintenance exclusion spanning the entire resource/source transition; new deployment identity must be requalified before capture |
| ensure-beta-d1-columns.mjs | Direct account-level D1 ALTER TABLE after schema inspection | Account/database/source-pinned ownership through all schema work and completion; no overlap with held capture |
| publish-beta-d1-release.mjs | Direct temporary parent-session INSERT/DELETE; authenticated APK publication and byte-for-byte readback | Ownership must include final session cleanup and any actual publication side effects; not just the HTTP body transfer |
| verify-beta-live.mjs | Direct temporary parent-session INSERT/DELETE and authenticated/unauthorized HTTP probes | Verification is not globally read-only; HTTP GET can start server maintenance, and session cleanup must settle before ownership ends |

These four known beta tools are currently **unfenced external writers**. Their existing identity/provenance checks are preserved; no tool was executed and no target or write permissions were inferred. Direct console/API/CLI calls, separate credentials and untracked/out-of-repository automation remain outside a Worker-only gate. Deployments also change executable code/resource identity, not merely rows.

The obsolete beta setup-beta-cloud.mjs and install-beta-map.mjs already begin with an explicit R2 refusal. They were not repaired again, executed or reactivated. Historical imports/bodies remain indexed; this source observation does not prove every transitive import is harmless. Legacy development/production tools retain separate classifications and are not approved beta writer paths.

## Reproducible source guard

phase8d-external-writer-inventory.mjs reads selected tracked scripts/tools (including shell/Python/PowerShell/batch), workflow YAML and package.json as bytes. It never imports or executes audited tools, reads credentials or makes cloud requests. Every selected file receives SHA-256 and Git blob identity. Literal management/token/Wrangler/remote markers require an explicit source-policy classification; missing classified files or invalid classifications refuse. Files without a literal marker remain **not proven safe** and are still hashed.

Static JS imports, literal relative file URLs, script text references and known npm-run targets are retained as conservative reachability candidates. References embedded in tests/comments and conditional workflow jobs can overapproximate execution. Dynamic imports, out-of-index dependencies, generated files, npm/shell indirection and subprocess descendants remain visible gaps. POST is not automatically mutation: the metrics GraphQL POST is separately classified. Test filenames do not establish harmless effects.

The default CI index comes from git ls-files. A --source-index path list exists only to reproduce a full remote checkout in this partially materialized workspace; the hosted gate uses the actual tracked checkout and byte-compares the regenerated artifact. CI also runs17 synthetic source-map cases for new management candidates, missing entries, invalid classifications, deterministic hashes, conservative links/npm targets, unresolved imports and path selection. These are change-detection cases, not product acceptance or a count of remaining writers/tests.

PHASE8D_GROUP1_EXTERNAL_WRITER_POLICY.json is an explicit source classification record, not authenticated independent review or permission to run a tool. PHASE8D_GROUP1_EXTERNAL_WRITER_INVENTORY.json records the actual counts/hash set and unresolved candidates. A changed artifact cannot independently establish safety; source review and enforced operational controls are still required.

## Outage and lifetime obligations remain

| Condition | Current staged behaviour / remaining obligation |
| --- | --- |
| Admission/authority transport fails before urgent work | Configured runtime helpers refuse the operation. A safety-preserving durable fallback is still NOT_IMPLEMENTED; ignoring the error is not an acceptable bypass |
| A source SQL/RPC or deferred descendant hangs | Retain unresolved durable ownership. Never expire a writer merely because the caller stopped waiting |
| Work commits but release becomes uncertain | Preserve the completed operation result; retain/report uncertain ownership and block unproved quiescence. Do not automatically replay cloud mutations |
| Operator tool's final cleanup hangs/fails | An eventual external envelope must include actual cleanup settlement; leaving an unaccounted promise or detached process cannot count as writer completion |
| Deployment replaces source/bindings or an authority is recreated | Revalidate exact source/resource/authority identity; an empty/new registry is not evidence older writers stopped |
| Independent operators/credentials are unenumerated | External enforcement remains unknown. A reviewed script list does not constrain account administrators or another credential |

Next Group1 implementation must connect explicit external maintenance/admission controls and prove urgent authority/storage/transport-outage behaviour together with complete raw/deferred/lifecycle coverage. Then authenticated capture transport, independent private card-free destination/separate key/context custody, schedule/readback/age/failure monitoring, usable least-privilege current PITR and explicitly isolated cloud restore/interruption/rollback/RTO/RPO remain. Existing login/denied-read barriers are not retried. No other group or canonical acceptance advances; no production configuration/data/schema/credential, APK/UI/phone, R2/card/billing, merge or deployment changes.
