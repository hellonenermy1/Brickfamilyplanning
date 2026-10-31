# Brick — Audit, Project Memory & Progress

This branch is the durable record for Brick.

It is intentionally documentation-only. Runtime code belongs on `main`; Android source belongs on `apk-download`.

## Current V1 program

The expanded project `Yes.docx` version 1 is the active Brick V1 contract.

Brick now follows the fixed nine-phase program in `V1_PHASES.md`.

Current state:

- Phase 1 — Contract, Baseline & Architecture Freeze: **ACCEPTED**
- Phases 2–9: not yet accepted
- Production state: **release candidate, not production-qualified**

## Phase 1 V1 files

- `PHASE1_BASELINE.md` — exact baseline heads/trees, release identity, current implementation foundation and known gaps.
- `V1_ARCHITECTURE_FREEZE.md` — frozen architecture boundaries and invariants that later phases must preserve.
- `V1_PHASES.md` — fixed nine-phase implementation and acceptance program.
- `V1_REQUIREMENTS.md` — granular requirement ledger with stable IDs, current conservative status, owner phase and acceptance evidence.
- `PHASE1_SOURCE_COVERAGE.md` — maps every numbered section of `Yes.docx` to requirement IDs and resolves the duplicate 23G numbering.
- `PHASE1_REPORT.md` — Phase 1 closure evidence and exit-gate result.

## Core audit files

- `PROJECT_MEMORY.md` — standing project rules, branch roles, release truth and decisions that must carry forward.
- `PROGRESS.md` — chronological log of Brick requests, work completed, evidence, blockers and next steps.
- `AUDIT_STATUS.md` — latest acceptance/audit snapshot and production blockers.
- `PHASE5C_AUDIT.md` — retained historical Phase 5C audit record.

## Standing logging rule

Every Brick task requested by Jayvian should be logged in `PROGRESS.md` as part of the task without requiring a separate reminder. Material decisions or permanent rules should also be reflected in `PROJECT_MEMORY.md`.

For new V1 implementation work, record the affected requirement IDs and highest verified evidence state. Code existence alone does not equal acceptance.

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

Temporary non-canonical branches must not become a second source of runtime truth.
