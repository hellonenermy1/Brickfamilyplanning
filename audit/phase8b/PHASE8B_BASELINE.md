# Brick V1 — Phase 8B Implementation Reality Baseline

Status: **IN PROGRESS**

Audit date: 2026-11-03

## Contract baseline

Phase 8B consumes the frozen Phase 8A contract at:

- audit branch: `v1-p8a-contract-audit`
- Phase 8A closure commit: `0ddf2e1e8efbbcb838911ae1acb07b43ccb37579`
- current unique requirements: **525**
- mandatory: 485
- forbidden: 24
- optional-if-supported: 14
- future-interface: 2

Phase 8B must not silently redefine the contract to match implementation.

## Implementation baselines

The repository does not currently have one single branch containing the newest Android and cloud implementation. `main` is older, so grading `main` would be stale.

### Android

Branch: `v1-p8-android-hardening`

Exact head: `3de76dc2996b9a38050365d2217da2e4597f8fde`

This is the Android source/config/test baseline for 8B unless a later implementation commit is explicitly adopted.

### Cloud / parent portal

Branch: `v1-p8-cloud-hardening`

Exact head: `b06a766f6906bdb9ea954267fb7f2d9c73d0910c`

This is the Worker/D1/R2/Queue/Durable Object/parent-portal source/config/test baseline for 8B unless a later implementation commit is explicitly adopted.

### Audit records

Branch: `v1-p8b-implementation-audit`

The audit branch starts from Phase 8A closure. It stores audit evidence only; implementation does not receive credit merely because an audit file exists here.

## Important branch truth

`main` is not treated as the implementation candidate because it predates both current hardening heads.

Phase 8B therefore uses a **split implementation identity**. This is acceptable for source audit, but a final production release cannot remain split: Phase 9 must pin one matching APK/backend/portal/schema/protocol release identity.

## Evidence rules

A requirement is never IMPLEMENTED merely because:

- a class/file exists;
- a route exists;
- a UI card exists;
- a SQL table exists;
- a test stub exists;
- a comment/TODO says it exists;
- CI is green.

For implementation credit, Phase 8B looks for the real path, as applicable:

`trigger -> code path -> durable/local state -> protocol -> backend -> storage/current state -> portal/history/audit`

and proves the path is reachable from production configuration.

## Allowed 8B classifications

- `IMPLEMENTED`
- `IMPLEMENTED — UNVERIFIED`
- `PARTIAL`
- `MISSING`
- `BROKEN`
- `UNREACHABLE`
- `VERIFIED UNSUPPORTED` only where the Phase 8A contract permits it
- `INTENTIONALLY REMOVED — VERIFIED` where explicitly approved

No `UNKNOWN` is allowed at Phase 8B closure.

## CI evidence already observed

The exact Android head has successful GitHub Actions including the Phase 7 -> Phase 8 same-certificate upgrade-continuity workflow. This proves specific upgrade/identity/backlog properties exercised by that workflow, but does not prove unrelated current V1 requirements.

The exact cloud head also has successful Phase 8 Cloud Hardening CI at the current commit.

Green CI is supporting evidence, never blanket implementation credit.
