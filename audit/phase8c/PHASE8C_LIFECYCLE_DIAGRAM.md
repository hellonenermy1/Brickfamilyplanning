# Brick V1 Phase 8C.3 — Android lifecycle and removal state diagram

**Date:** 2026-11-04. **Source:** `BrickApplication.kt`, `BrickLocationService.kt`, `DeprovisionManager.kt`, `DeepOffManager.kt`, `RecoveryScheduler.kt`, `DiagnosticMonitor.kt`, `FallDetectorRuntime.kt`, `ShizukuPrivilegedBridge.kt`. The diagram is a code-path model, **not** an assertion that all CI tests have passed.

## Normal Android service lifecycle

```mermaid
flowchart TD
  A[Application process created] --> B{Deprovision state safe?}
  B -- INVALID or PURGE_BRICK or UNINSTALL --> C[Recovery only, no Brick runtime stores]
  B -- Normal NONE --> D{Deep Off active?}
  D -- Yes --> E[No tracking workers or sensor processing]
  D -- No --> F{Child role and permissions?}
  F -- No --> G[Unpaired or parent-facing app]
  F -- Yes --> H[Tracking foreground service and safety watchers]
  H --> I[Receive fused and GNSS sensor observations]
  I --> J[Validate timestamp, mock, plausibility and uncertainty]
  J --> K[Durably append Journal / safety outbox]
  K --> L[Best-effort Live preview independently]
  K --> M[Durable uploader prioritizes SOS and safety]
  L --> N{API reachable?}
  N -- No --> O[Bounded 2-60 sec Live retry, latest preview only]
  N -- Yes --> P[Current-state preview]
  M --> Q{Durable remote acknowledgement?}
  Q -- No --> R[Retain pending rows and bounded retries]
  Q -- Yes --> S[Acknowledge corresponding rows locally]
  H --> T{Process killed or service removed?}
  T -- Yes --> U[Normal recovery scheduler, subject to policy and role]
  U --> A
```

A callback arriving now with an older location measurement cannot reset the measured-fix age. Rejected Fused callbacks may yield conservative fallback estimates, but cannot impersonate a fresh accepted measurement. Emergency SOS outbox persists before network delivery; Live UI preview is not an emergency storage authority.

## Monotonic authorised deprovision lifecycle

```mermaid
flowchart TD
  A[NONE] --> B[AUTHORISE_FREEZE]
  B --> C[QUIESCE / durable Deep Off]
  C --> D[UNDO_DEVICE_MANAGEMENT / reverse owned policies]
  D --> E{All producers terminal and all writers drained?}
  E -- No or timed out --> F[Stop with recorded error; do not delete stores]
  F --> E
  E -- Yes --> G[PURGE_BRICK / delete and verify stores, prefs, files and aliases]
  G --> H[UNINSTALL / user-confirmed removal]
  A -. malformed or conflicting provenance .-> X[INVALID / recovery required]
  B -. malformed or conflicting provenance .-> X
  C -. malformed or conflicting provenance .-> X
  D -. malformed or conflicting provenance .-> X
  G -. lost stage XML but independent marker survives .-> X
  X --> Y[No automatic repair or normal tracking]
```

The entire state sequence is monotonic. `INVALID` **does not mean successfully purged**; it means evidence of state is insufficient and the app must remain fail-closed. The independent, non-sensitive no-backup origin guard prevents loss of the sole deprovision preference XML from resetting the app to `NONE`. Total loss of **both** independent anchors is not distinguishable from a fresh install with the available local evidence; it is an explicitly declared limitation, not a PASS claim.

## Producer termination barrier before PURGE_BRICK

```mermaid
flowchart TD
  A[Authenticated removal flow enters purge] --> B[Permanent Shizuku fence]
  B --> C[Cancel, await and prune Brick WorkManager chains]
  C --> D{Location foreground service workers terminated?}
  D -- No --> X[Abort purge, preserve private data]
  D -- Yes --> E{Diagnostic sampler no active writes?}
  E -- No --> X
  E -- Yes --> F{Fall handler threads actually joined?}
  F -- No --> X
  F -- Yes --> G[Verify and delete databases, preference stores, AtomicFile sidecars]
  G --> H[Delete and verify Keystore aliases]
  H --> I[Commit PURGE_BRICK stage, retaining only removal provenance]
```

The gate must not claim termination after merely calling `stopService`, `shutdownNow`, `Future.cancel(false)`, or `quitSafely`. Each is an asynchronous request. A hung writer produces an explicit bounded failure rather than a false-success purge.

**Current audit status:** The original SOS/HIGH-fall, post-purge startup, Shizuku, crypto, WorkManager and corruption tests have recorded green emulator runs. The newly extended service, diagnostics and fall producer-drain tests still require their exact-source passing run before the P8C-008 finding can be formally closed. Physical OPPO process-kill and background power behavior remain Phase 9 verification.
