# Brick V1 — Phase 8A Source Register

This register prevents requirement drift and prevents implementation documents from silently redefining the product contract.

## Precedence

Use the highest applicable source in this order:

1. **Latest explicitly approved Brick V1 amendment/master-plan decision.**
2. **Brick V1 Final Product — AI Acceptance Checklist**, as the most complete pre-existing consolidated requirement/acceptance source currently recovered.
3. **Canonical Phase 1 V1 requirement ledger / base V1 contract.**
4. **Original Brick V1 specification / architecture decisions not subsequently superseded.**
5. **Historical phase plans and closure documents.** These are evidence of work performed, not automatic authority to change the V1 contract.
6. **Current code/configuration.** Code is implementation evidence only; it cannot silently redefine a requirement.

When two sources conflict, Phase 8A records the conflict and resolves it by precedence/explicit approval. It is forbidden to select whichever wording happens to match current code.

## Registered sources

### SRC-001 — Latest nine-phase Brick V1 master plan and approved amendments

Source: current approved nine-phase plan / later approved amendments captured in project material.

Role: highest-authority current product amendment source for changed semantics and newly added requirements.

Important additions/changes include:

- measured-position continuity and active reacquisition;
- one-shot parent Location ON/OFF with child override;
- scheduled one-shot Wi-Fi control with child override;
- no persistent desired Location state in normal V1;
- no normal `DISALLOW_CONFIG_LOCATION` / `DISALLOW_CHANGE_WIFI_STATE` enforcement;
- quiet/consolidated notification policy;
- Maintenance & Recovery Console;
- Deep Off with durable snapshot/provenance;
- five-phase deprovisioner and Policy Ledger;
- Fast Live Path and latency instrumentation;
- detailed Singapore MapLibre + OneMap architecture and fallback;
- backend-owned OneMap authenticated enrichment boundary;
- explicit reversible-control/latency/notification-noise qualification.

### SRC-002 — Brick V1 Final Product — AI Acceptance Checklist

Source: `Brick_V1_Final_Product_AI_Acceptance_Checklist.pdf`, Library file `file_0000000067fc8207919ec23e2d735f3a`, version 1.

Pinned PDF SHA-256:

`863218723ba49c93a72d4e5e59854425ac1bf32dbebeeae15bca08db96ea6f5e`

Role: comprehensive consolidated V1 acceptance checklist containing **469 unique audit IDs / 1,876 independent criteria** across the Android app, child UI, positioning/fusion, Atlas, safety/fall/emergency evidence, history, parent portal, backend, security, operations and real-device qualification.

Class totals verified from the full 146-page source:

- 429 mandatory;
- 24 forbidden;
- 14 optional-if-supported;
- 2 future-interface.

Important: this source includes later 23P/23Q requirements that the older Phase 1 ledger does not contain. However, any wording superseded by SRC-001 must be marked amended/superseded rather than followed blindly.

Detailed provenance/counts are stored in `audit/phase8a/PHASE8A_CHECKLIST_SOURCE_INDEX.md`.

### SRC-003 — Canonical Phase 1 V1 requirement ledger

Repository location: `V1_REQUIREMENTS.md` on `v1-p1-contract`.

Role: canonical earlier atomic baseline derived from the base V1 contract/`Yes.docx` project source.

Verified atomic row count: 456, including 15 explicit non-goals.

Treatment: preserve stable IDs as historical traceability where useful, but do not assume this earlier ledger contains later 23P/23Q requirements or overrides SRC-001/SRC-002.

### SRC-004 — Canonical Phase 1 architecture/program records

Repository locations on `v1-p1-contract`:

- `V1_ARCHITECTURE_FREEZE.md`
- `V1_PHASES.md`
- `PHASE1_BASELINE.md`
- `PHASE1_SOURCE_COVERAGE.md`

Role: original module boundaries, invariants, owner phases and anti-omission rules.

### SRC-005 — Original Brick V1 specification / New Brick Chapter

Role: original whole-product feature and reliability specification, including location states, history, durable delivery, Cloudflare architecture, parent UI, exclusions and acceptance rules.

Treatment: authoritative where not refined/superseded by higher-precedence sources.

### SRC-006 — Phase 7 cloud/parent status

Repository: `docs/phase7-status.md` on `v1-p7-cloud-ux`.

Role: implementation/qualification evidence only.

Important: this document describes a card-free development runtime. That development state does not by itself supersede the full V1 cloud architecture contract.

### SRC-007 — Legacy Phase 8 hardening contract/ledger/closure

Repository on `v1-p8-android-hardening`:

- `PHASE8-CONTRACT.md`
- `PHASE8-REQUIREMENTS.md`
- `PHASE8-CLOSURE.md`
- supporting Phase 8 evidence documents.

Role: hardening implementation/evidence and historical Phase 8 status.

Important: old Phase 8A/8B nomenclature in those documents is historical and must not be confused with the current six-part audit program.

### SRC-008 — Current explicit Phase 8A–8F audit program

Role: governs how this audit is performed. It does not add product functionality by itself.

Current meanings:

- 8A Contract & Feature Completeness
- 8B Implementation Reality & Functional Coverage
- 8C Android Deep Audit
- 8D Cloudflare/Backend Deep Audit
- 8E Parent Portal/Browser/UX Deep Audit
- 8F End-to-End/Adversarial/Compliance

## Source integrity rule

If a requirement cannot be traced to a registered authoritative source, it cannot be invented during this audit. If an apparently required behavior is found only in implementation, it is recorded for investigation rather than promoted to the V1 contract without an approved source.

If a lower-precedence source conflicts with a later approved requirement, the conflict is preserved in the conflict ledger and the lower-precedence wording is marked superseded/amended rather than silently rewritten.
