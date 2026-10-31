# Brick Audit Status

Last updated: 2026-10-31

## Current acceptance state

Brick remains a **release candidate**, not production-qualified.

- Version: `0.6.0-phase6-rc`
- Version code: `6`
- Package: `com.brick.safety`
- Qualification: `candidate-not-real-device-qualified`
- V1 program: **Phase 1 ACCEPTED; Phase 2 SOURCE IMPLEMENTED / CORE CLOUD+PROTOCOL LOCALLY VERIFIED / HOSTED CI BLOCKED / NOT ACCEPTED; Phases 3–9 not accepted**

No Phase 2 source has been promoted to the canonical runtime branches yet.

## Contract / audit artifacts

Canonical V1 contract: project `Yes.docx` version 1.

Phase 1 artifacts:

- `PHASE1_BASELINE.md`
- `V1_ARCHITECTURE_FREEZE.md`
- `V1_PHASES.md`
- `V1_REQUIREMENTS.md`
- `PHASE1_SOURCE_COVERAGE.md`
- `PHASE1_REPORT.md`

Phase 2 artifacts:

- `PHASE2_REPORT.md`
- `PHASE2_LOCAL_VERIFICATION.md`

The duplicate source headings are normalized as `23G-UI` and `23G-GROUND` in the requirement ledger.

## Proven retained Phase 6 baseline

Fully validated source commit:

`176d94f604eb562a59260ef380ee680a564acfcc`

Git tree:

`b5f4ea6e97e9e2afef7a01c8386829f316b4af2e`

The later pre-cleanup hardening head `b23741d31ec6c51a5b00b6fe15b753b0d70d04c8` had the same tree.

All eight normal Phase 6 CI workflows previously passed on the retained baseline: source inventory, Android runtime wiring, Android recovery hardening, Cloudflare validation, security hardening, operations/durability, exact Gradle locking, and Android debug/release build + lint/APK inspection/provenance.

That evidence does not prove the new V1 additions.

## Repository organization

Canonical branches:

- `main` — Cloudflare/runtime.
- `apk-download` — Android source.
- `audit-progress` — audit/progress/project memory.

Current non-canonical Phase 2 staging branches:

- `v1-p2-evidence-cloud` — PR #6, draft/unmerged.
- `v1-p2-evidence-android` — PR #7, draft/unmerged.

Latest snapshot used by the current Phase 2 report:

- Android: `ae20681d4e4fc938da9d13f1071c28199a6af1f7`
- Cloud: `999b6573c90bab8352fe4f2bc648baf9bb8784e6`

The branches are active staging refs and may move as Phase 2 defects are repaired; acceptance is tied to executed verification of the final paired heads, not to these SHA strings alone.

## Phase 1 — ACCEPTED

Phase 1 froze:

- exact baseline identity;
- nine-phase program;
- architecture/invariants;
- stable requirement IDs;
- source coverage including both 23G sections;
- explicit V1 non-goals;
- owner phase and required proof for every implementation requirement.

No runtime feature was added in Phase 1.

## Phase 2 — SOURCE IMPLEMENTED / LOCALLY PARTIALLY VERIFIED / NOT ACCEPTED

Implemented staging source includes:

- canonical evidence/provider/capability/health/quality model;
- mandatory independence groups;
- adaptive sampling coordinator;
- separate encrypted Android evidence journal;
- DB-owned transactional evidence sequence allocator;
- exact evidence ACK semantics;
- evidence priority below safety/live-location/crash backlog;
- separate bounded binary Evidence Batch v1 protocol;
- shared Android/TypeScript golden vector;
- canonical UUID and wire-safe integer restrictions;
- signed evidence endpoint;
- safe evidence device-path parsing;
- D1/R2 idempotent persistence and collision detection;
- provider-health ordering by epoch/sequence rather than wall-clock time;
- hashed device identity in raw R2 evidence paths/metadata;
- schema foundations for evidence plus later Atlas/witness/receiver/command/refined-history metadata, without claiming those later algorithms exist;
- setup ordering that applies schema + raw-evidence retention before worker-v7 activation;
- Android dummy-provider and sequence/restart instrumentation source;
- Cloud protocol/idempotency integration-test source.

### Executed local evidence

The core current Cloud protocol/ingest logic has been executed locally with TypeScript + in-memory SQLite/R2-style harness and passed:

- fixed golden vector;
- strict decode;
- persistence and exact ACK;
- duplicate/retry idempotency;
- collision rejection;
- provider-health ordering under regressed wall clock;
- hashed R2 device metadata;
- rejection of epoch above Android signed-Int range.

Observed outputs:

- `LOCAL CLOUD PHASE2 HARNESS PASS`
- `LATEST CLOUD EPOCH BOUND PASS`

The pure Kotlin evidence protocol was also locally compiled earlier and produced the same golden bytes. Latest Android application-level hardening remains dependent on full Android build/instrumentation execution.

### Hosted CI blocker

GitHub Actions continues to fail before runner assignment.

Run `41208953558` shows:

- Cloud job: `runner_id: 0`, empty runner name, `steps: []`, failure;
- Android compile/lint job: `runner_id: 0`, empty runner name, `steps: []`, failure;
- Android instrumentation: skipped, `steps: []`.

Later runs have continued to fail before useful hosted execution at the time of this audit update.

These are **not source failures and not passes**. They do not satisfy `CI_VERIFIED`.

### Phase 2 merge/acceptance rule

PR #6 and PR #7 remain draft/unmerged deliberately.

Phase 2 cannot be marked accepted until the final paired heads receive actual execution proving:

1. Cloud typecheck/protocol/idempotency/regression tests pass;
2. Android dependency lock, compile and lint pass;
3. Android instrumentation executes and passes;
4. dummy evidence persists across restart, transports, receives exact ACK and is removed without starving safety/live-location work;
5. post-merge canonical checks pass.

## Phases 3–9

- Phase 3 — NOT STARTED/NOT ACCEPTED
- Phase 4 — NOT STARTED/NOT ACCEPTED
- Phase 5 — NOT STARTED/NOT ACCEPTED
- Phase 6 — NOT STARTED/NOT ACCEPTED
- Phase 7 — NOT STARTED/NOT ACCEPTED
- Phase 8 — NOT STARTED/NOT ACCEPTED
- Phase 9 — NOT STARTED/NOT ACCEPTED

Do not treat Phase 3 as approved continuation until Phase 2's acceptance gate is closed.

## Remaining production blockers

1. Complete/accept Phase 2 and all later V1 phases.
2. Stable Android production signing.
3. Exact final live Cloudflare deployment with retained verifier evidence.
4. Authenticated Cloudflare Access parent-browser smoke test.
5. Physical Reno10/Reno14 ColorOS qualification.
6. 72h and 7-day endurance, Doze, network/GNSS/battery/process/reboot/deployment failure suite.
7. Atlas/Witness/Ground/Shizuku/Location-control real-device capability tests once those phases exist.
8. Zero-manual-intervention proof after every recoverable failure.
9. Measured battery/storage/network/CPU/memory/wakeup/scan/cloud usage.
10. Backup **and restore** drill on final production schema/data path.

## Audit principle

Source existence, a local unit harness, hosted CI, deployed Cloudflare state, Android hardware behavior and production qualification are separate evidence layers. Brick only advances a requirement to the level directly supported by the evidence actually observed.
