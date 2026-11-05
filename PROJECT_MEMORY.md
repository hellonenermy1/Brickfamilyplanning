# Brick project memory

## 2026-11-05 — mandatory no-card architecture

Jayvian explicitly reconfirmed that he has no credit card, cannot use R2, has repeated this constraint several times, and wants D1 substituted for R2. This is a hard project requirement, not an optional optimisation.

Do not ask him to activate R2, add a payment card, or enable a paid subscription again. A request to finish/deploy the beta does not override this rule.

Direction: D1-backed history, evidence and beta observations; indexed bounded retention and actual durability tests. The repository already contains src/dev-free-runtime.ts, worker-v10.ts and the card-free development setup, including D1 object/history storage, a direct event persistence path and authenticated D1 parent sessions. Qualify/adapt those components for the current beta rather than starting from scratch or downgrading current feature coverage.

Maps and APK binaries require separate sizing/range/download decisions. Do not promise that arbitrary large objects can simply become one D1 row. Existing card-free runtime map sourcing and chunked D1 objects are implementation candidates, not automatically accepted solutions.

The previous Phase2 R2-based setup and its requirement to enable R2 were an assistant mistake. That launch path must remain disabled until replaced by a tested no-card path. Its earlier CI results describe the old design only; they do not qualify the D1 replacement.

The APK readiness contract currently names r2_roundtrip/queue_roundtrip. Coordinate any necessary APK/backend contract update and actual D1 persistence/delivery proofs; never mark fictitious R2/Queue tests PASS. Preserve the independent latest APK escape/reboot safety changes and do not restart Phase8D.
