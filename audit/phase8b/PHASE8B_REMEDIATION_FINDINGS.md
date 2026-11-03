# Brick V1 — Phase 8B Remediation Findings — Final Status

This ledger records defects discovered during Phase 8B remediation. Every finding below was recorded before its correction and was retested on the remediation branches. The final integrated-candidate gate is recorded separately in the Phase 8B closure.

## P8B-R001 — Android remediation manifest not well-formed XML

**Severity:** P1 HIGH.

**Observed:** `AndroidManifest.xml` used an unescaped ampersand in the Maintenance & Recovery activity label, stopping manifest processing.

**Correction:** label was XML-escaped without changing the visible text.

**Retest:** subsequent Android remediation CI progressed past manifest processing and the independently green Android remediation run `41630440914` completed the full build/unit/lint/AndroidTest/R8/semantic gate.

**Status:** CLOSED.

---

## P8B-R002 — Legacy Location-control regression asserted superseded persistent-command semantics

**Severity:** P2 MEDIUM.

**Observed:** cloud regression expected the old persistent desired-state implementation rather than the frozen one-shot command/history contract.

**Correction:** regression now verifies pending-only delivery, bounded logical/delivery TTL, terminal history, stale-command protection and current actual-state independence after completion.

**Retest:** independently green Cloud remediation run `41630710777` passed the corrected one-shot Location regression together with the full Cloud gate.

**Status:** CLOSED.

---

## P8B-R003 — Android remediation had three Kotlin compile defects

**Severity:** P1 HIGH.

**Observed:** expression-body return in `SafetyOutbox`, WorkManager nullable-array mismatch in `CanaryWorker`, and missing `DiagnosticStore` import in fall runtime.

**Correction:** all three source defects corrected without weakening the affected behavior.

**Retest:** independently green Android remediation run `41630440914` passed debug/release compilation, unit tests, lint, AndroidTest compilation and R8.

**Status:** CLOSED.

---

## P8B-R004 — Cloud history-codec CI omitted compiled module path

**Severity:** P1 HIGH.

**Observed:** regression script requires a compiled codec module but CI invoked it without one.

**Correction:** workflow compiles `src/history-codec.ts` with the locked esbuild toolchain and passes the generated ESM module to the regression.

**Retest:** green Cloud remediation run `41630710777` passed the history codec regression and all later gates.

**Status:** CLOSED.

---

## P8B-R005 — Android instrumentation regression called removed persistent-command helper

**Severity:** P2 MEDIUM.

**Observed:** `Phase8ManagedPolicyInstrumentedTest` referenced the removed `lastConsumedLocationCommandId` helper after production moved to terminal one-shot command history.

**Correction:** instrumentation now checks current command history/terminal status and anti-replay behavior instead of reintroducing persistent desired-state semantics.

**Retest:** green Android remediation run `41630440914` compiled AndroidTest sources and completed the full gate.

**Status:** CLOSED.

---

## P8B-R006 — Cloud live-state ordering regression omitted compiled module path

**Severity:** P1 HIGH.

**Observed:** Phase 5 ordering test required the compiled `live-state-order` module and CI supplied no argument.

**Correction:** workflow compiles `src/live-state-order.ts` to temporary ESM and passes it to the deterministic regression.

**Retest:** green Cloud remediation run `41630710777` passed live-state ordering and every subsequent Cloud gate.

**Status:** CLOSED.

---

## Original remediation finding result

- Findings recorded: **6**
- Closed: **6**
- Open: **0**

Additional source-level defects discovered after those independently green runs are tracked in `PHASE8B_POST_CI_SOURCE_FINDINGS.md`; all are closed at source level on the final integrated candidate.
