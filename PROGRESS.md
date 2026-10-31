# Brick Progress Log

This file is append-only in spirit: add new entries at the top or bottom, but do not rewrite history to make results look better. Corrections should be explicit.

## 2026-10-31 — Brick V1 Phase 2 continuation: final paired durability/retry/health hardening checkpoint

### User request

Continue Phase 2 from the existing work without restarting.

### Resume point preserved

Work continued directly on:

- Cloud `v1-p2-evidence-cloud` / PR #6
- Android `v1-p2-evidence-android` / PR #7

No Phase 2 source was merged into canonical `main` or `apk-download`. Phase 3 was not started as accepted work.

Exact paired checkpoint reached in this continuation:

- Cloud: `60697dc37cb325574e9bd22283e2b3dd1d847817`
- Android: `4ec37a2021bcd575cfefeadd58c968675965a8e7`

The Cloud Phase 2 workflow now pins that exact Android SHA and asserts it in both Android jobs, so a rerun of one Cloud commit cannot silently test a newer moving Android branch.

### Android defects and reliability gaps fixed

1. **Stale test identity fixed.** Existing Phase 2 instrumentation still used `phase2-test-device` after production pairing had been hardened to canonical v4/variant-2 UUIDs. Tests were corrected to the production identity contract.
2. **Pending wire order fixed.** `EvidenceJournal.nextPending()` now orders by `(epoch,sequence,id)` so recovery/import exact-record inserts cannot create a valid durable queue that BREV rejects for out-of-order records.
3. **Quarantine no longer permanently poisons health.** Quarantined records remain counted as diagnostic history, but current journal health can recover after the failure-hold window when a later successful journal operation proves recovery.
4. **Quiet-device health recovery added.** `EvidenceJournal.refreshHealth()` performs a deterministic `SELECT COUNT(*) FROM evidence` read probe. `HealthEvidence.collect()` calls it, so an expired failure latch can recover even if no new evidence arrives. Quarantine history is not deleted.
5. **Exact ACK deletion boundary strengthened.** `EvidenceDispatcher.drainDetailed()` classifies stop reasons and independently requires the transport ACK set to exactly equal the pending record identities before deletion.
6. **Persistent evidence failure backoff added.** Healthy backlog catch-up remains fast, Core backlog remains higher priority, and repeated transport/ACK/identity failure uses a durable 30→60→120→240→480→900 second bounded backoff instead of waking every 30 seconds forever.
7. **Instrumentation expanded.** Added/updated tests for wire ordering, quarantine recovery, quiet health recovery, missing/wrong ACK retention, transport-vs-Core stop reason and bounded retry policy.
8. **A newly introduced instrumentation compile mistake was caught in source review and fixed.** The test incorrectly accessed `EncodedBatch.records`; it now decodes `batch.bytes` through `EvidenceProtocol.decodeBatch()` first.

### Cloud request and concurrency hardening completed

1. **Actual streamed body bound.** Evidence route now uses existing `readBoundedBody(req, EVIDENCE_MAX_BATCH_BYTES)` and must not call `req.arrayBuffer()` on the evidence path. A no-length/chunked-style request above 65,536 bytes is rejected before signature verification, device-rate consumption or persistence.
2. **Oversize regression source added.** Route test includes a 65,537-byte request and expects 413, requester-only rate usage and zero durable writes.
3. **Identical concurrent uploads converge.** If another request completes the exact same batch during the transaction window, the loser reads back the durable batch and returns the exact ACK instead of surfacing a false storage outage.
4. **Mixed exact-record races converge once.** If a different valid batch wins one or more exact record identities, the current request re-reads D1 state and retries once, reusing exact winner rows and persisting only remaining records.
5. **Conflicts still fail closed.** Changed batch bytes or changed record identity/content remain `EvidenceConflict`; unrelated storage errors are not masked.
6. **Race retry is bounded.** Only one reconciliation pass is allowed.
7. **CI gates updated.** Current workflow statically locks hard batch/record identity claims, content-addressed raw storage, replay dedupe, bounded body reading, no `req.arrayBuffer()` on evidence, race convergence source and Android-DER route-test helpers.

### Exact evidence level

Earlier Phase 2 heads had real local protocol/Cloud persistence/signed-route execution and targeted record-race/DER-format checks. Those results remain valid evidence for what actually ran, including markers:

- `LATEST ANDROID KOTLIN PHASE2 PROTOCOL PASS`
- `LOCAL_CURRENT_PHASE2_CLOUD_RACE_HARNESS_PASS`
- `LOCAL_CURRENT_PHASE2_SIGNED_ROUTE_PASS`

The final paired heads above include additional hardening after those complete local runs. This session could not honestly re-run the complete final Cloud branch from an exact mounted checkout, and the environment has no Android SDK. Therefore the earlier local passes are **not** claimed as full verification of final Cloud `60697dc3...` / Android `4ec37a20...`.

### Hosted CI blocker on exact final pair

Latest checked run:

- run `41215211883`
- Cloud head `60697dc37cb325574e9bd22283e2b3dd1d847817`
- pinned Android head `4ec37a2021bcd575cfefeadd58c968675965a8e7`

Observed:

- Android compile/lint/dependency-lock: failure with `runner_id: 0`, empty runner name and `steps: []`;
- Cloud protocol/persistence/regression: failure with `runner_id: 0`, empty runner name and `steps: []`;
- Android instrumentation: skipped.

No source step executed. This remains an external runner/infrastructure blocker, not a source pass and not evidence of source failure.

### Deliberate non-change

The audit noticed that Android `elapsedRealtime` resets at reboot while the retained baseline does not visibly increment the shared live-tracker `epoch` in `BootReceiver`. That touches the existing live protocol and broader durability/replay architecture, not just the Phase 2 evidence foundation. It was deliberately **not** changed blindly in Phase 2; the issue is recorded in project memory for the appropriate durability/replay phase unless concrete Phase 2 evidence proves it blocks the exit gate.

### Current Phase 2 result

**SOURCE IMPLEMENTED + FURTHER HARDENED / PRIOR LOCAL CLOUD-PROTOCOL-ROUTE EVIDENCE RETAINED / FINAL PAIRED HEAD EXECUTION BLOCKED / NOT ACCEPTED.**

PR #6 and PR #7 remain draft/unmerged deliberately.

`PHASE2_REPORT.md`, `PHASE2_LOCAL_VERIFICATION.md`, `AUDIT_STATUS.md` and `PROJECT_MEMORY.md` were updated to the exact paired checkpoint and evidence level.

### Next required action

When GitHub actually assigns a runner, execute the exact pinned pair and require the complete Cloud integration/regression suite, Android dependency-lock/compile/lint, and Android emulator instrumentation to run and pass. Repair real failures instead of weakening gates. Only then merge the paired PRs, rerun canonical checks, verify the live Cloudflare evidence endpoint/schema/retention, and evaluate the full Phase 2 exit gate.

---

## 2026-10-31 — Brick V1 Phase 2 continuation: replay, concurrency, identity and signed-route hardening

### User request

Continue Phase 2 from the existing work without restarting.

### Resume point preserved

Work continued directly on the existing Phase 2 staging branches and draft PRs:

- Cloud `v1-p2-evidence-cloud` / PR #6
- Android `v1-p2-evidence-android` / PR #7

No Phase 2 source was merged into canonical `main` or `apk-download`, and Phase 3 was not started as accepted work.

Final staging snapshot for this checkpoint:

- Cloud: `a5c2d375d3e08c35d3674e8405663bf1483d2f4c`
- Android: `389bc8744341aebcc42f74f79403fd2b3d5d5873`

### Cloud durability / replay fixes completed

A source audit found three concrete failure/abuse cases and repaired them:

1. Raw R2 object overwrite race: concurrent conflicting requests reusing one batch UUID previously targeted the same raw R2 object. Raw evidence is now content-addressed by exact batch hash:
   `evidence/raw/<sha256-device-key>/<batchId>-<batchSha>.brev`.
2. Concurrent D1 batch-ID race: `evidence_batches` now uses a hard transactional `INSERT`, not `INSERT OR IGNORE`. A competing claim of `(deviceId,batchId)` aborts the losing D1 batch transaction so no losing record/link/state writes survive.
3. Record replay storage amplification: if every record in a fresh transport batch already exists and matches exactly, the server returns the exact ACK set with `duplicateRecords:true` without creating another batch row or raw R2 object.

### Signed route / abuse-resistance hardening

The actual evidence request path was extracted into `src/evidence-route.ts` and `worker-v7` delegates to it while preserving prior Worker behavior.

The route now enforces:

- canonical lowercase RFC-4122 v4 Brick device ID;
- requester-attempt rate limit first;
- non-revoked paired device;
- exact content type and body limits;
- P-256 signature over exact evidence bytes;
- device-scoped rate limit only after successful signature proof;
- strict BREV validation;
- durable persistence before success ACK.

This prevents unsigned traffic from consuming the actual child's device-scoped evidence rate bucket merely by knowing a device ID.

### Android paired-identity hardening

Android `EvidenceDispatcher` now journals/drains evidence only when stored pairing identity:

- parses as UUID;
- is canonical lowercase text;
- is RFC-4122 version 4 / variant 2;
- has a nonblank Brick API base.

The pairing guard instrumentation source now rejects path-like corrupt IDs and canonical-looking non-v4 UUIDs in addition to the original unpaired/API-base cases.

### Executed local verification

Cloud protocol/persistence/concurrency harness executed locally and passed:

- fixed BREV golden vector;
- strict protocol rejection cases;
- D1/R2-style persistence and exact ACK;
- exact-batch retry without storage rewrite;
- same-record/new-batch replay without storage growth;
- record/batch collision rejection;
- provider-health epoch/sequence ordering under wall-clock regression;
- content-addressed raw object and hashed device metadata;
- Android epoch-bound rejection;
- simulated competing batch-ID claim between preflight and D1 batch; loser rolls back with zero record/link contamination.

Observed:

`LOCAL_CURRENT_PHASE2_CLOUD_RACE_HARNESS_PASS`

The actual signed-route logic also executed locally using a real generated Web Crypto P-256 keypair and passed:

- missing/bad signature rejection;
- requester bucket only for unauthenticated attempts;
- valid signature then authenticated device bucket;
- persistence-before-ACK;
- exact retry and fresh-batch record replay behavior;
- requester/device rate-limit ordering;
- revoked-device rejection;
- signed malformed-protocol rejection;
- canonical-v4/path decoding guards.

Observed:

`LOCAL_CURRENT_PHASE2_SIGNED_ROUTE_PASS`

The pure Kotlin Android evidence model/protocol remains locally verified for shared golden bytes and protocol validation only. This environment has no Android SDK, so full Android framework behavior is not claimed.

### CI gates strengthened

Phase 2 CI now explicitly checks or executes:

- hard D1 batch-ID claim;
- no `INSERT OR IGNORE` for batch identity;
- content-addressed raw key;
- record-replay no-storage path;
- requester/authenticated-device split rate buckets;
- canonical v4 route boundary;
- signed HTTP route integration harness;
- Android canonical v4/variant-2 pairing guard;
- dedicated network-constrained evidence worker architecture;
- original live V2 / 90-byte location packet preserved;
- retained Phase 6 regressions;
- Android dependency lock, build, lint and emulator instrumentation when runners work.

### Hosted CI blocker remains external

Latest checked run:

- run `41212250461`
- Cloud head `a5c2d375d3e08c35d3674e8405663bf1483d2f4c`

Observed:

- Android compile/lint/dependency-lock: failure, `runner_id: 0`, `steps: []`;
- Cloud protocol/persistence/regression: failure, `runner_id: 0`, `steps: []`;
- Android instrumentation: skipped.

No hosted source step executed. This remains a runner/infrastructure failure, not a source pass and not evidence of source failure.

### Current Phase 2 result

**SOURCE IMPLEMENTED + HARDENED / CLOUD CORE + REAL SIGNED ROUTE + CROSS-LANGUAGE PROTOCOL LOCALLY VERIFIED / HOSTED CI BLOCKED / NOT ACCEPTED.**

PR #6 and PR #7 remain draft/unmerged deliberately.

Detailed truth is recorded in `PHASE2_REPORT.md`, `PHASE2_LOCAL_VERIFICATION.md`, `AUDIT_STATUS.md` and `PROJECT_MEMORY.md`.

### Next required action

When GitHub Actions assigns a runner, execute the final paired Phase 2 heads and require Cloud integration/regression, Android dependency-lock/compile/lint, and Android emulator instrumentation to pass. Repair real failures rather than weakening gates. Only then merge the paired PRs, rerun canonical checks, verify the live Cloudflare evidence deployment, and consider Phase 2 acceptance.

---

## 2026-10-31 — Brick V1 Phase 2: evidence/data foundation implementation

### User request

Start Phase 2 immediately, then continue from the existing Phase 2 branches without restarting or losing prior work.

### Implementation completed in staging source

Android branch `v1-p2-evidence-android` / PR #7 now contains the Phase 2 Android foundation:

- canonical `EvidenceObservation`, `EvidenceRecord` and exact `EvidenceAck` model;
- stable provider/family/capability/health/quality enums;
- mandatory independence groups for later anti-double-counting;
- provider lifecycle interface and adaptive sampling coordinator;
- separate encrypted `brick_evidence.db` journal using Android-Keystore AES-GCM;
- pending/delivered/quarantined evidence states;
- strict epoch/sequence/record-ID identity;
- exact local ACK semantics;
- lower-priority dispatcher that refuses to drain evidence while SOS/safety, durable live-location or crash backlog exists;
- signed HTTPS evidence transport with exact server ACK-set verification;
- WorkManager best-effort evidence retry after core tracking recovery;
- evidence-journal health telemetry;
- test-only dummy evidence provider and Android instrumentation suite.

Current Android Phase 2 staging head after source-review fixes:

`62401f69608bec2dcf13b3d897a783180b9a0e56`

Cloud branch `v1-p2-evidence-cloud` / PR #6 now contains:

- strict TypeScript Evidence Batch v1 decoder;
- signed `/api/device/{id}/evidence` endpoint in `worker-v7` while delegating all old runtime behavior to the Phase 6 worker;
- idempotent D1/R2 evidence persistence;
- exact batch/record collision detection;
- `schema/008_v1_phase2_evidence.sql` with evidence tables and empty later-phase foundations for Atlas/witness/receiver/command/refined-history metadata;
- Phase 2 setup wrapper;
- cloud protocol/idempotency integration test source.

Current Cloud Phase 2 staging head after the shared golden-vector test:

`a1c6bb1df3a47644ab59893de55da9e71bfe1d47`

### Protocol decision

The existing 90-byte live location V2 packet is preserved. Phase 2 adds a separate bounded binary Evidence Batch v1 protocol instead of bloating the live tracking path.

Evidence Batch v1 uses:

- magic `BREV`;
- version 1;
- batch UUID;
- maximum 24 records;
- maximum 2,048-byte provider payload per record;
- maximum 64-byte independence group;
- maximum 65,536-byte batch;
- strict epoch/sequence ordering;
- unique record UUIDs;
- exact ACK identity `(epoch, sequence, recordId)`.

A fixed shared Android/TypeScript golden vector was added to catch byte-level protocol drift across languages.

### Reliability / privacy improvements made during review

- Evidence is lower priority than safety, live-location backlog and crash reports and rechecks this condition before every evidence batch.
- Setup no longer intentionally activates `worker-v7` before schema 008 exists. The wrapper bootstraps the proven worker, applies schema 008 and raw-evidence retention first, then activates `worker-v7`.
- Raw `evidence/raw/` R2 objects receive a 30-day lifecycle rule in Phase 2 setup source.
- Android golden-vector test initially used data-class equality on a `ByteArray`, which would falsely fail because Kotlin arrays compare by identity. This was caught in source review and repaired to compare scalar fields plus payload `contentEquals`.

### CI evidence and blocker

Phase 2 CI is defined to run:

- Cloud typecheck and evidence integration tests;
- critical retained Phase 6 regression tests;
- Android dependency-lock verification, compile, debug build and lint;
- Android instrumentation compilation;
- Android emulator instrumentation tests.

However GitHub Actions currently fails before assigning a runner. Repeated Phase 2 attempts show:

- `runner_id: 0`;
- no runner name;
- `steps: []` for both Android and Cloud jobs;
- instrumentation skipped because Android build never starts.

Latest explicitly checked run after the current cloud protocol test commit:

`41208244208`

This is an infrastructure/no-runner failure, **not** a source test failure. It is also **not** a pass. No CI or integration verification is claimed.

### Current Phase 2 state

**SOURCE IMPLEMENTED / CI EXECUTION BLOCKED / NOT ACCEPTED.**

Neither PR #6 nor PR #7 has been merged into the canonical runtime branches. This is deliberate: Phase 2's exit gate requires executed proof rather than source existence.

Detailed implementation and continuation evidence is in `PHASE2_REPORT.md`.

### Required continuation

When GitHub Actions can actually assign a runner:

1. run/re-run the current Phase 2 workflow;
2. require Cloud and Android jobs to execute real steps and pass;
3. require Android emulator instrumentation to pass;
4. repair any actual failures rather than bypassing the gate;
5. only then merge PR #7 into `apk-download` and PR #6 into `main` with expected-head protection;
6. update audit/memory status and only then mark Phase 2 accepted.

---

## 2026-10-31 — New Brick V1 Phase 1: contract, baseline and architecture freeze

### User request

Start Phase 1 of the newly agreed nine-phase Brick V1 program. Do not build the new runtime features yet; make the plan detailed and reliable enough that later work does not hallucinate completion or miss requirements from `Yes.docx`.

### Source/implementation evidence reviewed

- Read the current `Yes.docx` project contract (version 1, 122 pages) and indexed all numbered headings.
- Confirmed the contract contains sections 1–83 plus the 23A–23O expansion and contains **two separate sections numbered 23G**.
- Read the detailed positioning/evidence/Atlas/Shizuku/history/reliability/acceptance portions needed to build a granular requirement map.
- Read current `PROJECT_MEMORY.md`, `PROGRESS.md`, `AUDIT_STATUS.md` and retained audit state.
- Re-checked current GitHub branch heads:
  - `main`: `9ae0f2b72b63d3dfd0bc7807adfbd2928dcd2059`
  - `apk-download`: `c99fe4ce7f74b14ba23d280739ed150a327b8520`
  - pre-Phase-1 `audit-progress`: `da2d56f6d46eeb293d5ef5010304730dd45378d1`
- Recorded current runtime trees:
  - `main`: `33cdcddcfab9cd3e0325b2cd9312511b65c5b7f3`
  - `apk-download`: `034d0cdfe494f3f74ddfa5d44e1d1e974fd92f42`
- Re-checked Android build identity from `app/build.gradle.kts`: package `com.brick.safety`, version `0.6.0-phase6-rc`, versionCode `6`, minSdk 29, targetSdk 35, compileSdk 36.
- Re-checked representative current Android positioning/managed/reliability/API code and current Cloudflare protocol/route-map/runtime source before assigning baseline statuses.

### Changes completed

Created temporary documentation branch `v1-p1-contract` from `audit-progress` and added:

- `PHASE1_BASELINE.md`
- `V1_ARCHITECTURE_FREEZE.md`
- `V1_PHASES.md`
- `V1_REQUIREMENTS.md`
- `PHASE1_SOURCE_COVERAGE.md`
- `PHASE1_REPORT.md`

Updated `PROJECT_MEMORY.md` with:

- `Yes.docx` as the new expanded V1 contract;
- fixed nine-phase program;
- Phase 1 accepted state;
- requirement-led implementation rule;
- architecture-freeze rule;
- new Evidence/Atlas/Witness/Shizuku architecture decisions;
- exact Phase 1 baseline heads/trees;
- unchanged release-candidate truth.

### Requirement/coverage result

- Every source section from 1 through 83 has an explicit mapping in `PHASE1_SOURCE_COVERAGE.md`.
- 23A–23O are decomposed into stable requirement groups rather than being represented by one vague feature checkbox.
- The duplicate document numbering is normalized as `23G-UI` and `23G-GROUND` without changing the source contract.
- The final §83 V1 feature set is cross-checked against requirement IDs.
- Explicit V1 non-goals are recorded so later phases do not reintroduce excluded features.
- Each implementation requirement records a conservative baseline state, owner phase and expected acceptance evidence.

### Architecture decisions frozen

- Fused Location remains the primary normal position source.
- New sources feed a central Evidence/particle hypothesis engine rather than independently declaring exact truth.
- Correlated evidence uses independence groups and cannot be double-counted.
- Atlas learns only from trusted labelled positions and automatically decays/relearns changed signals.
- Raw observations, realtime estimates and future refined estimates remain separate.
- Witness/Ground identifiers rotate cryptographically; no public crowdsourced tracker; RSSI is not exact distance.
- Device Owner remains primary management; Shizuku is optional enhancement only and no arbitrary remote shell endpoint is allowed.
- Parent Location control is desired-vs-actual and must be confirmed by the phone.
- Persist-before-send, exact ACK, idempotency and safety-priority durability remain non-negotiable.
- Child UI remains minimal; parent UI must distinguish device health from position quality and show honest uncertainty geometry.

### Result

**Phase 1 accepted.** It is a documentation/contract freeze only. No Android/Cloudflare runtime feature code was changed and Brick remains `candidate-not-real-device-qualified`.

Phase 2 may begin from `V1_REQUIREMENTS.md` and `V1_ARCHITECTURE_FREEZE.md` rather than rediscovering or reinterpreting the contract.

### Housekeeping / blocker

The connected GitHub interface exposes branch creation/update but not branch-ref deletion. `v1-p1-contract` is therefore a temporary non-canonical documentation ref that should be removed after integration into `audit-progress` when a supported ref-deletion/cleanup path is available. This does not block the Phase 1 technical/contract exit gate.

---

## 2026-10-31 — Persist complete current Brick state into project memory

### User request

Remember everything needed in project memory so future Brick work can continue without rediscovery or repeating context.

### Changes completed

- Expanded `PROJECT_MEMORY.md` with a standing **resume from project memory** rule.
- Recorded both active and archive repository roles.
- Recorded that `Brickfamilyplanning-archive` currently contains all 19 historical branch names plus `ARCHIVE_MANIFEST.md`, but the branch refs are placeholders and do not yet contain original branch contents.
- Recorded the exact migration blocker: private Git objects cannot be reused across repos; export workflow run `41201328643` failed twice before runner assignment with zero executed steps and produced no artifact.
- Recorded the temporary export workflow path `.github/workflows/archive-historical-branches.yml` and the temporary `main` head `9ae0f2b72b63d3dfd0bc7807adfbd2928dcd2059`.
- Recorded the exact ordered resume procedure: obtain real snapshots/checksums, persist them to archive, verify against manifest, only then delete source refs, verify only three canonical branches remain, and remove the temporary export workflow.
- Recorded proven APK/build hashes, release truth, production blockers and the archived PR #5 state.

### Result

Future Brick work should begin by reading `PROJECT_MEMORY.md` and `PROGRESS.md`. The archive cleanup should resume from the existing workflow/manifest state instead of rediscovering branches or assuming migration/deletion already happened.

---

## 2026-10-31 — Move historical branches to Brickfamilyplanning-archive

### User request

Move every non-canonical historical branch out of `hellonenermy1/Brickfamilyplanning` into `hellonenermy1/Brickfamilyplanning-archive`, then delete the historical refs from the active repository. Keep only `main`, `apk-download`, and `audit-progress` active.

### Safe archive work completed

- Initialized `hellonenermy1/Brickfamilyplanning-archive`.
- Added `ARCHIVE_MANIFEST.md` recording all 19 historical branch names and their exact original source head SHAs.
- Created all 19 matching historical branch names in the archive repository:
  - `phase1-child-apk`
  - `phase1-cloudflare-setup`
  - `phase2-child-reliability`
  - `phase2-cloudflare-reliability`
  - `phase3-child-position-intelligence`
  - `phase3-cloudflare-position-intelligence`
  - `phase4-child-safety-history`
  - `phase4-cloudflare-safety-history`
  - `phase5-child-health-ops`
  - `phase5-cloudflare-parent-ops`
  - `phase5b-no-r2`
  - `phase5b-private-map-places`
  - `phase5c-child-hardening`
  - `phase5c-hardening-audit`
  - `phase6-child-final-audit`
  - `phase6-cloud-final-audit`
  - `phase6-cloud-final-audit-v2`
  - `phase6-final-hardening`
  - `phase6-integration`
- Added a source-repo workflow, `Brick — Export Historical Branches`, designed to produce an exact `git archive` tar.gz snapshot plus SHA-256 checksum for every historical branch before deletion.

### Evidence / current blocker

- GitHub does not permit direct reuse of private Git commit/tree objects across the two repositories; attempting to create an archive branch from the original source commit returned `Object does not exist`.
- The exact-export workflow was triggered automatically and then retried once.
- Both attempts failed before GitHub assigned a runner: the jobs contained zero executed steps. No archive tarball artifact was produced.
- The connected GitHub tool does not expose Git ref deletion directly.

### Safety decision

Historical source branches were **not deleted** because an exact recoverable snapshot has not yet been produced in the archive repository. Deleting them now would risk losing unique historical content and would violate Brick's no-fake-proof rule.

The archive repository currently has the 19 branch names and authoritative original-head manifest, but not yet the exact branch-content tarballs. This distinction must remain explicit.

### Next required completion step

When GitHub Actions assigns a runner again, rerun `Brick — Export Historical Branches`, copy the resulting checked tar.gz snapshots into `Brickfamilyplanning-archive`, verify checksums/head manifest, then delete the 19 historical source refs. Do not delete before that verification.

---

## 2026-10-31 — Repository cleanup and permanent progress logging

### User request

Clean the GitHub repository into three clear areas:

1. `main` for the Cloudflare one-click **Run workflow** setup.
2. `apk-download` for Android APK source/download builds.
3. `audit-progress` for audits and project progress.

Also make automatic Brick progress logging a standing project rule so Jayvian does not need to ask each time.

### Changes completed

- Created canonical branch `apk-download` from the proven Phase 6 source tree.
- Rebuilt `apk-download` as an Android-only branch containing `app/`, root Gradle files and `.gitignore`.
- Created canonical branch `audit-progress` from the proven Phase 6 source tree.
- Rebuilt `audit-progress` as a documentation-only branch.
- Moved default branch `main` from the older Phase 5B/cardless state onto the Phase 6 source line.
- Rebuilt `main` as a Cloudflare/runtime branch containing backend source, schemas, setup scripts, private-map web assets and manual GitHub Actions dispatchers.
- Kept a small `Brick — Build / Download APK` workflow on `main` because GitHub manual `workflow_dispatch` entries must be available from the default branch; that workflow always checks out `apk-download`.
- Made the APK dispatcher robust to detached checkout state by relying on the hard-pinned `apk-download` ref and source SHA instead of `git branch --show-current`.
- Added the standing rule that every future Brick task is logged here automatically.
- Added `PROJECT_MEMORY.md` and `AUDIT_STATUS.md` as durable project records.
- Rewrote the READMEs on all three canonical branches so their roles are explicit.
- Archived and closed PR #5 so the old hardening PR cannot be mistaken for the current deployment path.

### Final canonical heads after cleanup

- `main`: `710fdbf6494a5f947c56d8e4a8fcd911a00e8aad`
- `apk-download`: `c99fe4ce7f74b14ba23d280739ed150a327b8520`
- `audit-progress`: this progress-finalization commit and later documentation-only updates.

### Final branch contents

`main` contains only:

- Cloudflare/runtime source and web assets,
- D1 schema and setup/verification scripts,
- locked Node dependencies/config,
- `Deploy Brick Phase 6 Candidate`,
- `Brick — Build / Download APK` dispatcher.

`apk-download` contains only:

- Android `app/` source,
- root Gradle configuration,
- Android-focused README and `.gitignore`.

`audit-progress` contains only:

- `README.md`,
- `PROJECT_MEMORY.md`,
- `PROGRESS.md`,
- `AUDIT_STATUS.md`,
- retained `PHASE5C_AUDIT.md` historical audit.

### Evidence / verification

- The pre-cleanup Phase 6 source head `b23741d31ec6c51a5b00b6fe15b753b0d70d04c8` had Git tree `b5f4ea6e97e9e2afef7a01c8386829f316b4af2e`, identical to fully validated commit `176d94f604eb562a59260ef380ee680a564acfcc`.
- Before the branch split, GitHub compare reported zero file differences between those two source states.
- `main` now points to an organization commit derived from the proven Phase 6 Cloudflare/runtime blobs rather than the old Phase 5B/cardless main branch.
- `apk-download` retains the exact Android source tree from the proven baseline; only its branch README changed after separation.
- `audit-progress` is documentation-only and no longer contains runtime source.
- Main workflow inventory was reduced to exactly two manual workflows: Cloudflare deployment and APK build/download.
- PR #5 is closed as `[ARCHIVED] Phase 6 final hardening — superseded by canonical branch split`.

### Limitations / blockers

- The connected GitHub tooling used in this session does not expose branch-ref deletion, so historical `phase*` branches could not be removed programmatically. They are historical only and are no longer canonical.
- The new branch-organization commits have not themselves been through a fresh full CI/deployment run. The runtime/source blobs came from the proven tree, but the new APK dispatcher and branch layout still need their next real GitHub Actions execution.
- Stable Android production signing remains unconfigured.
- Live Phase 6 Cloudflare deployment evidence and physical OPPO qualification remain outstanding.

### Next actions

- Use `main` → Actions → **Deploy Brick Phase 6 Candidate** for the next live Phase 6 Cloudflare deployment.
- Use `main` → Actions → **Brick — Build / Download APK** for the next downloadable APK build; it builds from `apk-download`.
- Continue appending all Brick work to this file automatically.

---

## 2026-10-31 — Phase 6 hardening / release-candidate audit

### Work completed

- Hardened Cloudflare same-origin WebSocket checks, pairing throttling, bounded request bodies, Access verification and deployment verification.
- Hardened Android fused-location failure containment, pairing-origin binding, backup/device-transfer exclusion rules and recovery checks.
- Added exact Gradle dependency locking and APK provenance/inspection evidence.
- Added fresh-target D1 restore tooling/tests and DLQ durability checks.
- Tightened live deployment verifier to reject accidental 404s as false Access success, verify `/healthz`, verify D1 privacy/replay schema and read back R2 lifecycle rules.

### Proven CI state

On source commit `176d94f604eb562a59260ef380ee680a564acfcc`, all eight normal Phase 6 workflows completed successfully:

- Source inventory
- Android runtime wiring
- Android recovery hardening
- Cloudflare Phase 6 validation
- Security hardening
- Operations/durability
- Android dependency-lock generation
- Android debug + release build, lint, APK inspection and provenance

### APK result

- Debug APK built and was validly debug-signed.
- Release variant built but stable production signing secrets were not configured, so the release artifact was unsigned.
- Stable-signed release artifact was skipped rather than falsely claimed.

### Open production blockers

- Stable Android signing.
- Actual Phase 6 Cloudflare deployment + retained verifier evidence.
- Authenticated parent-browser smoke test.
- Real OPPO/ColorOS qualification and endurance testing.