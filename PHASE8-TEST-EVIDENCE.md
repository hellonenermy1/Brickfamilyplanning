# Brick V1 — Phase 8 Test Evidence

Do not write `PASS` here from source inspection alone. Each acceptance item must distinguish implementation evidence from executed CI evidence. A GitHub Actions run with `steps: null` and no job log is **not** a product test failure and is also **not** a pass.

## Baseline and current code-bearing heads

- Android retained baseline: `8843bdae902050c8c1fd7e67ed7ac80662d0da93`.
- Cloud retained baseline: `820fb8974ae185d74b4963b31b18a7fa0eafedf6`.
- Android Phase 8 code-bearing head before this evidence-only update: `6fc8de326ac7c9ec60b0c7e6216c49b3a77ca12d`.
- Cloud Phase 8 code-bearing head before this evidence-only update: `028f55372310c011042dd09388d5c42bbc76b090`.

## Phase 8A — Android/device-side evidence

| Acceptance item | Implementation/gate now present | Latest executed evidence | Status |
|---|---|---|---|
| Build, unit tests, lint, release/R8 | `v1-phase8-android-ci.yml` builds debug/androidTest/release, unit tests and lint with pinned Actions/dependency lock | Run `41562652093`: primary job created but `steps: null`, no logs | CI BLOCKED |
| Full retained instrumentation | Android hardening workflow runs all retained Phase 2–8 instrumentation | Run `41562652093`: instrumentation skipped because prerequisite zero-step job never executed | CI BLOCKED |
| Reboot-safe retirement / repeated invocation / no resurrection | `BetaSafety`, startup fail-closed checks, Device Owner emulator workflow | Run `41562652097`: `steps: null`, no logs | CI BLOCKED |
| Phase 7 → 8 in-place upgrade continuity | exact Phase 7 baseline install + `adb install -r` Phase 8; verifies Android Keystore identity, backlog, command state, safety sequence and retirement | Run `41562652203`: `steps: null`, no logs | CI BLOCKED |
| Stable signing/update continuity | Phase 8 export requires persistent keystore, alias/passwords and pinned certificate fingerprint | Required signing secrets/certificate have not been proven | OPEN EXTERNAL PREREQUISITE |
| Durable local journal / exact ACK / corrupt-row quarantine | `Phase6DurabilityInstrumentedTest`, `Phase8DurabilityTortureInstrumentedTest`, atomic exact-ACK logic | Retained executable tests exist; runner has not executed them at current head | CI BLOCKED |
| 14-day offline backlog | retained 14-day aged backlog test with thousands of core/safety records and reopen/cleanup verification | Awaiting executable instrumentation | CI BLOCKED |
| SOS priority over normal history | encrypted safety outbox, safety-first upload ordering, corrupt-priority-row starvation test | `v1-phase8-recovery-contract.yml` + instrumentation; run `41562652325` has `steps: null` | CI BLOCKED |
| Network/reboot/process recovery | reconnect callback, `START_STICKY`, retry scheduler, boot/package-replace receiver, network-independent WorkManager backstop | Run `41562652325`: `steps: null`, no logs | CI BLOCKED |
| Android command expiry/replay/device binding | strict command parser + durable consumed command ID/nonce/issued-time handling | Retained command/managed-policy instrumentation awaits runner | CI BLOCKED |
| Location/speed correctness | coordinate/age/accuracy validation, plausible-speed and acceleration consistency, impossible speed rejected rather than fabricated | Retained Phase 3 consistency tests await runner | CI BLOCKED |
| Transport-mode hysteresis | low-confidence mode changes rejected; confidence-less transition changes degrade to `UNKNOWN` until sampled confirmation; dedicated Phase 8 test | Retained instrumentation awaits runner | CI BLOCKED |
| Provider/Shizuku failure isolation | provider boundary backoff/recovery + optional typed no-privilege Shizuku fallback | Retained provider/privileged tests await runner | CI BLOCKED |
| Android security/privacy/supply chain | exported-component allowlist, no cleartext/backup, Android Keystore/AES-GCM checks, bounded AIDL, diagnostics privacy, SHA-pinned Phase 8 Actions, dependency lock | Static gate exists but current Actions job never executed | CI BLOCKED |

## Phase 8B — cloud/server/end-to-end evidence

| Acceptance item | Implementation/gate now present | Latest executed evidence | Status |
|---|---|---|---|
| Permanent revocation + identity binding | tombstones, canonical P-256 identity comparison, schema 015 unique index, historical padded/unpadded alias protection | Cloud regression suite exists; run `41562681167` has `steps: null` | CI BLOCKED |
| Existing-production identity migration | live preflight cryptographically canonicalizes historical P-256 SPKIs before schema 015, rejects semantic duplicates/invalid keys, uses conditional updates + re-read convergence | Pure Node migration sanity test was exercised during hardening; formal cloud CI still zero-step | CI BLOCKED FOR FORMAL ACCEPTANCE |
| Single-family isolation boundary | one family per Cloudflare deployment/account, deployment-owned D1/R2/Queue resources and Access audience; caller cannot select a family | Deployment contract exists; formal CI zero-step | CI BLOCKED |
| Parent authentication fail-closed | Access JWT missing/bad/expired/future `nbf`/future `iat`/overlong/bad type/alg/key-rotation matrix | Retained cloud regression exists; run `41562681167` has `steps: null` | CI BLOCKED |
| Server idempotency / duplicate upload / out-of-order delivery | integrated ingest torture, event-time ordering, latest-location non-regression | Retained cloud tests exist; runner not executing | CI BLOCKED |
| Event-time vs receive-time / parent freshness truth | history provenance, last-seen separation, live/recent/stale/offline/unknown presentation contracts | Retained tests exist; runner not executing | CI BLOCKED |
| Large backlog + mixed failures + SOS priority | integrated ingest torture + mixed SOS/history-failure test | Retained tests exist; runner not executing | CI BLOCKED |
| Server command replay resistance | once current command ID is ACKed, server stops reissuing new nonces for it; Android remains idempotent | Final cross-branch contract run `41562681294` has `steps: null` | CI BLOCKED |
| Retention safety | R2 lifecycle verified; D1 Phase 8 retention contract limits cleanup to intended tables and preserves identity/control/security state | Retained cloud regression exists; runner not executing | CI BLOCKED |
| Backup + destructive restore | restores identity, relationships, replay high-water state and location-control command/ACK; accepts legacy snapshots without control table; canonicalizes identity aliases | Retained destructive restore test exists; runner not executing | CI BLOCKED |
| Production migration/deploy correctness | setup preflights existing identities, applies schema 015 before worker-v9 activation, verifier checks live unique index/schema 15, deploy Actions pinned | Deployment contract exists; runner not executing | CI BLOCKED |
| Android ↔ cloud wire contract | current hardening branches checked together for V2 packet/batch/ACK/safety/command semantics plus replay/deploy contracts | Android run `41562652332` and cloud run `41562681294` both `steps: null` | CI BLOCKED |

## Current external execution condition

At the current code-bearing heads, GitHub created all decisive Phase 8 jobs but repeatedly executed zero steps and exposed no job logs. This same condition affects unrelated Android, emulator, upgrade, recovery, cloud and cross-branch workflows. Therefore no current-head failure can honestly be attributed to Brick source, but none of those workflows can honestly be marked green either.

## Phase 8 completion rule

Phase 8 remains **NOT COMPLETE** until:

1. GitHub Actions actually executes the Android hardening, Device Owner, upgrade, recovery, cloud hardening and final cross-branch workflows and all required jobs are green.
2. The persistent Android signing keystore/certificate fingerprint is configured and a same-certificate update is proven.

Physical OPPO/ColorOS endurance, OEM killing, GNSS/radio/sensor, thermal/battery and multi-day real-device qualification remain Phase 9, not Phase 8.
