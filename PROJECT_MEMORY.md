# Brick Project Memory

Last updated: 2026-10-31

## Standing rules

1. **Reliability over feature count.** Brick should behave like an appliance: configure once, then ordinary network loss, process death, server restart, temporary GPS degradation and similar recoverable failures should recover automatically.
2. **Measured beats guessed.** Never invent exact location, confidence, deployment state, delivery state, APK signature state or test results.
3. **Durable before fast.** Safety/location evidence must be persisted locally before transmission and retained until exact server acknowledgement.
4. **No fake release claims.** A candidate remains unqualified until the required live cloud, browser and physical-device evidence exists.
5. **No unnecessary redesign.** Preserve proven architecture and prior decisions unless a concrete defect or requirement justifies a change.
6. **Automatic project logging.** Every Brick request from Jayvian must be logged in `PROGRESS.md` as part of the work, without waiting for Jayvian to ask. Material permanent decisions must also update this file.
7. **Separate evidence from assumption.** Progress entries must say what was actually changed/tested and what remains unverified.
8. **Resume from project memory.** When Jayvian asks to continue Brick work, read this file and `PROGRESS.md` first and continue from the recorded state instead of rediscovering or resetting prior work.

## Canonical GitHub layout

Active repository: `hellonenermy1/Brickfamilyplanning`

- `main` — canonical Cloudflare deployment branch. It contains the Phase 6 Worker/backend, setup scripts, schemas, private-map web assets and the manual GitHub Actions dispatchers.
- `apk-download` — Android-only source branch. The default-branch APK workflow checks out this branch and produces downloadable APK artifacts.
- `audit-progress` — documentation-only audit/progress/project-memory branch. No runtime source should be developed here.

Archive repository: `hellonenermy1/Brickfamilyplanning-archive`

- Intended destination for all obsolete `phase*` branches.
- `ARCHIVE_MANIFEST.md` is the authoritative migration ledger for the 19 historical branches and their original source head SHAs.
- The archive repository currently has all 19 historical branch **names**, but those refs are placeholders based on the archive repo's own main history; they do **not yet contain the original branch contents**. Never describe them as fully migrated until exact snapshots/content are verified.

## Archive migration — current state and resume instructions

User goal: keep only `main`, `apk-download`, and `audit-progress` in the active repository. Move every obsolete `phase*` branch to `Brickfamilyplanning-archive`, verify it, then delete the corresponding active-repo branch.

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
- Adding that temporary workflow moved active `main` from the clean-layout head `710fdbf6494a5f947c56d8e4a8fcd911a00e8aad` to temporary archival-workflow head `9ae0f2b72b63d3dfd0bc7807adfbd2928dcd2059`.
- GitHub Actions run ID `41201328643` was attempted twice. Both attempts failed before a runner was assigned; the job had zero executed steps. No archive tarball artifact was produced.
- Therefore **none of the 19 source branches has been deleted yet**. This was deliberate to avoid losing unique historical content.
- The current connected GitHub tool does not expose direct Git-ref deletion. Once snapshots are verified, deletion may need a GitHub Actions cleanup workflow or another supported GitHub ref-delete path.
- The temporary export workflow should be removed from `main` after archival/deletion is successfully completed, returning `main` to its intended Cloudflare + APK-dispatcher-only workflow inventory.

When Jayvian says to continue/archive/delete old branches, do this in order:

1. Read this file, `PROGRESS.md`, and archive `ARCHIVE_MANIFEST.md`.
2. Check whether GitHub Actions runner execution is working again and inspect run `41201328643` or trigger/rerun the export workflow.
3. Require an actual artifact containing exact branch snapshots and SHA-256 checksums; zero-step/no-runner runs do not count.
4. Copy/persist the exact branch snapshots or equivalent exact branch content into `Brickfamilyplanning-archive`.
5. Verify each historical branch/snapshot against its manifest branch name and original head provenance before deleting anything.
6. Only after verification, delete the 19 source `phase*` refs from `Brickfamilyplanning`.
7. Verify the active repo contains only `main`, `apk-download`, and `audit-progress`.
8. Remove the temporary archive-export workflow from `main` if no longer needed.
9. Update `PROGRESS.md`, this file, and the archive manifest with final evidence. Never claim completion before these checks pass.

## Current canonical heads / identities

- `main` clean-layout head before temporary archive workflow: `710fdbf6494a5f947c56d8e4a8fcd911a00e8aad`
- `main` current temporary archival-workflow head: `9ae0f2b72b63d3dfd0bc7807adfbd2928dcd2059`
- `apk-download`: `c99fe4ce7f74b14ba23d280739ed150a327b8520`
- `audit-progress`: documentation-only; its head advances whenever project memory/progress is logged.

## Current release truth

- App package: `com.brick.safety`
- Version name: `0.6.0-phase6-rc`
- Version code: `6`
- Release state: `candidate-not-real-device-qualified`
- Proven Phase 6 source tree before branch separation: Git tree `b5f4ea6e97e9e2afef7a01c8386829f316b4af2e`
- Fully validated source commit for that tree: `176d94f604eb562a59260ef380ee680a564acfcc`
- Later hardening head `b23741d31ec6c51a5b00b6fe15b753b0d70d04c8` had the exact same tree as the fully validated commit before repository separation.
- PR #5 was closed and retitled as archived/superseded by the canonical branch split; do not merge it.

## Current architecture decisions

- Android Fused Location Provider remains the primary position source; Brick adds validity, plausibility and confidence logic rather than replacing Android fusion.
- Transport mode is honest (`Vehicle`, not fake car/bus/train classification).
- Location states distinguish precise/assisted/anchored/estimated/coarse/last-known/unknown.
- SOS has highest transmission/retry priority and persists until handled/cancelled according to the implemented contract.
- Child UI stays intentionally minimal: safety state, `I’M SAFE`, `SOS`, and actionable repair guidance only.
- Device Owner is the preferred managed mode for preventing accidental disabling of safety-critical controls where Android/ColorOS supports it.
- Cloud backend uses Cloudflare Worker + Durable Object + D1 + R2 + Queues/DLQ + Cloudflare Access.
- Parent map is same-origin/private MapLibre + PMTiles; no live third-party child-location lookup fallback.
- Device identity uses Android Keystore-backed asymmetric signing; no hard-coded API secret in the APK.
- No ad/marketing analytics SDKs.

## Production prerequisites still open

- Configure stable Android signing and produce a stable-signed release APK.
- Run the canonical `main` Cloudflare deployment workflow and retain its Phase 6 deployment-verification evidence.
- Perform authenticated parent-browser smoke testing against the live Phase 6 deployment.
- Complete real OPPO/ColorOS qualification including Device Owner provisioning, pairing, screen-off/background operation, reboot/swipe-away recovery, network outage/backlog drain, SOS retry/persistence, revoke, private map, battery and endurance.
- Production Cloudflare should use a plan that can sustain Brick’s durable Queue/history traffic; do not weaken sampling/history merely to fit an inadequate quota.

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

If a task changes a permanent rule, architecture decision, canonical branch, release truth, archive state or production prerequisite, update this file in the same task.
