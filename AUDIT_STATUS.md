# Brick Audit Status

Last updated: 2026-10-31

## Current acceptance state

Brick remains a **release candidate**, not production-qualified.

- Version: `0.6.0-phase6-rc`
- Version code: `6`
- Package: `com.brick.safety`
- Qualification: `candidate-not-real-device-qualified`
- V1 program: **Phase 1 ACCEPTED; Phase 2 SOURCE IMPLEMENTED + HARDENED / CLOUD CORE + SIGNED ROUTE + CROSS-LANGUAGE PROTOCOL LOCALLY VERIFIED, WITH FINAL RECORD-RACE + ANDROID-DER INVARIANTS TARGET-VERIFIED / HOSTED CI BLOCKED / NOT ACCEPTED; Phases 3–9 not accepted**

No Phase 2 source has been promoted to canonical `main` or `apk-download`.

## Contract / audit artifacts

Canonical V1 contract: project `Yes.docx` version 1.

Phase 1:

- `PHASE1_BASELINE.md`
- `V1_ARCHITECTURE_FREEZE.md`
- `V1_PHASES.md`
- `V1_REQUIREMENTS.md`
- `PHASE1_SOURCE_COVERAGE.md`
- `PHASE1_REPORT.md`

Phase 2:

- `PHASE2_REPORT.md`
- `PHASE2_LOCAL_VERIFICATION.md`

The duplicate source headings are normalized as `23G-UI` and `23G-GROUND`.

## Retained Phase 6 baseline

Fully validated source commit:

`176d94f604eb562a59260ef380ee680a564acfcc`

Git tree:

`b5f4ea6e97e9e2afef7a01c8386829f316b4af2e`

The later pre-cleanup hardening head `b23741d31ec6c51a5b00b6fe15b753b0d70d04c8` had the same tree. All eight normal Phase 6 CI workflows previously passed on that retained baseline. That proves the old candidate foundation, not the new Phase 2 additions.

## Repository organization

Canonical:

- `main` — Cloudflare/runtime
- `apk-download` — Android
- `audit-progress` — audit/progress/project memory

Phase 2 staging:

- `v1-p2-evidence-cloud` — PR #6, draft/unmerged
- `v1-p2-evidence-android` — PR #7, draft/unmerged

Current audit snapshot:

- Android: `389bc8744341aebcc42f74f79403fd2b3d5d5873`
- Cloud: `20a459f11f99195a0c56b3c1d82f2e7659976859`

These refs may advance while Phase 2 is repaired. Acceptance is tied to executed verification of the final paired heads, not to a stale SHA snapshot.

## Phase 1 — ACCEPTED

Phase 1 froze the baseline, nine-phase program, architecture invariants, requirement IDs, complete source coverage and non-goals. No runtime feature was added in Phase 1.

## Phase 2 — SOURCE IMPLEMENTED + HARDENED / NOT ACCEPTED

Implemented staging source includes:

- canonical evidence/provider/family/capability/health/quality model;
- mandatory independence groups;
- adaptive bounded sampling;
- separate encrypted Android evidence journal;
- DB-owned transactional evidence sequence allocation;
- exact local ACK semantics and corruption quarantine;
- canonical paired v4 device-ID boundary on Android and Cloud evidence path;
- safety/live-location/crash priority over evidence;
- dedicated network-constrained evidence worker using non-postponing initial work and bounded follow-up work;
- separate bounded binary BREV v1 protocol;
- canonical UUID / wire-safe integer rules and shared Android/TypeScript golden vector;
- actual signed evidence route isolated in `src/evidence-route.ts` and delegated from worker-v7;
- requester-attempt and authenticated-device rate-limit buckets separated so unsigned traffic cannot consume the child's device bucket;
- content-addressed raw R2 objects using hashed device identity plus exact batch hash;
- hard transactional D1 batch-ID claim to prevent concurrent batch-ID contamination;
- hard transactional claims for new evidence record identities, while exact records observed during preflight can be reused;
- record-level replay dedupe so already-durable records under a fresh transport batch UUID ACK without new durable storage;
- exact batch/record collision detection;
- provider-health ordering by epoch/sequence rather than wall clock;
- Android-compatible DER ECDSA route test source (`p1363ToDer` / `signLikeAndroid`) matching `SHA256withECDSA` output format;
- evidence and later-phase schema foundations without claiming later algorithms;
- schema/retention-before-worker-v7 setup ordering;
- Android instrumentation source for restart/ACK/priority/sequence/pairing behavior;
- Cloud protocol/persistence and signed HTTP route integration test source;
- CI gates locking batch and record hard claims, replay, identity, rate-limit and Android-DER signature-format invariants.

### Executed local evidence

Cloud protocol/persistence behavior passed the local TypeScript + SQLite/R2-style harness before the final record-claim refinement, covering golden bytes, persistence/ACK, exact retry, replay dedupe, collision rejection, provider-health ordering, content-addressed raw storage, epoch bounds and competing batch-ID rollback.

Observed:

`LOCAL_CURRENT_PHASE2_CLOUD_RACE_HARNESS_PASS`

The actual signed route logic also passed a local P-256 Web Crypto integration harness covering canonical-v4 route parsing, missing/bad/valid signatures, split rate buckets, persistence-before-ACK, retries/replay, revocation and signed malformed-protocol rejection.

Observed:

`LOCAL_CURRENT_PHASE2_SIGNED_ROUTE_PASS`

Final additional invariants were then target-executed locally:

- **record identity race:** competing `(device,epoch,sequence)` claim caused the losing hard record insert to hit the unique constraint and roll back its batch; losing batch rows `0`, only competitor record remained;
- **Android DER signature format:** 64-byte P1363 P-256 signature → DER (70 bytes observed) → Brick DER-to-P1363 conversion → verify `true`.

The current Android pure Kotlin evidence model/protocol also matched the shared golden bytes and safe-integer/canonical-UUID rules locally. This is not a full Android app/framework pass.

### Hosted CI blocker

Latest checked hosted run:

- run `41212933879`
- Cloud head `20a459f11f99195a0c56b3c1d82f2e7659976859`

Observed:

- Cloud protocol/persistence/regression: failure with `runner_id: 0`, empty runner name and `steps: []`;
- Android compile/lint/dependency-lock: failure with `runner_id: 0`, empty runner name and `steps: []`;
- Android instrumentation: skipped.

No runner executed source steps. This is **not a source pass and not evidence of source failure**. It does not satisfy `CI_VERIFIED`.

### Merge / acceptance rule

PR #6 and PR #7 remain draft/unmerged deliberately.

Phase 2 is accepted only after actual execution proves:

1. Cloud typecheck, protocol/persistence harness, signed-route harness and retained Phase 6 regressions pass on the final head;
2. Android dependency lock, full compile and lint pass;
3. Android emulator instrumentation passes;
4. dummy evidence persists across restart, transmits, receives exact ACK and is removed without starving safety/live-location work;
5. canonical post-merge checks pass;
6. live Cloudflare deployment verifies the evidence route/schema/retention before any live-integration claim.

## Phases 3–9

All remain **NOT ACCEPTED**. Phase 3 must not be treated as unlocked accepted work while the Phase 2 gate is open.

## Remaining production blockers

1. Close Phase 2 hosted/integration verification and complete later V1 phases.
2. Stable Android production signing.
3. Exact final live Cloudflare deployment with retained verifier evidence.
4. Authenticated parent-browser smoke test.
5. Physical Reno10/Reno14 ColorOS qualification.
6. Full endurance/failure suite including 72h and 7-day untouched tests.
7. Later Atlas/Witness/Ground/Shizuku/Location-control capability tests.
8. Zero-manual-intervention proof after recoverable failures.
9. Measured battery/storage/network/CPU/memory/wakeup/scan/cloud usage.
10. Final backup and restore drill.

## Audit principle

Source existence, local harnesses, targeted local invariant checks, hosted CI, deployed Cloudflare state, Android hardware behavior and production qualification are separate evidence layers. Brick advances only to the level directly supported by observed evidence.
