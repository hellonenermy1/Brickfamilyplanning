# Brick V1 — Phase 8A Source-Level Gap Register

These are not implementation bugs. They are places where the current authoritative source set is not specific enough for Phase 8A to invent an answer safely.

## P8A-GAP-001 — `HIGH-fall` / `fall events` references lack an atomic contract definition

**Evidence:** the latest master plan says scheduled Wi-Fi OFF must be deferred during `SOS/HIGH-fall critical emergency handling`, and the Singapore map overlay list includes `fall events`.

**Problem:** the canonical Phase 1 requirement ledger contains no `FALL-*` requirement family, and the latest master-plan text available to this audit does not define fall detection thresholds, classification, persistence, alerting, cancellation, or acceptance behavior.

**Audit rule:** do **not** invent a fall-detection feature contract from those two references.

**Status:** `OPEN SOURCE GAP`.

**Required resolution:** locate an authoritative approved Brick source that defines the fall feature, or explicitly classify these references as references to an already-defined/non-V1 feature. Until then, Phase 8A cannot claim 100% source reconciliation.

---

## P8A-GAP-002 — Exact numeric `23R` P95 Fast Live Path budget not recovered

**Evidence:** the latest master plan repeatedly requires the Live Track pipeline to meet the `23R P95 latency budget` and lists the measurement stages to instrument.

**Problem:** the currently recovered contract/master-plan source states that the 23R P95 budget must be met but does not contain the numeric threshold in the retrieved text.

**Audit rule:** preserve the requirement to measure against the approved 23R budget, but do **not** invent a millisecond/second target.

**Status:** `OPEN SOURCE GAP`.

**Required resolution:** locate the authoritative 23R numeric budget before Phase 9 acceptance criteria are frozen.

---

## P8A-GAP-003 — Legacy Phase 8 closure document is not a valid current Phase 8A completion source

**Evidence:** the repository's legacy `PHASE8-CLOSURE.md` records an older state where formal Phase 8 closure was blocked by persistent signing and uses old 8A/8B nomenclature. Later project work created the permanent signing identity and the current user has explicitly stated Phase 8 is complete.

**Problem:** using the legacy closure document as the current program status would be stale and would also collide with the newly defined 8A–8F meanings.

**Status:** `RESOLVED FOR CONTRACT AUDIT`.

**Rule:** treat it only as historical implementation evidence. Phase 8B/8C will establish the current implementation/release evidence from exact current commits and workflows.

---

## Closure impact

Phase 8A may continue while P8A-GAP-001 and P8A-GAP-002 are open, but it may not receive final `PASS` until each is either:

- resolved from an authoritative source;
- explicitly classified `NOT APPLICABLE / INTENTIONALLY REMOVED`; or
- preserved as a named external acceptance parameter with its authoritative source identified.
