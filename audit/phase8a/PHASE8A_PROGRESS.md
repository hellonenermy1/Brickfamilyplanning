# Brick V1 — Phase 8A Progress Checkpoint

Status: **IN PROGRESS — NOT PASS**

Checkpoint date: 2026-11-03

## Completed in this checkpoint

- Frozen exact repository/branch heads used to begin the audit.
- Created isolated `v1-p8a-contract-audit` branch from the frozen audit-progress head.
- Established explicit requirement-source precedence.
- Verified the older Phase 8 hardening ledger is only a 39-item hardening ledger, not the full V1 contract.
- Counted the old Phase 1 V1 ledger at 456 atomic rows including 15 explicit non-goals.
- Recovered and pinned the 146-page `Brick_V1_Final_Product_AI_Acceptance_Checklist.pdf`.
- Machine-verified its exact 469 unique audit IDs and class totals:
  - 429 mandatory
  - 24 forbidden
  - 14 optional-if-supported
  - 2 future-interface
- Verified the checklist states 1,876 independent pass criteria.
- Confirmed the checklist includes later 23P/23Q requirements missing from the old 456-row Phase 1 ledger, including fall/emergency evidence and later reliability/system behavior.
- Reconciled the latest nine-phase master plan against the 469 checklist at subsection level.
- Identified the genuine newer amendment areas absent/stale in the checklist:
  - one-shot Location control + child override;
  - scheduled one-shot Wi-Fi;
  - active measured-position reacquisition;
  - current notification/disclosure rules;
  - Maintenance & Recovery Console;
  - Deep Off;
  - five-stage deprovisioner/Policy Ledger;
  - Fast Live Path specifics;
  - Singapore OneMap-first map/provider behavior;
  - updated parent Location presentation;
  - reversible-control/latency/notification acceptance criteria.
- Identified and contract-resolved 11 conflicts/supersessions so far.
- Reconciled all 24 forbidden rows: none is legitimately re-enabled by the latest amendments.
- Reconciled all 14 optional-if-supported and 2 future-interface rows.
- Resolved the original fall-definition source gap from the final checklist (`SAFE-007..018`).
- Removed a malformed manually imported CSV rather than allowing bad audit evidence to remain in the branch.

## Current open blocker

`P8A-GAP-002` — the latest approved text requires meeting the `23R P95 latency budgets`, but the recovered authoritative files do not state the numeric P95 threshold(s). Earlier proposed numbers are not promoted to contract values without explicit source evidence.

This is a contract/source ambiguity, not an implementation failure.

## Deliberately not claimed yet

- No final unique current V1 requirement count yet.
- No implementation coverage/pass percentage yet.
- No Android/Cloudflare/portal feature marked PASS from this audit yet.
- No production qualification claim.

Those would be premature until current-ID normalization and then Phase 8B implementation mapping.

## Remaining Phase 8A closure work

1. Normalize each of the 469 checklist IDs into `CURRENT`, `CURRENT — AMENDED`, or `SUPERSEDED`.
2. Assign stable current IDs to genuinely additive latest amendments without duplicating checklist semantics.
3. Freeze one unique current requirement ledger/count.
4. Map every current requirement to owner subsystem/phase and acceptance/evidence target.
5. Ensure every explicit forbidden/optional/future item remains represented in that final ledger.
6. Resolve `P8A-GAP-002` from an authoritative source or explicit contract amendment.
7. Produce Phase 8A closure report only if unresolved requirements/conflicts/source gaps reach zero.

Until those gates pass, Phase 8A remains **IN PROGRESS**.
