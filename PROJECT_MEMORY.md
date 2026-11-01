# Brick Project Memory

Last updated: 2026-11-01

## Standing rules

1. **Reliability over feature count.** Brick should behave like an appliance: configure once, then ordinary network loss, process death, server restart, temporary GPS degradation and similar recoverable failures should recover automatically.
2. **Measured beats guessed.** Never invent exact location, confidence, deployment state, delivery state, APK signature state or test results.
3. **Durable before fast.** Safety/location/evidence that requires durable delivery must be persisted locally before transmission and retained until exact server acknowledgement.
4. **No fake release claims.** A candidate remains unqualified until the required live cloud, browser and physical-device evidence exists.
5. **No unnecessary redesign.** Preserve proven architecture and prior decisions unless a concrete defect or requirement justifies a change.
6. **Automatic project logging.** Every Brick request from Jayvian must be logged in `PROGRESS.md` as part of the work, without waiting for Jayvian to ask. Material permanent decisions must also update this file.
7. **Separate evidence from assumption.** Progress entries must say what was actually changed/tested and what remains unverified.
8. **Resume from project memory.** When Jayvian asks to continue Brick work, read this file and `PROGRESS.md` first and continue from the recorded state instead of rediscovering or resetting prior work.
9. **New V1 contract is `Yes.docx`.** The expanded `Yes.docx` project file version 1 is the current Brick V1 requirements contract. It includes the original reliability/safety/history architecture plus 23A–23O Evidence Engine/Atlas/Witness/particle/Shizuku additions. Do not fall back to the older pre-expansion plan unless the user explicitly changes the contract.
10. **Nine-phase program is fixed.** Use `V1_PHASES.md`; do not silently create a tenth implementation phase. New discoveries belong in the appropriate existing phase unless the V1 contract is deliberately revised.
11. **Requirement-led implementation.** Use `V1_REQUIREMENTS.md` and `PHASE1_SOURCE_COVERAGE.md` before marking any feature complete. A requirement is not done just because code exists.
12. **Architecture invariants are frozen.** `V1_ARCHITECTURE_FREEZE.md` is the cross-phase design boundary. If implementation evidence shows an invariant must change, record the evidence and explicit contract decision before changing architecture.

## New Brick V1 nine-phase program

1. Contract, Baseline & Architecture Freeze — **ACCEPTED 2026-10-31**
2. Evidence Platform, Protocol & Durable Data Foundation — **ACCEPTANCE-READY IN SOURCE / REAL ANDROID + OPPO + HOSTED/LIVE GATES PENDING / NOT ACCEPTED**
3. Motion Intelligence, Learned Odometry & Particle Positioning — **SOURCE-COMPLETE + ACCEPTANCE-READY / PHASE 2 DEPENDENCY + HOSTED + DEVICE GATES PENDING / NOT ACCEPTED**
4. Environmental Fingerprint Atlas & Signal Trust Engine
5. Unified Fusion, Learned Places, Routes, Witness Mesh & Ground Network
6. Device Owner, Parent Location Control & Optional Shizuku Enhancement
7. Cloud Intelligence, History, Parent Dashboard & Child UX Integration
8. Reliability, Security, Privacy & Operational Hardening
9. Real OPPO Qualification, Production Release & Acceptance

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
- `PHASE2_CHECKPOINT_2026-11-01.md`
- `PHASE2_ACCEPTANCE_READINESS_2026-11-01.md`

Phase 3 artifact:

- `PHASE3_REPORT.md`

Important Phase 1 truth: the retained Phase 6 candidate is a strong foundation but is **not** the completed new V1 contract. Production acceptance remains Phase 9.

## Phase 2 current resume state

When Jayvian says to continue Phase 2, **do not restart**. Resume from:

- Cloud staging: `v1-p2-evidence-cloud`, PR #6, draft/unmerged, exact head `1d880b703dd5d0c5f581926426a0db29e6c67b8b`.
- Android staging: `v1-p2-evidence-android`, PR #7, draft/unmerged, exact head `9d1d04532abc52b679075fe2e330c3d2daafab3b`.
- Exact hosted run/retry: `41221221445`; prerequisite jobs again failed before runner/source-step execution and instrumentation was skipped.
- Do not merge either PR until real hosted execution, required real OPPO/ColorOS Phase 2 qualification and exact Cloudflare production verification pass.
- A reminder is scheduled for Monday afternoon Singapore time for the real OPPO/ColorOS Phase 2 qualification.

Phase 2 permanent design decisions:

1. **Separate evidence protocol.** Keep Brick Core's existing live V2 / 90-byte packet unchanged. Evidence uses bounded BREV v1 batches.
2. **Evidence stays below safety.** Evidence never outranks SOS/safety, durable live location or crash backlog.
3. **DB owns Android sequencing.** `brick_evidence.db` transactionally allocates sequence; SharedPreferences is only a cache.
4. **Dedicated evidence catch-up worker.** Initial evidence work uses `KEEP`; bounded successors use `APPEND_OR_REPLACE`; network is required; generic RecoveryWorker restores Core first.
5. **Persistent evidence failures back off.** Healthy backlog catch-up stays fast, Core backlog stays higher priority, and repeated transport/ACK/identity failure uses a durable bounded exponential delay capped at 15 minutes rather than waking forever at a fixed short interval.
6. **Paired identity is canonical v4.** Android only journals/drains evidence for canonical lowercase RFC-4122 v4/variant-2 device IDs created by pairing. Cloud evidence route enforces the same boundary.
7. **Exact ACK is the deletion boundary.** Dispatcher independently reconstructs the expected ACK set and must see that exact set before local evidence deletion; a missing/partial/wrong ACK never deletes pending evidence.
8. **Pending evidence is read in wire order.** Recovery/import insertion order must not make valid durable evidence unsendable; `nextPending()` orders by `(epoch,sequence,id)`.
9. **Quarantine is bounded history, not permanent current failure.** Current journal health can recover after the failure hold/read probe. Quarantine has 30-day age retention and a 2,048-row cap while pending evidence is never age-purged and sequence state is never reset.
10. **Raw R2 is privacy-reduced/content-addressed.** Raw evidence object paths use `sha256(deviceId)` and include exact `batchSha`; never use raw/sanitized device ID in the R2 key.
11. **Batch UUID and new record identities are hard transactional claims.** `evidence_batches` and absent `evidence_records` use normal `INSERT`, not `INSERT OR IGNORE`. Conflicting concurrent claims must roll back rather than silently link to competing data.
12. **Record replay must not amplify storage.** If all records already exist and match exactly under a fresh transport batch UUID, return exact ACKs and create no new R2 object/batch row.
13. **Legitimate concurrency converges once.** Exact races may re-read durable state and retry once. Changed content remains conflict; unrelated storage failure must not be masked.
14. **Evidence request bodies are actually bounded.** No-length/chunked traffic over 65,536 bytes is rejected before device-rate consumption or persistence.
15. **Rate limits are split by trust boundary.** Request-attempt limiting happens on requester context first; the device-scoped evidence bucket is consumed only after valid P-256 device-signature verification.
16. **Signed route is separately testable.** `src/evidence-route.ts` owns evidence HTTP validation/auth/rate/persistence and `worker-v7` delegates to it.
17. **Android signature format matters.** Android `SHA256withECDSA` emits DER; tests exercise Android-style DER rather than only WebCrypto P1363.
18. **Persist before ACK.** A success ACK is returned only after applicable durable state has been verified.
19. **Later-phase tables are foundations only.** Atlas/witness/receiver/command/refined-history schema existence does not mean those algorithms are implemented.
20. **Do not casually change live epoch/reboot semantics in Phase 2.** The existing epoch lifecycle is cross-cutting and remains a later durability/replay concern unless concrete evidence makes it a current blocker.

Phase 2 execution evidence retained:

- `PHASE2_CURRENT_CLOUD_ACCEPTANCE_HARNESS_PASS`
- `PHASE2_CURRENT_CLOUD_RERUN_TRIGGER_PASS`
- `PHASE2_CURRENT_ANDROID_KOTLIN_PROTOCOL_PASS`
- `PHASE2_CURRENT_ANDROID_ACK_JVM_STUB_PASS`
- `PHASE2_CURRENT_ANDROID_DISPATCHER_JVM_STUB_PASS`
- `PHASE2_CURRENT_ANDROID_QUARANTINE_SQL_PASS`

Those Android JVM/SQLite checks are useful source/logic evidence, not Android framework/Keystore/WorkManager/OPPO proof. Zero-step/no-runner hosted runs are neither pass nor source failure.

## Phase 3 current resume state

When Jayvian says to continue Phase 3, **do not restart or redesign**. Resume from:

- Android staging: `v1-p3-motion-positioning-android`, PR #10, draft/unmerged, base `v1-p2-evidence-android`, exact head `48423e5ba84dd6273315581f6c101141e5eae9ac`.
- Cloud staging: `v1-p3-motion-positioning-cloud`, PR #9, draft/unmerged, base `v1-p2-evidence-cloud`, exact head `3db7c6c54fcf4a6b35afa22e91076178fde29de9`.
- Cloud Phase 3 CI pins exact Android `48423e5ba84dd6273315581f6c101141e5eae9ac`.
- Exact CI run `41254615824`: Cloud and Android prerequisite jobs failed before source steps; instrumentation skipped.
- `PHASE3_REPORT.md` is the authoritative Phase 3 implementation/acceptance handoff.
- Phase 3 is **source-complete/acceptance-ready, not accepted**. Do not add speculative features merely to look busy; only fix a concrete audit/test defect.
- Do not merge PR #9/#10 until Phase 2 is accepted first and Phase 3's hosted + Android instrumentation + real OPPO tests pass.

Phase 3 permanent design decisions:

1. **Pure positioning core, Android adapter outside.** Learned odometry, route graph, sequence matching and particles stay mostly pure Kotlin. `MotionEngine` is the platform sensor adapter so OEM/sensor failure cannot corrupt the positioning architecture.
2. **Fused Location remains primary.** Phase 3 improves trust/fallback; it does not replace Android fused positioning.
3. **Many hypotheses, not one guessed route.** Precise loss initializes/propagates a deterministic particle set. Internal weights are not exposed as calibrated user probabilities.
4. **Uncertainty must grow between trusted fixes.** Particle uncertainty is monotonic during unsupported propagation and estimates expire rather than remaining falsely precise forever.
5. **Learned odometry is bounded.** Walking/running stride is calibrated only from good trusted periods; vehicle/bicycle acceleration integration is bounded; raw acceleration is never integrated indefinitely.
6. **Stationary zero-velocity correction.** Strong stationary evidence pulls estimated velocity to zero and suppresses fake drift.
7. **Long process gaps do not replay missed steps down one heading.** Direct propagation is capped at 30 seconds. Longer gaps freeze direct displacement and expand uncertainty aggressively.
8. **Route/path evidence only where geometry exists.** Local learned paths and private PMTiles geometry may constrain hypotheses. Missing map coverage is never a wall. Brick currently cannot claim generic indoor wall avoidance without building-wall geometry.
9. **No hidden global snap.** Different particles may softly prefer different route candidates; the entire estimate is never silently snapped to one road.
10. **Stationary particles ignore route geometry.** Nearby streets must never drag a stationary child position toward a road.
11. **Route evidence decays.** Private map cache expires after 7 days; single learned segments after 45 days; repeated learned segments after 180 days. Future-skewed route timestamps are rejected.
12. **Route freshness uses phone receipt time.** Server generation time is diagnostics/provenance only; clock skew must not make local geometry fresh forever.
13. **Private route graph is signed and bounded.** Device-authenticated route request, fixed 650 m server radius, <=256 segments, bounded client response, serialization-safe IDs, allowed movement bits and client locality check.
14. **Magnetic evidence is sequence-only.** Orientation-corrected multi-sample sequences require repeated trusted observation, reweight hypotheses only, and never create a standalone exact position.
15. **Physical landmarks are sequence-only.** One bump/turn/stop proves almost nothing. Repeated multi-event sequences are supporting route evidence only.
16. **Magnetic/landmark models decay.** Both expire after 90 days and must relearn rather than resurrect an old signature indefinitely.
17. **Fused-fix consistency is deliberately fail-open.** Weak/missing sensors do not reject GPS; phone orientation alone is not travel direction; speed metadata alone cannot reject a plausible coordinate. Strong contradictions may reject before trusted-state/model training.
18. **Rejected raw GPS is preserved.** A rejected fix flows through the normal raw observation fields; filtering must not erase evidence.
19. **Phase 3 state is encrypted/atomic/bounded.** `brick_phase3_state.bin` uses the existing Keystore-backed journal cipher plus `AtomicFile`; corruption fails closed and oversized state is rejected.
20. **No continuous inertial state across reboot.** Restored particles are refused if the monotonic clock reset makes continuity impossible.
21. **Health stays privacy-safe.** Publish counts/ages/uncertainty/provider health, not route coordinates, particle clouds or raw IMU/magnetic values.
22. **Private map is optional.** Missing/corrupt route graph cannot block Brick Core; learned routes/odometry and the existing server corridor path continue.

Phase 3 executed evidence retained:

- `PHASE3_PURE_CORE_ACCEPTANCE_PASS` for the earlier pure core covering learned odometry/ZVC, route graph behavior, repeated sequence support, particle persistence, uncertainty growth, route elimination, long-outage expiry and trusted-fix recovery.
- Focused latest `PositionConsistencyGuard` Kotlin/JVM cases passed normal/fail-open behavior plus stationary, no-step, coordinate-supported acceleration, calibrated reversal and hard-physics rejection.
- Later TTL/state-store/route-parser/health hardening is source-reviewed and test-covered but still requires Android framework/emulator/device execution.

Monday OPPO work after Phase 2 qualification should then cover Phase 3 sensor availability/health, hand vs pocket walking, running, stationary ZVC, GNSS-loss short walk with growing uncertainty, turns/path elimination, private-map offline cache, provider failure, >30 s process gap, same-boot state restore, reboot refusal of continuous particles, precise-fix return/recentering, weak-sensor fail-open behavior, and measured battery/CPU impact. See `PHASE3_REPORT.md` for the full list.

## Canonical GitHub layout

Active repository: `hellonenermy1/Brickfamilyplanning`

- `main` — canonical Cloudflare deployment branch.
- `apk-download` — canonical Android source branch.
- `audit-progress` — documentation-only audit/progress/project-memory branch.

Temporary/non-canonical V1 work branches currently include:

- `v1-p1-contract` — integrated Phase 1 documentation staging ref; remove when a supported cleanup path exists.
- `v1-p2-evidence-cloud` — Phase 2 Cloud staging / PR #6.
- `v1-p2-evidence-android` — Phase 2 Android staging / PR #7.
- `v1-p3-motion-positioning-cloud` — Phase 3 Cloud staging / PR #9.
- `v1-p3-motion-positioning-android` — Phase 3 Android staging / PR #10.
- `temp-noop` — accidental non-canonical ref created during Phase 3 tool switching; it points at Phase 3 Cloud history and contains no unique intended work. Remove when a supported branch-ref deletion path is available. Never treat it as canonical.

Archive repository: `hellonenermy1/Brickfamilyplanning-archive`

- Intended destination for all obsolete `phase*` branches.
- `ARCHIVE_MANIFEST.md` is the authoritative migration ledger for the 19 historical branches and their original source head SHAs.
- The archive repository currently has all 19 historical branch **names**, but those refs are placeholders based on the archive repo's own main history; they do **not yet contain the original branch contents**. Never describe them as fully migrated until exact snapshots/content are verified.

## Archive migration — current state and resume instructions

User goal: keep only `main`, `apk-download`, and `audit-progress` in the active repository after temporary V1 work refs are safely integrated/removed. Move every obsolete `phase*` branch to `Brickfamilyplanning-archive`, verify it, then delete the corresponding active-repo branch.

Historical branches to archive/delete:

- `phase1-child-apk`
- `phase1-cloudflare-setup`
- `phase2-child-reliability`
- `phase2-cloudflare-reliability`
- `phase3-child-position-intelligence`
- `phase3-cloudflare-position-intelligence`
- `phase4-child-safety-history`
- `phase4-cloudflare-safety-history`
- `phase5-child-health-ops`
- `phase5-cloudflare-parent-ops`
- `phase5b-no-r2`
- `phase5b-private-map-places`
- `phase5c-child-hardening`
- `phase5c-hardening-audit`
- `phase6-child-final-audit`
- `phase6-cloud-final-audit`
- `phase6-cloud-final-audit-v2`
- `phase6-final-hardening`
- `phase6-integration`

Authoritative original head SHAs are stored in `Brickfamilyplanning-archive/ARCHIVE_MANIFEST.md`. Do not guess or reconstruct them from memory if the manifest can be read.

Important migration facts:

- GitHub private Git commit/tree object IDs cannot simply be reused across these two separate repositories. A direct archive-branch creation attempt from the source commit returned `Object does not exist`.
- A temporary source-repo workflow was added at `.github/workflows/archive-historical-branches.yml`, named **Brick — Export Historical Branches**. It is designed to create an exact `git archive` tar.gz snapshot plus SHA-256 checksum for every obsolete branch before deletion.
- Adding that temporary workflow moved active `main` from the clean-layout head `710fdbf6494a5f947c56d8e4a8fcd911a00e8aad` to temporary archival-workflow head `9ae0f2b72b63d3dfd0bc7807adfbd2928dcd2059` at Phase 1 start.
- GitHub Actions run ID `41201328643` was attempted twice. Both attempts failed before a runner was assigned; the job had zero executed steps. No archive tarball artifact was produced.
- Therefore **none of the 19 source branches has been deleted yet**. This was deliberate to avoid losing unique historical content.
- The connected GitHub tooling previously used did not expose direct Git-ref deletion. Once snapshots are verified, deletion may require a supported ref-delete path.
- The temporary export workflow should be removed after archival/deletion succeeds.

When Jayvian says to continue/archive/delete old branches, do this in order:

1. Read this file, `PROGRESS.md`, and archive `ARCHIVE_MANIFEST.md`.
2. Check whether GitHub Actions runner execution is working again and inspect/run the export workflow.
3. Require an actual artifact containing exact branch snapshots and SHA-256 checksums; zero-step/no-runner runs do not count.
4. Persist exact branch snapshots/content in `Brickfamilyplanning-archive`.
5. Verify each historical snapshot against branch name and original-head provenance.
6. Only after verification, delete the 19 source `phase*` refs.
7. Verify only canonical refs plus intentionally active temporary V1 work refs remain.
8. Remove the temporary archive-export workflow when no longer needed.
9. Update `PROGRESS.md`, this file and archive manifest with final evidence.

## Current canonical heads / identities at Phase 1 start

- `main` clean-layout head before temporary archive workflow: `710fdbf6494a5f947c56d8e4a8fcd911a00e8aad`
- `main` temporary archival-workflow head observed at Phase 1 start: `9ae0f2b72b63d3dfd0bc7807adfbd2928dcd2059`
- `apk-download` observed at Phase 1 start: `c99fe4ce7f74b14e23d280739ed150a327b8520`
- `audit-progress` pre-Phase-1 head: `da2d56f6d46eeb293d5ef5010304730dd45378d1`

Runtime trees observed at Phase 1 start:

- `main`: `33cdcddcfab9cd3e0325b2cd9312511b65c5b7f3`
- `apk-download`: `034d0cdfe494f3f74ddfa5d44e1d1e974fd92f42`

## Current release truth

- App package: `com.brick.safety`
- Version name: `0.6.0-phase6-rc`
- Version code: `6`
- Release state: `candidate-not-real-device-qualified`
- Proven Phase 6 source tree before branch separation: Git tree `b5f4ea6e97e9e2afef7a01c8386829f316b4af2e`
- Fully validated source commit for that tree: `176d94f604eb562a59260ef380ee680a564acfcc`
- Later hardening head `b23741d31ec6c51a5b00b6fe15b753b0d70d04c8` had the same tree before repository separation.
- PR #5 is archived/superseded and must not be merged.
- Phase 2/3 staging does not change release identity or production qualification.

## Current architecture decisions

- Android Fused Location Provider remains the primary position source; Brick adds validity, plausibility and confidence/fusion logic rather than replacing Android fusion.
- New degraded-position sources produce evidence/constraints and feed one central hypothesis engine; no weak provider independently creates precise truth.
- Transport mode is honest (`Vehicle`, not fake car/bus/train classification).
- Location states remain precise/assisted/anchored/estimated/coarse/last-known/unknown.
- Raw observations, original realtime estimates and future refined/backward-smoothed estimates must remain distinct.
- Evidence independence groups prevent correlated clues from being double-counted.
- Environmental Atlas learns only from trusted labelled position periods and must automatically decay/relearn changed signals.
- Witness/Ground Network uses rotating privacy-preserving identifiers; RSSI is never exact ranging; no public crowdsourced tracking network in V1.
- SOS has highest transmission/retry priority and persists until handled/cancelled according to the implemented contract.
- Child UI stays intentionally minimal: safety state, `I’M SAFE`, `SOS`, and actionable repair guidance only.
- Device Owner remains the primary managed mode; parent Location control will be desired-vs-actual and phone-confirmed in Phase 6.
- Shizuku is optional enhancement only; Brick Core must never depend on it and no generic remote shell endpoint is allowed.
- Cloud backend uses Cloudflare Worker + Durable Object + D1 + R2 + Queues/DLQ + Cloudflare Access.
- Parent map is same-origin/private MapLibre + PMTiles; no live third-party child-location lookup fallback.
- Device identity uses Android Keystore-backed asymmetric signing; no hard-coded API secret in the APK.
- No ad/marketing analytics SDKs.

## Production prerequisites still open

- Complete and accept Phases 2–8 before final production qualification.
- Configure stable Android signing and produce a stable-signed release APK.
- Run the canonical Cloudflare deployment workflow for the final matching V1 commit and retain deployment-verification evidence.
- Perform authenticated parent-browser smoke testing against the exact final deployment.
- Complete real OPPO/ColorOS qualification including Device Owner provisioning, pairing, screen-off/background operation, reboot/swipe-away recovery, network outage/backlog drain, SOS retry/persistence, revoke, private map, battery and endurance.
- Qualify Atlas/particle/Witness/Ground/Shizuku features using `V1_REQUIREMENTS.md` in their owner phases.
- Production Cloudflare should use a plan that can sustain Brick's required durable traffic; do not weaken reliability to fit an inadequate quota.

## Proven APK/build evidence retained from Phase 6 audit

Fully proven candidate source commit: `176d94f604eb562a59260ef380ee680a564acfcc` with tree `b5f4ea6e97e9e2afef7a01c8386829f316b4af2e`.

- Debug APK SHA-256: `d5142940dd2721803c4687e19037c9750a56fc3b73dfddb0a3f71737a78d30da`
- Unsigned release-candidate APK SHA-256: `dc0dd7a98430efb5acd0f454359e2a6f060ba0350ba27dd7e7bec430e80fe4cd`
- Gradle lock SHA-256: `8821f7080e86a0e2e9ad7a022193723a4f7a516098a1640d468f749c208427e0`
- Stable Android production signing remains unconfigured; never call the unsigned release production-signed.

## Logging format for future work

Each Brick task should add a `PROGRESS.md` entry containing:

- date/time,
- user request,
- files/branches/settings changed,
- tests or external evidence checked,
- exact result,
- blockers/risks,
- next action if any.

For each implementation phase, also record requirement IDs affected and the highest evidence state reached (`IMPLEMENTED`, `CI_VERIFIED`, `INTEGRATION_VERIFIED`, `DEVICE_VERIFIED`, `ACCEPTED` or `VERIFIED_UNSUPPORTED`).

If a task changes a permanent rule, architecture decision, canonical branch, release truth, archive state or production prerequisite, update this file in the same task.