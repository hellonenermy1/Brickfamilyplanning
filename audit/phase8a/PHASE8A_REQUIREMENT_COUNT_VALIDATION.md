# Brick V1 — Phase 8A Requirement Count & Validation

## Current contract count

- Pinned checklist baseline: **469** unique IDs
- Explicitly superseded historical baseline IDs: **3** (`DPM-003`, `SHZ-007`, `SHZ-020`)
- Remaining current baseline IDs: **466**
- Genuinely additive latest-plan requirements: **59**
- **Final current unique V1 requirements: 525**

Current class totals:

- MANDATORY: **485**
- FORBIDDEN: **24**
- OPTIONAL-IF-SUPPORTED: **14**
- FUTURE-INTERFACE: **2**

## Validation gates

- All 469 baseline IDs classified.
- All current rows have owner subsystem, target phase, audit owner, dependencies, expected tests/evidence, and field-test classification.
- All 24 forbidden rows remain current and mapped.
- All 14 optional-if-supported rows remain current and mapped.
- Both future-interface rows remain current and mapped.
- Latest Phase 1–9 subsection coverage has no unmapped subsection.
- 11 identified contract conflicts are resolved at contract level.
- Exactly one source-value gap remains: `LIVE-005` / `P8A-GAP-002` numeric 23R P95 threshold(s).

## Reproducibility hashes

- Pinned 469-point checklist PDF SHA-256: `863218723ba49c93a72d4e5e59854425ac1bf32dbebeeae15bca08db96ea6f5e`
- Generated full normalized 528-row audit ledger SHA-256: `d012f6a3e8df7491ffa8207240d7c53a9f48d5b65e585aab0d83f86497fcc614`

The 528-row generated ledger contains 525 current requirements plus the 3 superseded historical rows for traceability.
