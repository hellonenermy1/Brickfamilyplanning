# Brick V1 — Phase 8A Duplicate / Conflict / Completeness Validation

## Exact-ID validation

- Current unique requirement IDs: **525**
- Duplicate current IDs: **0**
- Superseded historical IDs retained separately: **3**
- Total normalized working rows including superseded history: **528**

## Exact requirement-text duplication

Normalized exact duplicate current requirement texts: **0**.

## Semantic-overlap screening

A TF-IDF/cosine similarity pass over all 525 current requirement texts found only one pair above the strict 0.72 similarity threshold:

- `SHZ-012` — Location-OFF Shizuku Wi-Fi test
- `SHZ-013` — Location-OFF Shizuku BLE test

This pair is **not a duplicate**: it intentionally tests two separate privileged evidence providers/capabilities (Wi-Fi versus BLE) and both must remain independently qualified.

No other pair exceeded the threshold.

Semantic similarity is only a screening aid; source-precedence/manual reconciliation remains authoritative.

## Supersession validation

Exactly three old checklist requirements are fully superseded:

- `DPM-003` — old persistent prevention of child Location changes;
- `SHZ-007` — old persistent `parentDesiredLocationState` contract;
- `SHZ-020` — old standalone GPS-on status timing contract.

Their current behavior is represented by the one-shot/notification amendments and they remain historical for traceability only.

## Amendment validation

Exactly 14 checklist IDs are `CURRENT — AMENDED` rather than silently rewritten:

- `DPM-002`
- `LOC-008`
- `FUS-001`
- `SHZ-002`
- `SHZ-008`
- `SHZ-009`
- `SHZ-021`
- `REL-010`
- `REL-018`
- `PORT-004`
- `PORT-007`
- `PORT-014`
- `PORT-031`
- `BE-006`

Historical wording remains in the pinned 469-point source; current wording is in `PHASE8A_AMENDED_EXISTING_REQUIREMENTS.md`.

## New-requirement validation

Genuinely additive latest-plan requirements: **59**.

By family:

- `LOC1S`: 2
- `WIFICTL`: 8
- `REACQ`: 7
- `NOTIFY2`: 2
- `MAINT`: 7
- `DEEPOFF`: 5
- `DEPROV`: 5
- `LIVE`: 4
- `MAPSG`: 11
- `ONEMAP`: 7
- `PRIO`: 1

Total: **59**.

The exact latest-plan backlog priority requirement was caught during final reconciliation and added as `PRIO-001`; it was not allowed to hide inside a vague pre-existing safety-priority statement.

## Mandatory/forbidden/optional/future closure

Current class totals:

- MANDATORY: **485**
- FORBIDDEN: **24**
- OPTIONAL-IF-SUPPORTED: **14**
- FUTURE-INTERFACE: **2**

All 24 forbidden rows remain current; none is re-enabled by the newer amendments.

All 14 optional-if-supported rows remain separate and must become PASS/ACCEPTED or `VERIFIED UNSUPPORTED` with target-device evidence where allowed.

Both future-interface rows remain architecture requirements without falsely claiming current hardware support.

## Ownership/dependency/evidence completeness

For all 525 current requirements, the normalized working ledger validates non-empty:

- current requirement text;
- target phase;
- owner subsystem;
- current audit owner;
- dependency mapping;
- expected Android/backend/portal role mapping;
- expected tests/evidence;
- field-test requirement.

Missing owner/dependency/evidence mappings: **0**.

## Latest-plan coverage

Every numbered Phase 1-9 subsection and exit gate in the latest approved master plan maps to:

- a current checklist requirement;
- a current amended requirement;
- a genuinely new requirement;
- or an explicit acceptance matrix attached to those requirements.

Unmapped latest-plan subsections: **0**.

## Contract conflicts

Contract conflicts identified: **11**.

Contract conflicts resolved by source precedence: **11**.

Open semantic contract conflicts: **0**.

Implementation-equivalence questions are intentionally deferred to Phase 8B and are not treated as contract conflicts.

## Remaining source-value gap

Exactly one unresolved source-value gap remains:

`P8A-GAP-002 / LIVE-005` — the authoritative numeric threshold(s) for the referenced `23R P95 latency budget` have not been recovered.

Searches of recovered project sources and prior user-approved context found the requirement to meet a 23R P95 budget, but not explicit user-approved numerical values. Earlier assistant-proposed numbers therefore remain non-authoritative and are not inserted into the contract.

## Validation verdict

Contract coverage/normalization itself is complete except for the single numeric source-value gap above.

Phase 8A must remain **NOT DONE / BLOCKED BY 1 SOURCE GAP** until that value is recovered from an authoritative source or explicitly amended by contract authority.
