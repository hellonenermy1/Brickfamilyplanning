# Brick continuation checkpoint — 5 November 2026
Status: Phase 8D IN PROGRESS / NOT PASS. This is a verified handoff, not acceptance or a reset of prior work.

## Authority and source identity
Read the current user instructions first. Attached audit authority: Brick V1 Phase 8 Full Audit Execution Plan(8).pdf, 76 pages, SHA-256 d82b4f1b4e1cbae49d10586581d94447cd03753196f1091b2064524ced6c1edf. Global rules pp.1–9; backend sections 8D.1–19 pp.44–54; later portal/integration/OPPO gates remain separate.
Repository: hellonenermy1/Brickfamilyplanning (GitHub currently reports private; older baseline calling it public is historical).
All SHAs below were read from GitHub, not inferred from chat memory.

| Workstream | Observed branch head before this documentation update | Meaning |
|---|---|---|
| Formal backend audit | v1-p8d-backend-deep-audit @ 71f5460fa6dfb47e276121e6c69db98cdae4485a | Latest audit checkpoint; not deployed or accepted |
| Beta backend/portal | beta/backend-portal @ bea6277566d91deb205d0d4e4ba8c53febb289ea | Includes newer D1 deployment and map/cache hotfixes |
| Beta APK | beta/apk @ d67d606bb672892187112196961080dff821c2cf | Documentation after approved runtime fa52547d89929e2032fc8ced4511b79e9bf8a23c |
| Default branch | main @ 57343b3cab0c5c18572a8dcafda0a3cfc09209c0 | Not the continuation target |

Documentation commits after these heads are not new runtime builds or deployments.

## Superseding constraint: D1, no R2, no credit card
The user's repeated approved decision supersedes older R2/Queue/Access provisioning instructions. Beta AGENTS.md and PROJECT_MEMORY.md already record it. Never ask for R2 activation, billing or a payment card.
Current beta template enters src/worker-beta-cardfree.ts with APP_ENV=development, BETA_STORAGE_MODE=d1, private D1 parent sessions, primary D1 plus separate diagnostics D1, device DO plus separate scheduler DO. No R2 or Cloudflare Queue bindings, no Cron slots or Zero Trust requirement. Legacy HISTORY/EVENTS adapter names are not proof of those Cloudflare services.
Do not execute the old PHASE8D_LIVE_ACCEPTANCE_NEXT.md R2-token/provisioning queue literally. Preserve its historical evidence, then reconcile applicable obligations with the approved D1 architecture. D1/direct persistence needs its own durability, recovery, retention, auth and fault evidence; old R2 tests cannot be relabelled.

## Verified audit position
Read PHASE8D_RESUME_CHECKPOINT.md, PHASE8D_FINDINGS.md, PHASE8D_EXECUTION_MATRIX.md and PHASE8D_REQUIREMENT_RECONCILIATION_2026-11-05.md alongside this superseding operational note.
- Canonical ledger: audit/phase8c/PHASE8C_RECOVERED_525_REQUIREMENTS.csv.
- Draft release-evidence/PHASE8D_REQUIREMENTS_LEDGER.json: 525 exact rows; 214 PHASE8D / 311 CROSS_PHASE; 10 rows have partial evidence; all 525 dispositions UNRECONCILED, reviewedSourceSha=null. This is an unfinished acceptance worksheet, not 525 newly broken features.
- Latest audit-tool executable f87a0be0bdaf320752d747ae2a39da01ee0a1ece; run 41956379795 reports overall success. Fresh job GET STILL returns deployment-contract job 127012150851 status=in_progress, conclusion=success, despite seven completed successful steps. Source and backup jobs completed-success. Preserve this inconsistency; do not manufacture an all-jobs-completed pass.
- Local destructive D1/R2/DO recovery at 58285064/CI41952880677 is real within its documented synthetic scope; live recovery/scale/RTO/RPO is not proven. It does not qualify the later D1 adapter automatically.
- Phase8C final acceptance records bounded source/build/emulator PASS at frozen Android runtime 2c492efff01095e17f96af3c24ac07ac0b5c3739; beta APK later changes remain separately qualified. No physical OPPO production qualification inferred.
- Formal live audit 41839919454 attempt5 remains failed historical evidence at old attestor d74b30d9. Its R2/Queue gaps describe that deployment/architecture, not the current D1 beta.
- No Phase8D final acceptance, 8E/8F completion or production qualification established.

## Verified beta deployment and APK
Latest observed successful backend deployment: source 63075728e51d62d83641a0883deeb5e585fdf116, run 41996937662.
Fresh job GET: preflight127142303820, APK currency127142304170, test127142304243 and deploy127142747249 all completed-success.
Actual deploy log inspected: source SHA annotation matches; two Worker versions were emitted during the job, final printed version 596a193d-d05c-46be-9885-835e7d168b62. Final private card-free portal verifier succeeded. Artifact13400592823 contains that run's deployment evidence.
Portal: https://brick-family-beta.lumjayvian.workers.dev/parent/login
This is the latest inspected CI deployment evidence, not a fresh independent Cloudflare API assertion that no later deployment exists. Older FINAL_RESULTS/D1_HANDOFF source20b68c is the initial delivery snapshot.
Approved APK source fa52547d89929e2032fc8ced4511b79e9bf8a23c; SHA256 0ab070bea12ca607b0a38ee863087aadddb44c9f2a8c60ac496b914d1166a6fc; package com.brick.safety, versionCode11, testOnly=true.
Latest matching runs: build/sign41973723331, emulator41973723402, AOSP Device Owner41973723575 all report success. AOSP is emulator/platform evidence, not actual OPPO testing. Preserve signed bytes and safety/escape fixes.

## Open user defects — GitHub issue26 including all comments
- Map grey/blank and device-picker startup: PR27/28/29 fixes followed by cache/module hotfix PR30 at63075728. Deployment is now verified by the successful job/log above; actual signed-in browser rendering is still unverified. Do not close based on PNG/network tests.
- Current recorded layout is92vh desktop/70vh mobile, superseding earlier50vh/42vh notes. Do not revert to older preference by accident.
- Login header fix is included in newer deployment lineage, but actual user browser sign-in acceptance remains unverified here.
- Repeated location-backlog/device-degraded symptoms are a separate reliability issue from map tiles.
- Most recent comment6654137276: Wi-Fi schedule last result unsupported after user reports enabling Device Owner. Stored result may predate ownership; current portal lacks attempted_at/detail/actual_enabled display. Source analysis is recorded, actual OPPO owner state/post-owner execution unknown. No silent Wi-Fi toggling.
- Legacy revoked phone on brick-family-v1-dev: separate prepared hide fix8fc30d4, deployment not established. Keep old dev and beta separate.
- Fresh beta reset: preparation branch ops/beta-fresh-reset-preparation, not executed. No deletion/reset until backup/restore and DO/scheduler/APK preservation prerequisites are satisfied.
- Actual signed-in browser/OPPO readiness and72h completion are not established. Check for newer private evidence before assuming no user-side work occurred.

## What “continue” means in this chat
Continue the highest-priority unresolved approved work from this checkpoint, using the correct branch and fresh refs. Do not restart audit phases, randomly redesign, remove features, reset data, downgrade security or rebuild unchanged APKs.
Work through as many substantive, verifiable steps as feasible per prompt: inspect → reproduce/record → fix → targeted regression → relevant CI → scoped authorized deployment/verification → update findings/checkpoint. Move past a blocked item to independent useful work; do not repeatedly rerun unchanged denied checks.
Stop only for an actual missing input/credential/action, a required decision, destructive/unapproved scope, or a concrete execution limit. Explain the specific blocker and finish independent authorized work first. Do not claim certainty or completion without proof.

Next substantive queue:
1. Reconcile the formal8D operational contract/19-section matrix and applicable per-ID requirements with the already-approved D1 beta, preserving every requirement ID, classification, historical finding and scoped proof. Identify exact transferable versus new D1 evidence; do not wholesale mark accepted or invent owners/reviewers.
2. Obtain/inspect deployment artifact13400592823 and current exact-D1 source/schema/bindings evidence through existing authorized CI/API paths; distinguish public configuration from private family data. No need to activate R2 or expand R2 token scopes.
3. Qualify D1-specific ACK/idempotency/direct-event/retention/migration and full primary+diagnostics+DO recovery against synthetic isolated resources; first finish local reproducible work and a concrete named cloud drill/rollback plan. No destructive production drill.
4. Resolve current portal defects on beta/backend-portal with browser/runtime proof where available; preserve the latest layout, authentication, device records and APK. Physical phone actions/72h require actual evidence and cannot be faked.
5. Reconcile all525 per-ID dispositions and all19 sections at their proper scope; retain later8E/8F/9 deferrals honestly. Phase8D exit still requires no openP0/P1, known routes/auth/persistence and demonstrated appropriate recovery.

This session changed documentation/instructions only. It did not rerun runtime tests, deploy, alter Cloudflare resources, touch family records, reset devices or rebuild an APK.
