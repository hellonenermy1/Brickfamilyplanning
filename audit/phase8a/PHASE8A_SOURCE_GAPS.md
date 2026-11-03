# Brick V1 — Phase 8A Source-Level Gap Register

These are not implementation bugs. They are places where the authoritative source set is/was not specific enough for Phase 8A to invent an answer safely.

## P8A-GAP-001 — `HIGH-fall` / `fall events` atomic contract definition

**Original problem:** the latest master plan referenced `SOS/HIGH-fall critical emergency handling` and fall-event map overlays, while the older Phase 1 ledger stopped before the later 23P/23Q material and therefore had no complete fall requirement family.

**Resolution source:** `Brick_V1_Final_Product_AI_Acceptance_Checklist.pdf` (`SRC-002`) contains the later safety contract explicitly:

- `SAFE-007` multi-signal/context fall inference; not one accelerometer spike;
- `SAFE-008` LOW/MEDIUM/HIGH confidence unless a numeric model is statistically calibrated;
- `SAFE-009` LOW normally logs only/no spam;
- `SAFE-010` MEDIUM is prominent in parent portal with optional notification according to parent settings;
- `SAFE-011` HIGH notifies parent with time, movement since event, position/quality and quick actions;
- `SAFE-012` no frightening routine child fall popup;
- `SAFE-013` FORBIDDEN automatic emergency-services dispatch from fall inference in V1;
- `SAFE-014` false-positive qualification across phone drops, bag movement, sport, stairs and daily movement;
- `SAFE-015..018` protected Emergency Evidence Bundle trigger/content/privacy/offline durability.

**Status:** `RESOLVED`.

**Audit rule:** these checklist requirements remain current unless a higher-precedence later amendment explicitly changes them. Do not reconstruct a different fall algorithm from implementation convenience.

---

## P8A-GAP-002 — Exact numeric `23R` P95 Fast Live Path budget not recovered

**Evidence:** the latest master plan repeatedly requires the Live Track pipeline to meet the `23R P95 latency budgets` and requires instrumentation of source age, persist time, phone send delay, backend delay, WebSocket delay and render delay.

**Search result:** the current master-plan material and the recovered 469-point acceptance checklist preserve the requirement to measure/prove the Fast Live Path but do not provide the actual numeric P95 threshold(s) in the recovered authoritative text.

**Problem:** Phase 8A has no source-backed numeric millisecond/second value it can safely place into the current contract.

**Audit rule:** preserve the requirement to instrument and measure the 23R P95 budget, but **do not invent a numeric threshold from memory or engineering preference**.

**Status:** `OPEN SOURCE GAP`.

**Required resolution:** locate the authoritative 23R numeric budget before its Phase 9 acceptance criterion can be frozen. If the original source genuinely never fixed a number, that ambiguity must be explicitly resolved as a contract amendment rather than guessed by the auditor.

---

## P8A-GAP-003 — Legacy Phase 8 closure document is not a valid current Phase 8A completion source

**Evidence:** the repository's legacy `PHASE8-CLOSURE.md` records an older state and uses old 8A/8B nomenclature. Later project work created the permanent release-signing identity and the current audit program has explicitly redefined Phase 8A–8F.

**Problem:** using the legacy closure document as current program status would be stale and would collide with the newly defined six-part audit meanings.

**Status:** `RESOLVED FOR CONTRACT AUDIT`.

**Rule:** treat it only as historical implementation evidence. Phase 8B/8C will establish the current implementation/release evidence from exact current commits/workflows/artifacts.

---

## P8A-GAP-004 — Older Phase 1 ledger is not the final whole-product contract

**Discovery:** the 456-row Phase 1 ledger stops at the earlier specification coverage and misses later 23P/23Q requirements that are explicitly present in the final 469-point acceptance checklist, including fall/emergency evidence, additional System Truth/self-healing behavior, multi-device portal behavior and other later features.

**Status:** `RESOLVED`.

**Rule:** the Phase 1 ledger is retained for traceability, but Phase 8A uses the 469-point checklist as the comprehensive checklist baseline, then applies the higher-precedence latest master-plan amendments/supersessions.

---

## Closure impact

Current unresolved source gaps: **1** (`P8A-GAP-002`).

Phase 8A may continue, but it does **not** receive final PASS while that ambiguity remains unless it is explicitly resolved by an authoritative source/amendment.
