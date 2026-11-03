# Brick V1 — Phase 8A Source Register

This register prevents requirement drift and prevents implementation documents from silently redefining the product contract.

## Precedence

Use the highest applicable source in this order:

1. **Latest explicitly approved Brick V1 amendment/master-plan decision.**
2. **Base V1 requirements contract (`Yes.docx` as captured by the canonical Phase 1 ledger).**
3. **Original Brick V1 specification / architecture decisions not subsequently superseded.**
4. **Historical phase plans and closure documents.** These are evidence of work performed, not automatic authority to change the V1 contract.
5. **Current code/configuration.** Code is implementation evidence only; it cannot silently redefine a requirement.

When two sources conflict, Phase 8A must record the conflict and its resolution. It is forbidden to choose whichever wording matches current code.

## Registered sources

### SRC-001 — Canonical Phase 1 V1 requirement ledger

Repository location: `V1_REQUIREMENTS.md` on `v1-p1-contract`.

Role: canonical atomic baseline derived from `Yes.docx` project file version 1.

Treatment: preserve stable IDs where wording remains current. Mark old IDs `SUPERSEDED` when later approved semantics replace them; do not silently rewrite history.

### SRC-002 — Canonical Phase 1 architecture/program records

Repository locations on `v1-p1-contract`:

- `V1_ARCHITECTURE_FREEZE.md`
- `V1_PHASES.md`
- `PHASE1_BASELINE.md`
- `PHASE1_SOURCE_COVERAGE.md`

Role: original module boundaries, invariants, owner phases and anti-omission rules.

### SRC-003 — Original Brick V1 specification / New Brick Chapter

Role: original whole-product feature and reliability specification, including location states, history, durable delivery, Cloudflare architecture, parent UI, exclusions and acceptance rules.

Treatment: authoritative unless a later approved amendment changes a requirement.

### SRC-004 — Latest nine-phase Brick V1 master plan and approved amendments

Role: highest-authority currently captured product amendment source for changed semantics and newly added requirements.

Important additions/changes include:

- measured-position continuity and active reacquisition;
- one-shot parent Location ON/OFF with child override;
- scheduled one-shot Wi-Fi control with child override;
- no persistent desired Location state in normal V1;
- no `DISALLOW_CONFIG_LOCATION` in normal V1;
- quiet/consolidated notification policy;
- Maintenance & Recovery Console;
- Deep Off with durable snapshot/provenance;
- five-phase deprovisioner and Policy Ledger;
- Fast Live Path and latency instrumentation;
- detailed Singapore MapLibre + OneMap architecture and fallback;
- backend-owned OneMap authenticated enrichment boundary;
- explicit reversible-control/latency/notification-noise qualification.

### SRC-005 — Phase 7 cloud/parent status

Repository: `docs/phase7-status.md` on `v1-p7-cloud-ux`.

Role: implementation/qualification evidence only.

Important: this document explicitly describes a card-free development runtime. That development state does not by itself supersede the V1 cloud architecture contract.

### SRC-006 — Legacy Phase 8 hardening contract/ledger/closure

Repository on `v1-p8-android-hardening`:

- `PHASE8-CONTRACT.md`
- `PHASE8-REQUIREMENTS.md`
- `PHASE8-CLOSURE.md`
- supporting Phase 8 evidence documents.

Role: hardening implementation/evidence and historical Phase 8 status.

Important: old Phase 8A/8B nomenclature in those documents is historical and must not be confused with the current six-part audit program.

### SRC-007 — Current explicit Phase 8A–8F audit program

Role: governs how this audit is performed. It does not add product functionality by itself.

Current meanings:

- 8A Contract & Feature Completeness
- 8B Implementation Reality & Functional Coverage
- 8C Android Deep Audit
- 8D Cloudflare/Backend Deep Audit
- 8E Parent Portal/Browser/UX Deep Audit
- 8F End-to-End/Adversarial/Compliance

## Source integrity rule

If a requirement cannot be traced to a registered authoritative source, it cannot be invented during this audit. If an apparently required behavior is found only in implementation, it must be recorded for investigation rather than promoted to the V1 contract without an approved source.
