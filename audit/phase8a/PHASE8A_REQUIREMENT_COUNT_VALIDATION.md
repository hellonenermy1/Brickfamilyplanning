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
- All current rows have owner subsystem, target phase, audit owner, dependencies, expected tests/evidence and field-test classification.
- All 24 forbidden rows remain current and mapped.
- All 14 optional-if-supported rows remain current and mapped.
- Both future-interface rows remain current and mapped.
- Latest Phase 1–9 subsection coverage has no unmapped subsection.
- 11 identified contract conflicts are resolved at contract level.
- `P8A-GAP-002` is resolved by `PHASE8A_23R_LATENCY_AMENDMENT.md`.
- Open source-value gaps: **0**.

## 23R current values

- accepted current fix -> visible parent marker: P95 <= **1.5 s** under healthy validated connectivity;
- authoritative backend current state -> visible parent marker: P95 <= **500 ms**;
- parent Live Track activation -> phone fast-mode confirmation or explicit failure/degraded result: P95 <= **2.0 s** while online/reachable.

## Reproducibility hashes

- Pinned 469-point checklist PDF SHA-256: `863218723ba49c93a72d4e5e59854425ac1bf32dbebeeae15bca08db96ea6f5e`
- Regenerated normalized 528-row audit ledger SHA-256 after 23R resolution: `8683b85f8b61aa3769b338048e7deb17d1fff3bc7773b6d454c7a61bce013bbd`

The 528-row generated ledger contains 525 current requirements plus 3 superseded historical rows for traceability.

## Final validation result

- Current IDs: 525
- Unique current IDs: 525
- Duplicate current IDs: 0
- Exact duplicate current requirement texts: 0
- Missing owner/dependency/test mappings: 0
- Open source gaps: 0

**COUNT / NORMALIZATION GATE: PASS**
