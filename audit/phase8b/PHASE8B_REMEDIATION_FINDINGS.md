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
