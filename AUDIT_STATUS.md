# Brick Audit Status

Last updated: 2026-10-31

## Current acceptance state

Brick remains a **release candidate**, not production-qualified.

- Version: `0.6.0-phase6-rc`
- Version code: `6`
- Package: `com.brick.safety`
- Qualification: `candidate-not-real-device-qualified`
- V1 program: **Phase 1 ACCEPTED; Phase 2 SOURCE IMPLEMENTED + FURTHER HARDENED / PRIOR LOCAL CLOUD-PROTOCOL-ROUTE EVIDENCE RETAINED / FINAL PAIRED HEAD EXECUTION BLOCKED / NOT ACCEPTED; Phases 3–9 not accepted**

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

Current exact paired checkpoint:

- Android: `4ec37a2021bcd575cfefeadd58c968675965a8e7`
- Cloud: `60697dc37cb325574e9bd22283e2b3dd1d847817`

The Cloud CI workflow pins the exact Android SHA above. Acceptance is tied to executed verification of the paired heads, not merely to source existence.

## Phase 1 — ACCEPTED

Phase 1 froze the baseline, nine-phase program, architecture invariants, requirement IDs, complete source coverage and non-goals. No runtime feature was added in Phase 1.

## Phase 2 — SOURCE IMPLEMENTED + FURTHER HARDENED / NOT ACCEPTED

Implemented staging source includes:

- canonical evidence/provider/family/capability/health/quality model;
- mandatory independence groups;
- adaptive bounded sampling;
- separate encrypted Android evidence journal;
- DB-owned transactional evidence sequence allocation;
- canonical paired v4/variant-2 identity boundary;
- exact ACK deletion semantics plus dispatcher-level exact ACK-set validation;
- wire-order-safe pending queue for recovery/import inserts;
- quarantine history separated from current journal-health recovery;
- quiet journal read probe through `refreshHealth()` and health telemetry;
- safety/live-location/crash priority over evidence;
- dedicated network-constrained evidence worker;
- fast healthy catch-up plus bounded persistent-failure backoff to a 15-minute cap;
- separate bounded binary BREV v1 protocol;
- canonical UUID / wire-safe integer rules and shared Android/TypeScript golden vector;
- signed evidence route isolated in `src/evidence-route.ts` and delegated from worker-v7;
- requester-attempt and authenticated-device rate buckets separated;
- actual streaming body bound using `readBoundedBody()` rather than unbounded `req.arrayBuffer()`;
- content-addressed raw R2 objects using hashed device identity plus exact batch hash;
- hard transactional D1 claims for batch and new-record identities;
- record-level replay dedupe without storage amplification;
- bounded one-pass convergence for legitimate same-batch/mixed-record races;
- exact conflicts remain fail-closed;
- provider-health ordering by epoch/sequence rather than wall clock;
- Android-compatible DER ECDSA route-test source;
- schema and retention foundations without claiming later algorithms;
- Android instrumentation source for restart/ACK/priority/sequence/pairing/wire-order/quarantine/health/backoff behavior;
- deterministic paired CI that pins the exact Android source SHA.

### Evidence level

Earlier Phase 2 heads received real local protocol/Cloud route/persistence execution, including the shared golden vector, persistence-before-ACK, replay/dedupe, collision handling, batch-ID race rollback, signed-route behavior and targeted record-race/DER-format checks.

Observed earlier markers include:

- `LATEST ANDROID KOTLIN PHASE2 PROTOCOL PASS`
- `LOCAL_CURRENT_PHASE2_CLOUD_RACE_HARNESS_PASS`
- `LOCAL_CURRENT_PHASE2_SIGNED_ROUTE_PASS`

The final paired heads add further hardening after those runs. Those earlier passes are retained as useful evidence but are **not** represented as full verification of final Cloud `60697dc3...` and Android `4ec37a20...`.

### Hosted CI blocker

Latest checked hosted run:

- run `41215211883`
- Cloud head `60697dc37cb325574e9bd22283e2b3dd1d847817`
- pinned Android head `4ec37a2021bcd575cfefeadd58c968675965a8e7`

Observed:

- Android compile/lint/dependency-lock: failure with `runner_id: 0`, empty runner name and `steps: []`;
- Cloud protocol/persistence/regression: failure with `runner_id: 0`, empty runner name and `steps: []`;
- Android instrumentation: skipped.

No runner executed source steps. This is **not a source pass and not evidence of source failure**. It does not satisfy `CI_VERIFIED`.

### Merge / acceptance rule

PR #6 and PR #7 remain draft/unmerged deliberately.

Phase 2 is accepted only after actual execution proves:

1. Cloud typecheck, protocol/persistence harness, signed-route harness and retained Phase 6 regressions pass on the final paired checkpoint;
2. Android dependency lock, full compile and lint pass on the exact pinned Android SHA;
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

Source existence, prior local harnesses, targeted invariant checks, final-head hosted CI, deployed Cloudflare state, Android hardware behavior and production qualification are separate evidence layers. Brick advances only to the level directly supported by observed evidence.
