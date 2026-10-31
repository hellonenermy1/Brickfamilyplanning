# Brick Progress Log

This file is append-only in spirit: add new entries at the top or bottom, but do not rewrite history to make results look better. Corrections should be explicit.

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
