# Brick V1 — Phase 8 Change Inventory

This file is updated as Phase 8 progresses.

## Tranche A — safety foundation

- `app/src/main/java/com/brick/safety/beta/BetaSafety.kt` — replaces the single retirement boolean with a monotonic persisted retirement state machine and verified management release.
- `app/src/main/java/com/brick/safety/managed/ManagedPolicy.kt` — removes permanent Location-setting lock/reconcile behavior; repairs the old restriction and consumes each new authenticated Location command once.
- `app/src/main/java/com/brick/safety/reliability/BootReceiver.kt` — fail-closed retirement/expiry gate before any boot restart work.
- `app/src/main/java/com/brick/safety/reliability/RecoveryScheduler.kt` — refuses to schedule recovery/evidence work for a retired/expired build.
- `app/src/main/java/com/brick/safety/reliability/RecoveryWorker.kt` — fail-closed worker gate.
- `app/src/main/java/com/brick/safety/reliability/EvidenceUploadWorker.kt` — fail-closed evidence worker gate.
- `app/build.gradle.kts` — Phase 8 beta identity/version/expiry.
- `app/src/androidTest/java/com/brick/safety/beta/Phase7BetaSafetyInstrumentedTest.kt` — retained path, updated Phase 8 test class and monotonic retirement checks.

## Deliberately not claimed yet

The current tranche does not by itself prove service-race shutdown, emulator Device Owner lifecycle, stable signing continuity, cloud attack resistance, long-offline durability, backup restore, or battery/performance budgets. Those remain open in the requirement ledger until their tests exist and pass.
