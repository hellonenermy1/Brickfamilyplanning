# Brick V1 — Phase 8 Contract

## Purpose

Phase 8 is **Reliability, Security, Privacy & Operational Hardening**. It is not the real OPPO/ColorOS qualification phase and it is not a feature-expansion phase. The exact physical-phone qualification belongs to Phase 9.

Android baseline: `8843bdae902050c8c1fd7e67ed7ac80662d0da93` (`v1-p7-android-ux`).
Cloud baseline: `820fb8974ae185d74b4963b31b18a7fa0eafedf6` (`v1-p7-cloud-ux`).

## Non-negotiable invariants

1. Persist safety/location work before transmit.
2. Delete durable work only after exact acknowledgement.
3. Duplicate/replayed delivery must not create duplicate logical events.
4. Raw observations remain immutable; derived/fused estimates must never rewrite history to look more accurate.
5. Weak evidence must never claim precise GPS-quality certainty.
6. SOS and critical safety work outrank ordinary history/evidence/diagnostics.
7. Optional providers, Atlas and Shizuku may improve Brick but may not become Brick Core single points of failure.
8. Test/beta Device Owner builds remain `android:testOnly="true"`.
9. No beta may contain a phone wipe/factory-reset recovery path.
10. An installable Device Owner beta may not be exported with an ephemeral Actions debug signing identity.
11. Once retirement Stage 1 is durably committed, Brick must never resume normal tracking/recovery.
12. Parent Location control is one-shot: execute, verify, report. Brick must not permanently lock Location settings or continuously fight later user changes.
13. Real OPPO qualification is deferred to Phase 9; Phase 8 may finish only as `INTEGRATION VERIFIED / PHASE 9 READY` until those tests are complete.

## Three-stage beta retirement

### Stage 1 — DISARMED
Durably record `DISARMED` first, then stop tracking and recovery scheduling. Every boot/worker/runtime entry point must fail closed after this state.

### Stage 2 — MANAGEMENT_RELEASED
Remove Brick-created restrictions, relinquish Device Owner/admin, and verify Android reports neither role. A failure leaves Brick disarmed and may be retried idempotently after restart.

### Stage 3 — UNINSTALL_REQUESTED
Only after management release is verified, request Android's package uninstall UI. Cancelling uninstall never reactivates Brick.

The staged escape is local/device-side. It is not an ordinary remote parent command.

## Phase 8 workstreams

- P8.1 Device Owner safety, staged retirement, stable signing and upgrade continuity.
- P8.2 one-shot managed Location control and policy migration repair.
- P8.3 journal/ACK/idempotency crash-boundary fault injection.
- P8.4 priority starvation tests: SOS > critical safety > realtime location > health > evidence/Atlas > diagnostics.
- P8.5 1/7/14-day offline backlog, low-storage and corruption/failure tests.
- P8.6 provider crash/hang isolation and bounded recovery/backoff.
- P8.7 network chaos: offline, Wi-Fi/cellular transitions, DNS/TLS/timeout/429/5xx, lost ACK and reconnect.
- P8.8 command authentication, replay/nonce/expiry/device-binding and Device Owner command torture tests.
- P8.9 Android attack surface, manifest/exported components, Keystore, TLS, intents, pending intents, filesystem and Shizuku allowlist audit.
- P8.10 cloud/parent authentication, authorization, CSRF/origin/session/WebSocket/family isolation/rate-limit tests.
- P8.11 privacy/retention/log-redaction/identifier minimisation audit.
- P8.12 revocation while preserving historical parent data.
- P8.13 real backup + destructive restore proof, not backup-exists claims.
- P8.14 battery, CPU, RAM, wakeup, radio/sensor/network/storage/cloud-operation measurement and budgets.
- P8.15 dependency/supply-chain lock and vulnerability/SDK/permission audit.
- P8.16 cumulative regression, emulator Device Owner lifecycle and upgrade tests.
- P8.17 closure evidence and explicit Phase 9 handoff list.

## Exit rule

Phase 8 is not complete because code compiles or CI is green. Every non-device-dependent requirement needs inspectable evidence. Physical OPPO-only requirements remain explicitly `PHASE 9 DEVICE VERIFICATION` rather than being silently marked passed.
