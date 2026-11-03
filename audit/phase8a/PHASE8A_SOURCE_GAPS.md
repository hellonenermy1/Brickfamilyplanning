# Brick V1 — Phase 8A Source-Level Gap Register

These are not implementation bugs. They are places where the recovered authoritative source set was not specific enough for Phase 8A to invent an answer silently.

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

---

## P8A-GAP-002 — Exact numeric `23R` P95 Fast Live Path budget

**Original problem:** the master plan repeatedly required the Live Track pipeline to meet the `23R P95 latency budgets`, but exhaustive recovery of project files/history found no historically approved numeric threshold. The earlier ~1.5 s / ~500 ms values were assistant engineering proposals rather than a separately approved historical source.

**Resolution:** Phase 8A resolves the ambiguity through the explicit engineering contract amendment `PHASE8A_23R_LATENCY_AMENDMENT.md`. This is intentionally recorded as a new current contract decision rather than falsely attributed to the historical source.

Current V1 release budgets:

- accepted current fix -> corresponding visible parent marker: **P95 <= 1.5 s** under healthy validated connectivity;
- authoritative backend current-state update -> corresponding visible parent marker: **P95 <= 500 ms** under healthy validated connectivity;
- authenticated parent Live Track activation -> phone fast-mode confirmation or explicit failure/degraded result: **P95 <= 2.0 s** while phone is online/reachable.

Measurement starts after a position has been accepted; it does not include waiting for the next physical GNSS/fused fix. Degraded/offline networks are judged on truthful state, durability, recovery and zero manual intervention rather than being forced to meet the healthy-network SLA.

**Status:** `RESOLVED BY CURRENT CONTRACT AMENDMENT`.

---

## P8A-GAP-003 — Legacy Phase 8 closure document is not a valid current Phase 8A completion source

**Evidence:** the repository's legacy `PHASE8-CLOSURE.md` records an older state and uses old 8A/8B nomenclature. Later project work created the permanent release-signing identity and the current audit program explicitly redefined Phase 8A–8F.

**Status:** `RESOLVED FOR CONTRACT AUDIT`.

**Rule:** treat it only as historical implementation evidence. Phase 8B/8C establish current implementation/release evidence from exact current commits/workflows/artifacts.

---

## P8A-GAP-004 — Older Phase 1 ledger is not the final whole-product contract

**Discovery:** the 456-row Phase 1 ledger predates later 23P/23Q requirements contained in the final 469-point acceptance checklist, including fall/emergency evidence, additional System Truth/self-healing behavior and multi-device portal behavior.

**Status:** `RESOLVED`.

**Rule:** Phase 1 remains historical traceability; Phase 8A starts from the 469-point checklist and applies higher-precedence amendments.

---

## Closure impact

Current unresolved source gaps: **0**.

All four identified source-level gaps are resolved. Phase 8A may proceed to final closure validation.