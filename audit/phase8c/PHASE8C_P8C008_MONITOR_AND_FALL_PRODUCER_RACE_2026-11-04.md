# P8C-008 additional independent producers: diagnostics and fall-sensor handler

**Recorded:** 2026-11-04, prior to source correction. Existing P1 post-purge in-flight writer finding.

- `DiagnosticMonitor.stop()` calls `ScheduledFuture.cancel(false)` and clears its state without waiting for an already-running `sample()` to finish. That sample writes `brick_diag_state`, diagnostic logs and potentially other Brick preferences, so it could complete after PURGE deletes those namespaces.
- `FallDetectorRuntime.stop()` unregisters sensors, removes callbacks and `HandlerThread.quitSafely()`, but does not wait for an in-progress `evaluateCandidate()`, which can enqueue safety events and log diagnostics. `FallDetectorRuntime.start()` also calls `refreshHighAlert()` **before** checking Deep Off, creating a potential preference write even if no fall inference should start.

**Acceptance correction:** Shared, process-wide quiescence accounting for diagnostics active sample(s) and joined fall handler thread(s), callable by `DeprovisionManager.purgeBrick()` after WorkManager and location-service drain but before deleting data. Main-thread waiting must fail closed rather than deadlock. Avoid costly per-sensor callback disk reads. The fall startup path must not write when Deep Off/purge is active. Build and instrumentation tests must pass on latest source.

**Status:** OPEN pending source correction and exact-source runtime regression. The broader P8C-008 requires independent review of all registered writers.
