# Brick V1 — Phase 8B Remediation Findings

This ledger records defects discovered while retesting Phase 8B remediation branches. Findings are written before the corresponding fix and require a separate fix commit plus CI retest evidence.

## P8B-R001 — Android remediation manifest is not well-formed XML

**Severity:** P1 HIGH — remediation branch cannot build, so no Android remediation requirement can be promoted to CI-verified state.

**Observed baseline:** `v1-p8b-remediation-android` at `32020e3f7bec32e9cb392ba50fcdcc9d4f1497ea`.

**Evidence:** GitHub Actions run `41623243261`, Gradle diagnostic artifact `13225130924` (`sha256:43fc4bacd8efc7fe22a2c5c3e8be0a4ea1a975da7c41b994a73d477e72c72442`). Task `:app:processDebugMainManifest` fails before Kotlin compilation. The manifest merger reports `SAXParseException` at line 60, column 47: `The entity name must immediately follow the '&' in the entity reference.`

**Actual source:** `app/src/main/AndroidManifest.xml` declares the local maintenance activity label as `Brick Maintenance & Recovery`; the raw ampersand is illegal in an XML attribute value.

**Expected:** production manifest must be well-formed and pass manifest processing for debug/release variants.

**Impact:** Android build, unit tests, lint, AndroidTest compilation, R8, and subsequent 8B semantic/dead-code gates cannot execute.

**Required correction:** XML-escape the label while preserving the user-visible text; then rerun the full Phase 8B Android remediation CI without weakening any gate.

**Status:** OPEN — finding recorded before fix.

---

## P8B-R002 — Legacy Location-control regression asserts superseded persistent-command implementation details

**Severity:** P2 MEDIUM — CI regression gate is stale and prevents valid current one-shot implementation from being retested to completion.

**Observed baseline:** `v1-p8b-remediation-cloud` at `ef23440638912e527e7bc9ab3fe5c1ded4c1b69b`.

**Evidence:** GitHub Actions run `41623766414` passes setup, `npm ci`, full TypeScript typecheck, parent asset build, production/P8B wiring, and all D1 migrations, then fails in `Existing deterministic regression tests`. Static evaluation of `scripts/test-phase8-location-control-contract.mjs` against the same SHA proves its first obsolete assertion: the script requires literal `expiresAtMs: now + DELIVERY_TTL_MS`, while current `src/phase6-location-control.ts` intentionally uses `Math.min(row.issued_at + LOGICAL_COMMAND_TTL_MS, now + DELIVERY_TTL_MS)` so delivery can never outlive the one-shot logical command. The same legacy test also expects the old conditional-ACK SQL string rather than the current command-ID-bound completion update.

**Expected:** regression tests must enforce the current Phase 8A one-shot Location contract: pending command only, bounded logical/delivery TTL, completed/failed/expired becomes history, authenticated current-state reporting continues independently, delayed/stale command completion cannot complete a newer command, and no persistent desired-vs-actual reconciliation after completion.

**Impact:** a superseded test can incorrectly force production code back toward the obsolete persistent-desired-state model or leave cloud CI red despite the current contract being implemented.

**Required correction:** rewrite the Location-control regression around current semantics and invariant ordering rather than superseded exact implementation strings; retain parent auth, lifecycle/revocation, same-origin mutation, replay resistance, device binding and bounded TTL checks.

**Status:** OPEN — finding recorded before test correction.

---

## P8B-R003 — Android remediation has three Kotlin compile defects after manifest repair

**Severity:** P1 HIGH — both debug and release Kotlin compilation fail, so Android remediation cannot be CI-verified.

**Observed baseline:** `v1-p8b-remediation-android` at `212f6dab0259e2f99a90b4107cf95955ab43708a`.

**Evidence:** GitHub Actions run `41623945320`, Gradle diagnostic artifact `13224518762` (`sha256:3015672af2a08bdd77050625b1b2c05e7a822504a803cf0493ba4de812273d3c`). Manifest processing now passes and 91 Gradle tasks execute before `:app:compileDebugKotlin` / `:app:compileReleaseKotlin` fail with exactly these source errors:

1. `SafetyOutbox.kt:93:27` — `Returns are prohibited in functions with expression body`; `ack()` uses `return false` inside an expression-bodied `try`.
2. `CanaryWorker.kt:77:67` — WorkManager `putStringArray` expects `Array<String?>`, while remediation passes `Array<String>` under the current Kotlin/AndroidX type signatures.
3. `FallDetectorRuntime.kt:149` — unresolved `DiagnosticStore` references because the diagnostics class is used without its package import.

**Expected:** remediation source must compile cleanly for debug and release before unit/lint/androidTest/R8 or semantic gates can be credited.

**Required correction:** convert `SafetyOutbox.ack()` to a block body without non-local return from expression body; supply the nullable string array type expected by WorkManager without changing values; import the real diagnostics store in fall runtime. Then rerun the unchanged full Android CI.

**Status:** OPEN — finding recorded before fix.

---

## P8B-R004 — Cloud history-codec CI gate omits the compiled codec module path

**Severity:** P1 HIGH — cloud remediation CI stops before the remaining deterministic regressions and production dry-run can execute.

**Observed baseline:** `v1-p8b-remediation-cloud` at `3adfa9ae1a38f9efd54e292a4fe3f471fead5bd1`.

**Evidence:** GitHub Actions run `41624281473` passes locked dependency install, full TypeScript typecheck, parent asset build, production/P8B wiring and all D1 migrations, then fails at `Regression — history codec`; every later regression and Wrangler dry-run is skipped. `scripts/test-history-codec.mjs` requires `process.argv[2]` and throws `Pass compiled codec module path` when absent, while `.github/workflows/v1-phase8b-remediation-cloud-ci.yml` invokes it as `node scripts/test-history-codec.mjs` with no build step or module path.

**Expected:** the history regression must execute against compiled `src/history-codec.ts` output without changing production semantics, and failure of the test itself—not missing test setup—must govern the gate.

**Required correction:** compile `src/history-codec.ts` into a temporary ESM test module using the already locked toolchain, pass that path to `scripts/test-history-codec.mjs`, and leave all later cloud gates intact.

**Status:** OPEN — finding recorded before CI correction.

---

## P8B-R005 — Android instrumentation regression still calls removed persistent-command helper

**Severity:** P2 MEDIUM — production Kotlin now compiles, but the AndroidTest source is stale and blocks the full Gradle verification gate.

**Observed baseline:** `v1-p8b-remediation-android` at `672d7f231ae7c410a0250e606ca0d4040bf7be84`.

**Evidence:** GitHub Actions run `41624581508`, Gradle diagnostic artifact `13224104823` (`sha256:935fd8a2d90e6760b9eab5de67907512a3c3eb095218ae6d2649dcff4219e8d0`). Debug and release production Kotlin compilation complete, then `:app:compileDebugAndroidTestKotlin` fails at `Phase8ManagedPolicyInstrumentedTest.kt` lines 71, 97 and 118 because `ManagedPolicy.lastConsumedLocationCommandId` no longer exists. Current production code exposes `ManagedPolicy.lastLocationCommand(context)` and stores one-shot command history with status rather than a persistent consumed-ID policy helper.

**Expected:** instrumentation regression must verify current one-shot behavior: a command is attempted at most once, repeated supervisor applies do not replay it, the command remains history with its ID and terminal status, and inherited Phase 7 commands migrate to completed history without replay.

**Required correction:** update only the stale instrumentation assertions to read current command history and terminal status; do not reintroduce the removed helper or persistent desired-state semantics.

**Status:** OPEN — finding recorded before test correction.
