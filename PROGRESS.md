# Brick Progress Log

This file is append-only in spirit: add new entries at the top or bottom, but do not rewrite history to make results look better. Corrections should be explicit.

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
