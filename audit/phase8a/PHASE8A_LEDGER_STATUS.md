# Brick V1 — Phase 8A Ledger Status

Status: **FINAL / PASS**

This file prevents accidental double-counting and identifies the authoritative reconstruction of the Brick V1 contract after Phase 8A.

## Canonical reconstruction

1. Start from the pinned **469 unique checklist IDs** in `Brick_V1_Final_Product_AI_Acceptance_Checklist.pdf` (`SRC-002`).
2. Mark exactly 3 historical rows superseded: `DPM-003`, `SHZ-007`, `SHZ-020`.
3. Apply current wording to the 14 existing IDs listed in `PHASE8A_AMENDED_EXISTING_REQUIREMENTS.md`.
4. Add exactly 59 genuinely additive requirements from the current `PHASE8A_NEW_01...07` files.
5. Apply `PHASE8A_23R_LATENCY_AMENDMENT.md` to resolve the formerly missing numeric 23R budget.
6. Preserve all 24 forbidden, all 14 optional-if-supported and both future-interface requirements.

## Final count

- Current unique V1 requirements: **525**
- Mandatory: **485**
- Forbidden: **24**
- Optional-if-supported: **14**
- Future-interface: **2**
- Superseded historical rows retained for traceability: **3**
- Total normalized working rows including superseded history: **528**

## Historical / supporting ledgers

### Phase 1 `V1_REQUIREMENTS.md`

456 historical atomic rows including 15 explicit non-goals. Important traceability source, but not the final contract because it predates later 23P/23Q content.

### `PHASE8A_REQUIREMENT_AMENDMENTS.md`

88 early amendment candidates created before the 469-point checklist was recovered. This is supporting working evidence only; it is not additive to the final count.

### `PHASE8A_REQUIREMENT_AMENDMENTS_R2.md`

112 exploratory rows created before the final checklist was recovered. Many duplicate checklist semantics. NON-CANONICAL working evidence only.

## Forbidden arithmetic

Never calculate the contract as:

`456 + 88 + 112 + 469`

Those sources overlap substantially.

## Final validation facts

- 469/469 baseline IDs classified.
- Current IDs: 525/525 unique.
- Exact duplicate current requirement texts: 0.
- Contract conflicts: 11 identified / 11 resolved.
- Unmapped latest-plan subsections: 0.
- Missing owner/dependency/test mappings: 0.
- Open source gaps: 0.
- Regenerated normalized ledger SHA-256: `8683b85f8b61aa3769b338048e7deb17d1fff3bc7773b6d454c7a61bce013bbd`.

## 23R resolved values

- accepted fix -> visible parent marker P95 <= **1.5 s**;
- backend current state -> visible parent marker P95 <= **500 ms**;
- Live Track activation -> phone fast-mode confirmation/explicit failure P95 <= **2.0 s**.

## Result

**PHASE 8A CONTRACT LEDGER: FROZEN / PASS**

Implementation existence, wiring and production configuration are intentionally not claimed here; those begin in Phase 8B.