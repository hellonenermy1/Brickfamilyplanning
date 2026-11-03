# Brick V1 — Phase 8B Findings 001–012 — Final Status

These findings were raised against the original Phase 8B implementation baseline. Their original evidence remains preserved in Git history. This file records their post-remediation status against the final integrated candidate `204a141e90c078b6c2008778bd6c01bcbb8a4622`.

`CLOSED AT SOURCE` means the implementation/reachability defect identified by 8B is corrected. It does **not** mean device/browser/production acceptance is complete; applicable requirements remain `IMPLEMENTED — UNVERIFIED` until the owning 8C–8F/Phase 9 evidence exists.

| Finding | Severity | Original defect | Final source status |
|---|---|---|---|
| P8B-001 | P1 | Android was disposable test/beta build | **CLOSED AT SOURCE** — production manifest no longer testOnly; V1 RC identity/BRICK_BETA=false; permanent signing identity retained. |
| P8B-002 | P1 | diagnostics/retirement exposed as second launcher | **CLOSED AT SOURCE** — one launcher only; Maintenance console is non-exported/local hidden-entry surface. |
| P8B-003 | P1 | current Maintenance & Recovery Console absent | **CLOSED AT SOURCE** — exact hidden entry, truthful state/timeline, one-shot actions and privacy-reduced export are wired. |
| P8B-004 | P1 | provenance-aware Deep Off absent | **CLOSED AT SOURCE** — durable quiescence/provenance/reboot persistence/reactivation rules implemented. |
| P8B-005 | P1 | five-stage deprovisioner / Policy Ledger incomplete | **CLOSED AT SOURCE** — current five-stage deprovision manager and Policy Ledger wired. |
| P8B-006 | P1 | stale persistent desired Location semantics | **CLOSED AT SOURCE** — pending→terminal one-shot lifecycle; completed command becomes history and later child state is current truth. |
| P8B-007 | P1 | active reacquisition incomplete / stale fallback race | **CLOSED AT SOURCE** — bounded refresh/subscription repair/current-fix path plus generation freshness guard implemented. |
| P8B-008 | P1 | OneMap-first Singapore provider contract absent | **CLOSED AT SOURCE** — MapLibre/OneMap primary, backend auth boundary, cache/rate/retry and fallback path implemented. |
| P8B-009 | P1 | scheduled one-shot Wi-Fi absent | **CLOSED AT SOURCE** — local durable schedules, grace/reboot/time-zone handling, safety deferral, child override and phone-confirmed result wired. |
| P8B-010 | P1 | fall detection / Emergency Evidence Bundle absent | **CLOSED AT SOURCE** — multi-signal inference, LOW/MEDIUM/HIGH handling, protected evidence and parent event path implemented; no emergency-services dispatch added. |
| P8B-011 | P2 | no ordinary JVM P8B unit-test source | **CLOSED** — real host-side Maintenance state-machine test is present and executed by Android CI. |
| P8B-012 | P1 | cloud config advertised beta/test app identity | **CLOSED AT SOURCE** — production Wrangler current app version matches the V1 RC candidate. |

## Result

- Findings in this file: **12**
- Source-level closed: **12**
- Open source defects: **0**

See `PHASE8B_REMEDIATION_FINDINGS.md` and `PHASE8B_POST_CI_SOURCE_FINDINGS.md` for defects discovered during remediation/retest itself.