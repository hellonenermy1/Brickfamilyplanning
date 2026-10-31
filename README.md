# Brick — Audit, Project Memory & Progress

This branch is the durable record for Brick.

It is intentionally documentation-only. Runtime code belongs on `main`; Android source belongs on `apk-download`.

## Files

- `PROJECT_MEMORY.md` — standing project rules, branch roles, release truth and decisions that must carry forward.
- `PROGRESS.md` — chronological log of Brick requests, work completed, evidence, blockers and next steps.
- `AUDIT_STATUS.md` — latest acceptance/audit snapshot and production blockers.
- `PHASE5C_AUDIT.md` — retained historical Phase 5C audit record.

## Standing logging rule

Every Brick task requested by Jayvian should be logged in `PROGRESS.md` as part of the task without requiring a separate reminder. Material decisions or permanent rules should also be reflected in `PROJECT_MEMORY.md`.

Logs should distinguish clearly between:

- requested work,
- code/config changes actually made,
- checks/evidence actually completed,
- unresolved blockers,
- things not yet tested or deployed.

Do not claim a deployment, APK signature, device test or audit result without evidence.

## Canonical branches

- `main` — Cloudflare 1-click setup/deployment runtime.
- `apk-download` — Android app source used by the APK build/download workflow.
- `audit-progress` — this audit/progress/project-memory branch.
