# Brick V1 — Phase 8C Race and Concurrency Report

Production freeze: `967e5d5ceb7e485af997eb0f6380e9544cd39e79`

## Audited race boundaries

### Safety state vs event persistence
SOS transition + SOS-active state and high-fall event + protection deadline use atomic durable transactions. Fault injection proves a write failure cannot leave only one half committed.

### Measured fix vs fallback
`BrickLocationService` uses measured generation and accepted measurement timestamps. A fallback produced while a new accepted fused fix arrives is discarded rather than overwriting fresher truth.

### ACK ordering
Journal batch ACK is atomic and exact. Out-of-order ACKs remove only named rows; an invalid mixed batch does not partially delete. SafetyOutbox uses event IDs and exact ACK semantics.

### Policy-ledger compaction
Active policy provenance is never evicted by history compaction. Regression coverage retains an active record through 400 reverted-history writes. Missing/corrupt lifecycle provenance fails closed.

### Deprovision vs asynchronous entry points
Post-purge guards exist at broadcast/service/worker/scheduler boundaries so a boot/time/package callback, companion callback or WorkManager race cannot recreate purged Brick state. WorkManager drain is separately tested.

### Shizuku timeout vs executor starvation
Privileged operations run on a replaceable executor lane. Timeout abandons the wedged lane; a subsequent operation can run on a fresh executor instead of being queued forever behind the hung call. Core remains independent of Shizuku availability.

### Network/live pump coalescing
Single-flight atomics prevent duplicate live/upload pumps. Failed live send restores only the failed candidate when a newer candidate has not already arrived, preventing stale failure recovery from overwriting newer render data.

## Evidence

The expanded Android 15 emulator run `41670141287` passed the durability, network chaos, location freshness, motion/fusion, policy, purge, diagnostics and WorkManager isolation suites. API29 policy reversal was separately executed in run `41665283987`.

## Result

No open P0/P1 concurrency defect remains in the audited Android source after retest. OEM scheduler/process races that depend on ColorOS remain Phase 9 physical-device verification.
