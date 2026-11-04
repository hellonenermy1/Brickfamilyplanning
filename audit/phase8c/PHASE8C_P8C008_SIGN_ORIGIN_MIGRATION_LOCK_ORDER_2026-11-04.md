# P8C-008 — Potential ABBA lock-order deadlock in legacy provenance migration

**Recorded:** 2026-11-04, before correction. Existing P1 lifecycle/shutdown finding. **Status:** source-reachable, not observed on physical OPPO; original reproducibility test required.

`DeprovisionManager.purgeBrick()` is `@Synchronized` on the DeprovisionManager singleton and acquires the `DeviceKeys` monitor during private state/key purge. `DeviceKeys.getOrCreate()/sign()/initialize()` hold the DeviceKeys monitor and call `DeprovisionManager.stage()`. On an older installed V1 RC carrying a valid stage preference but **without** the new independent no-backup origin marker, `stage()` invokes `ensureOriginGuard()`, which was itself `@Synchronized` on the DeprovisionManager singleton. This can reverse lock order: thread A holds DeviceKeys and awaits DeprovisionManager; thread B holds DeprovisionManager and awaits DeviceKeys, deadlocking deprovision without a timeout.

**Correction:** protect only the independent-origin guard's AtomicFile write with its *own* private monitor, not the entire DeprovisionManager singleton. The primary `persist` stage transition remains `@Synchronized` for monotonic state. Preserve atomic marker creation, fail-closed invalid sidecar handling, exact original stage migration and signing key/purge interlock. Instrument concurrency and legacy migration; no P1 closure on source inspection alone.

This does not prove all other Android lock orders; it specifically removes this two-monitor ABBA cycle.
