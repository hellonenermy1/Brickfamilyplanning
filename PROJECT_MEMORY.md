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

## Canonical GitHub layout

Repository: `hellonenermy1/Brickfamilyplanning`

- `main` — canonical Cloudflare deployment branch. It contains the Phase 6 Worker/backend, setup scripts, schemas, private-map web assets and the manual GitHub Actions dispatchers.
- `apk-download` — Android-only source branch. The default-branch APK workflow checks out this branch and produces downloadable APK artifacts.
- `audit-progress` — documentation-only audit/progress/project-memory branch. No runtime source should be developed here.

Old `phase*` branches are historical only and must not be treated as current source of truth.

## Current release truth

- App package: `com.brick.safety`
- Version name: `0.6.0-phase6-rc`
- Version code: `6`
- Release state: `candidate-not-real-device-qualified`
- Proven Phase 6 source tree before branch separation: Git tree `b5f4ea6e97e9e2afef7a01c8386829f316b4af2e`
- Fully validated source commit for that tree: `176d94f604eb562a59260ef380ee680a564acfcc`
- Later hardening head `b23741d31ec6c51a5b00b6fe15b753b0d70d04c8` had the exact same tree as the fully validated commit before repository separation.

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

## Logging format for future work

Each Brick task should add a `PROGRESS.md` entry containing:

- date/time,
- user request,
- files/branches/settings changed,
- tests or external evidence checked,
- exact result,
- blockers/risks,
- next action if any.

If a task changes a permanent rule, architecture decision, canonical branch, release truth or production prerequisite, update this file in the same task.
