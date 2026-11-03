# Brick V1 — Phase 8A Ledger Status

This file exists to prevent accidental double-counting or treating exploratory audit artifacts as the final contract.

## Canonical current starting point

The current Phase 8A contract reconstruction starts from:

1. **469 unique checklist IDs** in `Brick_V1_Final_Product_AI_Acceptance_Checklist.pdf` (`SRC-002`), then
2. applies **higher-precedence later approved amendments** from the current nine-phase master plan (`SRC-001`).

The 469-point checklist is not itself final where its wording conflicts with later amendments.

## Historical / supporting ledgers

### Phase 1 `V1_REQUIREMENTS.md`

- 456 atomic rows including 15 explicit non-goals.
- Important historical/base traceability source.
- Not the final whole-product contract because it predates later 23P/23Q material.

### `PHASE8A_REQUIREMENT_AMENDMENTS.md`

- 88 atomic latest-amendment candidates generated before the 469 checklist was recovered.
- Useful source-preserving overlay.
- **Not additive by simple arithmetic**: some rows replace/amend existing checklist IDs, while others are genuinely new.
- Must be reconciled ID-by-ID against the 469 baseline before final count.

### `PHASE8A_REQUIREMENT_AMENDMENTS_R2.md`

- 112 exploratory atomized rows created while the older 456-row ledger appeared to be the broadest available source.
- After recovering the final 469-point checklist, many Round-2 rows are already represented there (EvidenceObservation, provider interface, sensor health, release/APK checks, qualification matrices, etc.).
- Therefore **Round 2 is NON-CANONICAL WORKING EVIDENCE** and must never be added numerically to the current contract.
- Any Round-2 detail not represented by either the 469 checklist or the current latest-amendment overlay is re-evaluated explicitly before adoption.

## Forbidden arithmetic

The following is wrong and must never appear as a V1 requirement count:

`456 + 88 + 112 + 469`

Those sources substantially overlap.

## Current reconciliation facts

- Final checklist IDs recovered: 469/469 unique.
- Checklist class totals: 429 mandatory, 24 forbidden, 14 optional-if-supported, 2 future-interface.
- Phase 1 base rows: 456 historical rows.
- Latest-amendment candidate IDs: 88.
- Contract conflicts identified/resolved so far: 11.
- Open source gaps: 1 (`23R` numeric P95 budget).
- Checklist contains later 23P/23Q requirements absent from Phase 1, including fall/emergency evidence, System Truth/self-healing, multi-device portal and other later requirements.
- Latest master plan contains newer requirements absent/stale in the 469 checklist, especially one-shot Location semantics, scheduled Wi-Fi, active reacquisition, Maintenance/Deep Off/deprovision, Fast Live Path specifics and OneMap-first Singapore map architecture.

## Phase 8A closure rule

Do not publish a final unique current V1 requirement count until:

1. all 469 checklist IDs have been classified `CURRENT`, `CURRENT — AMENDED`, or `SUPERSEDED`;
2. every latest master-plan clause has a mapping to an existing checklist ID or a new current amendment ID;
3. all explicit forbidden/non-goal rows remain mapped and regression-owned;
4. all source conflicts are resolved;
5. all source gaps are resolved or explicitly amended by the user/contract authority;
6. the final dependency/owner/acceptance mapping has no unmapped current requirement.

Until then, Phase 8A status is `IN PROGRESS`, never PASS.
