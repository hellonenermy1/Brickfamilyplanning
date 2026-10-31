# Brick V1 Phase 1 Closure Report

Date: 2026-10-31
Phase: 1 of 9 — Contract, Baseline & Architecture Freeze
Result: **ACCEPTED — documentation/contract phase complete**
Runtime feature changes: **none**
Production qualification change: **none**

## 1. User goal for this phase

Begin the nine-phase Brick V1 program without cramming implementation together, and establish a sufficiently explicit contract that later work does not hallucinate completion, forget requirements, or silently alter architecture.

## 2. Sources reviewed

Phase 1 was grounded in:

- project `Yes.docx`, version 1, 122 pages;
- every numbered source heading from section 1 through section 83;
- the added sections 23A through 23O;
- both source sections labelled `23G`;
- the final V1 feature list and four design rules;
- current `PROJECT_MEMORY.md`, `PROGRESS.md`, `AUDIT_STATUS.md` and retained Phase 5C audit;
- current GitHub branch heads;
- current Android build identity and representative Android runtime source;
- current Cloudflare runtime configuration and representative backend/browser source.

No outside feature was added to the V1 contract during Phase 1.

## 3. Baseline frozen

Observed canonical heads at Phase 1 start:

- `main`: `9ae0f2b72b63d3dfd0bc7807adfbd2928dcd2059`
- `apk-download`: `c99fe4ce7f74b14ba23d280739ed150a327b8520`
- `audit-progress`: `da2d56f6d46eeb293d5ef5010304730dd45378d1`

Observed runtime trees:

- current `main` tree: `33cdcddcfab9cd3e0325b2cd9312511b65c5b7f3`
- current `apk-download` tree: `034d0cdfe494f3f74ddfa5d44e1d1e974fd92f42`

Retained proven Phase 6 validation baseline:

- validated source commit: `176d94f604eb562a59260ef380ee680a564acfcc`
- validated source tree: `b5f4ea6e97e9e2afef7a01c8386829f316b4af2e`

Android candidate identity remains:

- package: `com.brick.safety`
- versionName: `0.6.0-phase6-rc`
- versionCode: `6`
- release status: `candidate-not-real-device-qualified`

Nothing in Phase 1 upgrades that status.

## 4. Phase 1 artifacts created

### `V1_ARCHITECTURE_FREEZE.md`

Freezes:

- product objective;
- canonical branch roles;
- Android/Cloudflare/parent architecture boundary;
- central evidence/fusion boundary;
- official position states;
- provider capability/health model;
- anti-double-counting rules;
- Atlas learning boundary;
- odometry/particle limits;
- witness/receiver privacy rules;
- future-ranging rule;
- Device Owner/Shizuku boundary;
- parent Location desired-state semantics;
- durability/reliability/security/UI/privacy/release invariants.

### `V1_PHASES.md`

Locks the nine-phase program and exit gates:

1. Contract, Baseline & Architecture Freeze
2. Evidence Platform, Protocol & Durable Data Foundation
3. Motion Intelligence, Learned Odometry & Particle Positioning
4. Environmental Fingerprint Atlas & Signal Trust Engine
5. Unified Fusion, Learned Places, Routes, Witness Mesh & Ground Network
6. Device Owner, Parent Location Control & Optional Shizuku Enhancement
7. Cloud Intelligence, History, Parent Dashboard & Child UX Integration
8. Reliability, Security, Privacy & Operational Hardening
9. Real OPPO Qualification, Production Release & Acceptance

### `V1_REQUIREMENTS.md`

Creates stable requirement IDs covering:

- objective/architecture/UI/managed mode;
- fused positioning, quality metadata, speed/activity/cadence;
- acceptance filter/raw-vs-trusted/confidence/states;
- fallback/network/IP/anchors;
- Parallel Evidence Engine;
- Witness Mesh and Ground Network;
- learned places, particle filtering, radio routes and RTT;
- degraded-position rendering;
- geomagnetic, physical landmarks and learned odometry;
- future ranging and Wi-Fi semantics;
- Location-OFF fusion and backward smoothing;
- Shizuku/Location control/command security/notification/SOS experiment;
- Environmental Atlas and Signal Trust including Wi-Fi/BLE/LAN/cell/GNSS/network/companion/arrival/zone/time evidence;
- history/playback/trips/geofences;
- SOS/I'M SAFE;
- local durability/protocol/cloud processing;
- supervisors/lifecycle/device testing;
- security/pairing/storage/retention/backup;
- parent UI/health/alerts;
- map/privacy/crash/update health;
- full acceptance/failure suite;
- explicit non-goals.

Each requirement records its source, conservative current baseline status, owner phase and expected acceptance evidence.

### `PHASE1_SOURCE_COVERAGE.md`

Maps every source numbered section to requirement IDs and explicitly resolves the duplicate 23G numbering into:

- `23G-UI`
- `23G-GROUND`

This is the anti-omission check for the source contract.

### `PHASE1_BASELINE.md`

Records branch/source/release identity, current candidate implementation areas, known gaps and existing production blockers.

## 5. Architecture decisions now frozen for later phases

The following are no longer informal suggestions; they are V1 program invariants unless the contract is deliberately revised with evidence:

1. Fused Location Provider remains primary normal positioning.
2. New sources produce evidence/constraints; they do not individually declare exact truth.
3. Fusion is parallel and conflict-aware.
4. Uncertainty expands when evidence weakens/conflicts.
5. Raw observations, realtime estimate and later refined estimate remain distinct.
6. Learned inertial location remains bounded/uncertain rather than pretending long-duration exactness.
7. Atlas learns only from trustworthy labelled position periods.
8. Correlated evidence cannot be double-counted as independent proof.
9. Witness/Ground identifiers rotate cryptographically and are not public crowdsourcing.
10. RSSI is never exact range.
11. Device Owner is primary management; Shizuku is optional enhancement only.
12. No arbitrary remote shell endpoint.
13. Parent Location state is desired-vs-actual and must be phone-confirmed.
14. Persist-before-send/exact-ACK/idempotency/safety-priority rules remain mandatory.
15. Unsupported optional hardware/API capability is reported honestly rather than treated as a failure or silently assumed present.
16. Child UI remains intentionally minimal.
17. Parent UI must distinguish device health from position quality.
18. Brick remains a release candidate until real OPPO qualification passes.

## 6. Baseline gap classification

Phase 1 confirms that the current Phase 6 candidate is **not** the completed new V1 contract.

Strong existing foundation includes fused tracking, activity/cadence, compact signed packets, local journal/ACK retry, safety outbox, basic fallback, configured BLE anchors, route corridor support, Cloudflare DO/WebSocket/Queue/DLQ/D1/R2, pairing/revocation, history/trips/geofences, private map, health/ops and minimal child UI.

The major new work begins in Phase 2–6: evidence framework, particle/odometry, Atlas/Signal Trust, learned places/routes, Witness/Ground Network, unified hypothesis fusion, backward smoothing, parent Location desired-state control and optional Shizuku enhancement.

## 7. Phase 1 exit-gate check

- Exact baseline heads recorded: **PASS**
- Release identity recorded without upgrading qualification: **PASS**
- Nine phases frozen: **PASS**
- Architecture boundaries/invariants frozen: **PASS**
- Every numbered `Yes.docx` section mapped: **PASS**
- Duplicate 23G normalized: **PASS**
- Final §83 feature list cross-checked against ledger: **PASS**
- Explicit V1 non-goals captured: **PASS**
- Every implementation requirement has owner phase/acceptance evidence: **PASS**
- Runtime source changed during Phase 1: **NO**
- Production-qualified claim made: **NO**

Therefore Phase 1 is accepted and Phase 2 may begin from this contract.

## 8. Integration / housekeeping

The Phase 1 documentation commits were staged on `v1-p1-contract` and then **fast-forward integrated into canonical `audit-progress`**.

The temporary `v1-p1-contract` ref still exists only because the connected GitHub interface does not expose branch-ref deletion. It is non-canonical and contains no runtime source. It should be removed through the repository-cleanup/ref-deletion path when available; its continued existence is housekeeping, not a Phase 1 acceptance blocker.
