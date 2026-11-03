# Brick V1 — Phase 8B Final 525-Requirement Rescore

## Frozen implementation candidate

Branch: `v1-p8b-integrated-candidate`

SHA: `204a141e90c078b6c2008778bd6c01bcbb8a4622`

This is one integrated implementation tree containing the Android and Cloud/parent remediation histories. It replaces the earlier split-baseline Phase 8B implementation assessment.

## Final CI evidence on the exact same SHA

- Android Phase 8B remediation CI: run **41635204427** — **SUCCESS**.
  - dependency-lock stability;
  - debug/release compilation;
  - JVM unit tests;
  - AndroidTest compilation;
  - lint debug/release;
  - release/R8 build;
  - production manifest/launcher/release semantics;
  - current one-shot/maintenance/PIN source wiring;
  - no obvious production placeholders.
- Cloud Phase 8B remediation CI: run **41635203816** — **SUCCESS**.
  - locked npm install;
  - full TypeScript typecheck;
  - parent asset build;
  - production P8B route/config wiring;
  - all D1 migrations on a clean database;
  - history codec and live ordering regressions;
  - one-shot Location regression;
  - fallback PIN security contract;
  - parent truth/Explain-Location/map control contract;
  - parent-origin security;
  - SOS priority;
  - privacy audit;
  - Wrangler production dry-run;
  - production placeholder/fake-handler scan.

## Deterministic rescore method

The original `verdicts_A.csv` through `verdicts_E.csv` remain the historical pre-remediation 525-row ledger.

Final status is reconstructed by:

1. starting from those 525 historical rows;
2. applying the exactly **104** requirement overrides in `PHASE8B_FINAL_RESCORE_OVERRIDES.csv`;
3. leaving every other historical row unchanged.

No requirement is dropped or renumbered.

## Final verdict counts

| Verdict | Count |
|---|---:|
| IMPLEMENTED | 2 |
| IMPLEMENTED — UNVERIFIED | 496 |
| INTENTIONALLY REMOVED — VERIFIED | 24 |
| MISSING — OPTIONAL / NON-BLOCKING AT 8B | 3 |
| PARTIAL | 0 |
| BROKEN | 0 |
| UNREACHABLE | 0 |
| UNKNOWN | 0 |
| **TOTAL** | **525** |

Mandatory current requirements in `MISSING`, `BROKEN`, `PARTIAL`, `UNREACHABLE` or `UNKNOWN`: **0**.

## Three remaining optional source omissions

These remain deliberately unpromoted because Phase 8B does not invent support:

- `HIS-019` — optional conservative flight inference;
- `HIS-020` — optional landing/arrival notice associated with that optional flight capability;
- `SEC-012` — optional mTLS defense-in-depth.

Their absence does not block the V1 Phase 8B source-implementation gate. Later audit must either prove supported end-to-end or retain honest unsupported/optional state as permitted by the frozen contract.

## Meaning of `IMPLEMENTED — UNVERIFIED`

This is intentionally not `PASS` or `ACCEPTED`.

It means Phase 8B found a real, reachable source/config implementation matching the current requirement closely enough to proceed to its owning deep audit. It still requires applicable proof in:

- Phase 8C Android deep audit;
- Phase 8D Cloudflare/backend deep audit;
- Phase 8E parent portal/browser/UX deep audit;
- Phase 8F full-system/adversarial audit;
- Phase 9 real OPPO and production qualification.

Examples still requiring later proof include battery/resource behavior, actual Android/ColorOS capability behavior, real device-owner/Shizuku behavior, physical fall false positives, Wi-Fi schedule execution on target devices, 23R measured P95 latency, OneMap production credentials/provider behavior, real browser interaction and endurance/reboot/offline tests.

## Forbidden paths

All 24 forbidden requirements remain `INTENTIONALLY REMOVED — VERIFIED` at inspected source/config level. The remediation did not re-enable generic Shizuku shell, public crowdsourced tracking, camera/microphone/EXIF localization, root/custom-ROM dependency, unrelated ad/analytics SDKs, automatic emergency-services dispatch, family-car tracking, permanent normal 1-second tracking or fake precision.

These negatives are rechecked at packaged/runtime/network level in later phases.

## Rescore verdict

**PHASE 8B IMPLEMENTATION REALITY SOURCE GATE: PASS.**

There are zero mandatory source-level missing/broken/partial/unreachable/unknown requirements on the frozen integrated candidate.
