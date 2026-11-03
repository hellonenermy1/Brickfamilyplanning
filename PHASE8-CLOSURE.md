# Brick V1 — Phase 8 Closure

Current state: **CODE HARDENING IMPLEMENTED — FORMAL ACCEPTANCE BLOCKED**.

Phase 8 must not be labelled production-qualified from source inspection or from CI configuration alone. Its maximum pre-OPPO state is **INTEGRATION VERIFIED / PHASE 9 READY**, and that state has **not** been reached yet because the required current-head workflows have not executed.

## Code-side hardening now present

Phase 8A contains the Android/device-side reliability, persistence, recovery, retirement, upgrade, command-replay, location/speed/mode correctness, provider isolation, security/privacy and supply-chain gates defined by the Phase 8 contract.

Phase 8B contains the cloud identity/revocation, auth, idempotency, event-time ordering, parent freshness truth, retention, backup/restore, migration/deploy, command replay, mixed SOS/history torture and Android↔cloud contract gates defined by the Phase 8 contract.

The runtime code is frozen unless executed evidence exposes a real defect. Further speculative refactors are not acceptance work.

## Open acceptance blockers

1. **GitHub Actions runner execution:** decisive Android and cloud jobs at the latest code-bearing heads are created as failed jobs with `steps: null` and no job logs. They never reach checkout or any Brick command. See `PHASE8-TEST-EVIDENCE.md` for run IDs. Until the jobs actually execute and pass, Phase 8 is not green.
2. **Persistent Android signing:** the release/export workflow requires the persistent keystore credentials and pinned signing-certificate SHA-256. Those secrets/fingerprint have not been proven, so stable same-certificate release continuity remains an external prerequisite.

## Accepted

No formal Phase 8 acceptance verdict yet. Code/gates being present is not a substitute for executed green evidence.

## Phase 9 handoff

Only after the Phase 8 blockers above are cleared will the final Android source SHA, APK SHA-256/signing certificate, cloud source SHA/deployment identity, migration state and executed acceptance results be frozen here for physical OPPO/ColorOS qualification.

Phase 9 then covers only real-device/OEM behavior: background execution and restart/reboot, GNSS/radio/sensors, ColorOS process killing/background restrictions, thermal/battery behavior, offline/online recovery and multi-day endurance.
