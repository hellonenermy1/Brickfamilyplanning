# Brick Audit Status

Last updated: 2026-10-31

## Current acceptance state

Brick remains a **release candidate**, not production-qualified.

- Version: `0.6.0-phase6-rc`
- Version code: `6`
- Package: `com.brick.safety`
- Qualification state: `candidate-not-real-device-qualified`
- New nine-phase V1 program: **Phase 1 ACCEPTED; Phases 2–9 not yet accepted**

Phase 1 is a documentation/contract freeze only. It does not claim the expanded `Yes.docx` V1 feature set is implemented.

## New V1 contract truth

The current Brick V1 contract is the expanded project `Yes.docx` version 1.

The permanent Phase 1 audit artifacts are:

- `PHASE1_BASELINE.md`
- `V1_ARCHITECTURE_FREEZE.md`
- `V1_PHASES.md`
- `V1_REQUIREMENTS.md`
- `PHASE1_SOURCE_COVERAGE.md`
- `PHASE1_REPORT.md`

The contract includes the original Phase 6-era reliability/safety/history architecture plus the new Parallel Evidence Engine, learned odometry/particle positioning, Environmental Fingerprint Atlas, Signal Trust/Uniqueness Engine, Witness Mesh, fixed Ground Network, learned places/routes, future ranging interface, parent Location desired-state control and optional Shizuku enhancement.

The duplicate source numbering for the two `23G` sections is normalized in the Phase 1 ledger as `23G-UI` and `23G-GROUND`.

## Proven source baseline carried into the new program

The fully validated Phase 6 source commit was:

`176d94f604eb562a59260ef380ee680a564acfcc`

Git tree:

`b5f4ea6e97e9e2afef7a01c8386829f316b4af2e`

The later pre-cleanup hardening head:

`b23741d31ec6c51a5b00b6fe15b753b0d70d04c8`

had the exact same Git tree. GitHub compare showed zero file differences.

Phase 1 start heads were recorded as:

- `main`: `9ae0f2b72b63d3dfd0bc7807adfbd2928dcd2059`
- `apk-download`: `c99fe4ce7f74b14ba23d280739ed150a327b8520`
- `audit-progress`: `da2d56f6d46eeb293d5ef5010304730dd45378d1` before Phase 1 documentation integration

Runtime trees observed at Phase 1 start:

- `main`: `33cdcddcfab9cd3e0325b2cd9312511b65c5b7f3`
- `apk-download`: `034d0cdfe494f3f74ddfa5d44e1d1e974fd92f42`

## Proven CI evidence on the retained Phase 6 tree

All eight normal Phase 6 workflows completed successfully:

1. Source inventory
2. Android runtime wiring
3. Android recovery hardening
4. Cloudflare Phase 6 validation
5. Security hardening
6. Operations/durability checks
7. Exact Android dependency-lock generation
8. Android debug + release build, lint, APK inspection and provenance

The committed Android Gradle lock matched fresh dependency resolution.

These checks remain useful baseline evidence but do **not** prove the new V1 requirements added after Phase 6.

## APK evidence

- Debug APK: built successfully and validly signed with the Android debug certificate.
- Release variant: built successfully.
- Stable production signing: **not configured** at the time of the proven build.
- Stable-signed release upload: skipped.
- Therefore the unsigned release candidate must not be presented as a production APK.

## Cloud deployment evidence

The hardened Phase 6 one-click workflow is prepared on `main` and verifies:

- exact source SHA,
- D1/R2/Queues/DLQ resource state,
- Cloudflare Access configuration,
- required D1 tables and privacy/replay schema,
- R2 lifecycle retention rules,
- public `/healthz`,
- unauthenticated parent-route denial,
- invalid pairing fail-closed behavior,
- unsigned fake-device fail-closed behavior,
- optional private Singapore map installation.

**No new live Phase 6/new-V1 deployment is claimed in this record yet.** A successful future workflow run must produce and retain deployment evidence before that blocker is closed.

## Current repository organization

- `main` — canonical Cloudflare/runtime branch and manual Run workflow dispatchers.
- `apk-download` — Android-only source branch for APK builds.
- `audit-progress` — documentation-only audit/progress/project-memory branch.
- `v1-p1-contract` — temporary documentation staging branch created for new V1 Phase 1; non-canonical and should be removed after integration when ref deletion is available.

The branch separation reused proven Phase 6 source blobs, but the organizational commits and new APK dispatcher have not yet had a fresh real Actions execution after the cleanup.

## New V1 phase acceptance

### Phase 1 — Contract, Baseline & Architecture Freeze

**ACCEPTED**

Evidence:

- exact baseline heads/trees frozen;
- nine-phase program frozen;
- architecture/invariants frozen;
- every numbered `Yes.docx` section mapped to stable requirement IDs;
- final §83 feature list cross-checked;
- V1 non-goals captured;
- each implementation requirement assigned an owner phase and acceptance evidence;
- no Android/backend runtime feature was changed in Phase 1.

### Phase 2 — Evidence Platform, Protocol & Durable Data Foundation

**NOT STARTED**

### Phase 3 — Motion Intelligence, Learned Odometry & Particle Positioning

**NOT STARTED**

### Phase 4 — Environmental Fingerprint Atlas & Signal Trust Engine

**NOT STARTED**

### Phase 5 — Unified Fusion, Learned Places, Routes, Witness Mesh & Ground Network

**NOT STARTED**

### Phase 6 — Device Owner, Parent Location Control & Optional Shizuku Enhancement

**NOT STARTED**

### Phase 7 — Cloud Intelligence, History, Parent Dashboard & Child UX Integration

**NOT STARTED**

### Phase 8 — Reliability, Security, Privacy & Operational Hardening

**NOT STARTED**

### Phase 9 — Real OPPO Qualification, Production Release & Acceptance

**NOT STARTED**

## Production blockers

### Blocker 1 — New V1 implementation is incomplete

The current candidate does not yet implement the major Phase 2–6 additions from the expanded `Yes.docx` contract. See `V1_REQUIREMENTS.md` for conservative per-requirement state.

### Blocker 2 — Stable Android signing

Required GitHub secrets:

- `BRICK_ANDROID_KEYSTORE_B64`
- `BRICK_ANDROID_KEYSTORE_PASSWORD`
- `BRICK_ANDROID_KEY_ALIAS`
- `BRICK_ANDROID_KEY_PASSWORD`

A final production Device Owner qualification should use the stable-signed APK, not a disposable debug certificate.

### Blocker 3 — Final live Cloudflare deployment

Run the canonical deployment workflow from `main` for the exact final V1 source and retain its generated deployment-verification artifact.

### Blocker 4 — Authenticated browser smoke test

The parent dashboard must be tested while genuinely authenticated through Cloudflare Access. Public denial checks alone do not prove the full parent UI/session path.

### Blocker 5 — Physical OPPO/ColorOS qualification

The final V1 contract requires real Reno10 Pro / Reno14 Pro ColorOS testing, including the original reliability suite plus Atlas/particle/Witness/Ground/Shizuku/Location-control capability tests defined in `V1_REQUIREMENTS.md`.

### Blocker 6 — Zero-manual-intervention proof

After every recoverable failure in the acceptance suite, Brick must recover without reopening the app, manually restarting tracking, clearing storage or rebooting the phone.

### Blocker 7 — Measured resource behavior

Battery/storage/network/CPU/memory/wakeup/scan cadence and cloud usage must be measured under normal and degraded modes, including 24h/72h Atlas tests and multi-day offline backlog.

## Audit principle

A green source/build check is not the same thing as implementation completeness, live deployment, browser integration, hardware capability, or physical reliability qualification. Each acceptance layer stays open until its own evidence exists.
