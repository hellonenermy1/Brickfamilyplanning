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
