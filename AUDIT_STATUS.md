# Brick Audit Status

Last updated: 2026-10-31

## Current acceptance state

Brick remains a **release candidate**, not production-qualified.

- Version: `0.6.0-phase6-rc`
- Version code: `6`
- Package: `com.brick.safety`
- Qualification state: `candidate-not-real-device-qualified`
- New nine-phase V1 program: **Phase 1 ACCEPTED; Phase 2 SOURCE IMPLEMENTED / CI BLOCKED / NOT ACCEPTED; Phases 3–9 not yet accepted**

Phase 1 is a documentation/contract freeze. Phase 2 source now exists on staging branches, but no Phase 2 CI/integration pass is claimed because GitHub Actions has repeatedly failed before assigning a runner.

## New V1 contract truth

The current Brick V1 contract is the expanded project `Yes.docx` version 1.

The permanent Phase 1 audit artifacts are:

- `PHASE1_BASELINE.md`
- `V1_ARCHITECTURE_FREEZE.md`
- `V1_PHASES.md`
- `V1_REQUIREMENTS.md`
- `PHASE1_SOURCE_COVERAGE.md`
- `PHASE1_REPORT.md`

Current Phase 2 implementation/verification record:

- `PHASE2_REPORT.md`

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

- Debug APK: built successfully and validly signed with the Android debug certificate on the retained Phase 6 source.
- Release variant: built successfully on that retained source.
- Stable production signing: **not configured** at the time of the proven build.
- Stable-signed release upload: skipped.
- Therefore the unsigned release candidate must not be presented as a production APK.
- No current Phase 2 Android build pass is claimed until the Phase 2 Actions job actually runs.

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

Canonical branches:

- `main` — canonical Cloudflare/runtime branch and manual Run workflow dispatchers.
- `apk-download` — Android-only source branch for APK builds.
- `audit-progress` — documentation-only audit/progress/project-memory branch.

Temporary/non-canonical work branches currently include:

- `v1-p1-contract` — Phase 1 documentation staging ref already integrated into `audit-progress`;
- `v1-p2-evidence-cloud` — Phase 2 Cloud source staging branch, PR #6;
- `v1-p2-evidence-android` — Phase 2 Android source staging branch, PR #7.

The Phase 2 branches are intentionally not promoted into canonical runtime branches until executed verification exists.

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

**SOURCE IMPLEMENTED — CI EXECUTION BLOCKED — NOT ACCEPTED**

Staged source includes:

- canonical evidence/provider/capability/health/quality model;
- mandatory independence groups;
- adaptive sampling coordinator;
- separate encrypted Android evidence journal;
- exact evidence ACK semantics;
- evidence priority below safety/live-location/crash backlog;
- separate bounded binary Evidence Batch v1 protocol;
- shared Android/TypeScript golden vector;
- signed evidence endpoint;
- D1/R2 idempotent persistence and collision detection;
- evidence/Atlas/witness/receiver/command/refined-history schema foundations without claiming later algorithms;
- Phase 2 setup that applies schema and raw-evidence retention before worker-v7 activation;
- Android dummy-provider/instrumentation test source;
- Cloud protocol/idempotency test source.

Current staging heads recorded in `PHASE2_REPORT.md`:

- Android: `62401f69608bec2dcf13b3d897a783180b9a0e56`
- Cloud: `a1c6bb1df3a47644ab59893de55da9e71bfe1d47`

Verification blocker:

GitHub Actions run `41208244208` and multiple earlier Phase 2 attempts failed before runner assignment. Android and Cloud jobs report `runner_id: 0` and `steps: []`; Android instrumentation is skipped as a dependency. This is not a source pass or source failure. It is insufficient evidence for `CI_VERIFIED` or acceptance.

PR #6 and PR #7 remain unmerged deliberately.

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

Phase 2 foundation source exists but is not yet accepted, and major Phase 3–6 additions from the expanded `Yes.docx` contract remain unimplemented. See `V1_REQUIREMENTS.md` and `PHASE2_REPORT.md`.

### Blocker 2 — Phase 2 CI runner execution

The current Phase 2 source must receive an actual GitHub Actions runner and pass Cloud + Android + instrumentation gates before its PRs are promoted or Phase 2 is accepted. Zero-step/no-runner workflow failures do not count either way.

### Blocker 3 — Stable Android signing

Required GitHub secrets:

- `BRICK_ANDROID_KEYSTORE_B64`
- `BRICK_ANDROID_KEYSTORE_PASSWORD`
- `BRICK_ANDROID_KEY_ALIAS`
- `BRICK_ANDROID_KEY_PASSWORD`

A final production Device Owner qualification should use the stable-signed APK, not a disposable debug certificate.

### Blocker 4 — Final live Cloudflare deployment

Run the canonical deployment workflow from `main` for the exact final V1 source and retain its generated deployment-verification artifact.

### Blocker 5 — Authenticated browser smoke test

The parent dashboard must be tested while genuinely authenticated through Cloudflare Access. Public denial checks alone do not prove the full parent UI/session path.

### Blocker 6 — Physical OPPO/ColorOS qualification

The final V1 contract requires real Reno10 Pro / Reno14 Pro ColorOS testing, including the original reliability suite plus Atlas/particle/Witness/Ground/Shizuku/Location-control capability tests defined in `V1_REQUIREMENTS.md`.

### Blocker 7 — Zero-manual-intervention proof

After every recoverable failure in the acceptance suite, Brick must recover without reopening the app, manually restarting tracking, clearing storage or rebooting the phone.

### Blocker 8 — Measured resource behavior

Battery/storage/network/CPU/memory/wakeup/scan cadence and cloud usage must be measured under normal and degraded modes, including 24h/72h Atlas tests and multi-day offline backlog.

## Audit principle

A green source/build check is not the same thing as implementation completeness, live deployment, browser integration, hardware capability, or physical reliability qualification. Likewise, a GitHub Actions job that never receives a runner and executes zero steps is not evidence of a source failure. Each acceptance layer stays open until its own evidence exists.
