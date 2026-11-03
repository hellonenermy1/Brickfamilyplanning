# Brick V1 — Phase 8B Evidence Keys

This file explains the compact evidence keys used by the 525-row verdict ledger. A key is a trace family, not blanket proof that every requirement in that family is correct.

## Verdict meaning

- `IMPLEMENTED`: direct source/config/CI evidence is strong enough for the narrow requirement itself; later phases may still test integration.
- `IMPLEMENTED — UNVERIFIED`: real implementation and wiring exist at source/config level, but deep correctness/security/performance/target-device proof belongs to 8C-8F/9.
- `PARTIAL`: real implementation exists but misses part of the frozen current requirement.
- `MISSING`: required current function/path was not found in the exact implementation baselines.
- `BROKEN`: implementation exists and is wired, but its current semantics conflict with the frozen requirement.
- `INTENTIONALLY REMOVED — VERIFIED`: forbidden path is absent from the inspected source/config; later package/runtime/network recheck remains mandatory.

## Core evidence families

### `ANDROID_UI`

Primary sources:

- `app/src/main/java/com/brick/safety/ui/MainActivity.kt`
- `app/src/main/AndroidManifest.xml`
- `app/src/main/java/com/brick/safety/diagnostics/DiagnosticsActivity.kt`

Used for child UI, provisioning and notification/UI-surface reality.

### `ANDROID_POLICY`

Primary sources:

- `managed/ManagedPolicy.kt`
- `managed/ParentLocationState.kt`
- `managed/BrickDeviceAdminReceiver.kt`
- `BrickLocationService.kt`

Used for Device Owner/Location command/policy behavior.

### `ANDROID_CAPABILITY`

Primary sources:

- `reliability/HealthEvidence.kt`
- individual Atlas/Witness provider capability checks
- `privileged/PrivilegedBridge.kt`
- `privileged/ShizukuPrivilegedBridge.kt`

Capability detection is real but fragmented; `PLT-002/003` remain partial because no complete durable versioned per-device capability profile exists.

### `ANDROID_POSITION`

Primary sources:

- `location/BrickLocationService.kt`
- `location/PositionEngine.kt`
- `location/PositionConsistencyGuard.kt`
- `location/GnssQualityMonitor.kt`

Used for measured position validation, fallback and source/quality behavior.

### `ANDROID_ACTIVITY`

Primary sources:

- `activity/ActivityEngine.kt`
- `activity/ActivityReceiver.kt`
- `activity/ActivityState.kt`
- service cadence/subscription updates in `BrickLocationService.kt`

### `ANDROID_MOTION`

Primary sources:

- `location/MotionEngine.kt`
- `location/LearnedOdometry.kt`
- `location/ParticlePositionEngine.kt`
- `location/Phase3MotionCore.kt`
- `location/Phase3PositioningEngine.kt`
- route/sequence state classes

### `ANDROID_FUSION`

Primary sources:

- `fusion/ParallelEvidenceEngine.kt`
- `fusion/Phase5PositionFusion.kt`
- `fusion/Phase5FusionAdapter.kt`
- `fusion/LearnedPlaceRegistry.kt`
- `fusion/Phase5RadioRouteMatcher.kt`
- `fusion/AuthenticatedRangingProvider.kt`

### `ANDROID_ATLAS`

Primary sources:

- `atlas/Phase4AtlasController.kt`
- `atlas/EnvironmentalAtlas.kt`
- `atlas/SignalTrustEngine.kt`
- Wi-Fi / RTT / BLE / cellular / LAN / GNSS-sky / network / device-context providers
- `evidence/EvidenceSamplingCoordinator.kt`
- `evidence/IsolatedEvidenceProvider.kt`

The controller is started from the tracking service and routes observations to the durable Evidence Journal. Provider presence is therefore not just dead-file evidence.

### `WITNESS_GROUND`

Primary sources:

- Android `witness/WitnessMeshProvider.kt`
- `witness/WitnessAliasKey.kt`
- cloud Witness/Ground receiver routes/storage/fusion modules on the cloud hardening head

Witness uses rotating private aliases and a private evidence path. Deep replay/auth/uncertainty and real hardware behavior remain later-phase verification.

### `ANDROID_SHIZUKU`

Primary sources:

- `privileged/PrivilegedBridge.kt`
- `privileged/ShizukuPrivilegedBridge.kt`
- `privileged/BrickShizukuUserService.kt`

The bridge is typed/capability-gated rather than a generic shell surface.

### `ANDROID_REL+CLOUD_OPS`

Primary Android sources:

- `reliability/BootReceiver.kt`
- `ServiceControl.kt`
- `RecoveryScheduler.kt`
- `RecoveryWorker.kt`
- `HealthEvidence.kt`
- `DiagnosticMonitor.kt`

Primary cloud sources:

- health/reliability incident modules and production worker routes

Used for lifecycle/self-recovery/health/system-truth families. Explicit daily canary requirements are separately classified missing/partial.

### `DATA_PATH`

Primary Android sources:

- `data/Journal.kt`
- `data/SafetyOutbox.kt`
- `data/CrashOutbox.kt`
- `evidence/EvidenceJournal.kt`
- `evidence/EvidenceDispatcher.kt`
- `reliability/DurableLocationDelivery.kt`
- `reliability/SafetyDispatcher.kt`

Primary cloud sources:

- signed ingest routes
- D1 sequence/idempotency records
- Durable Object current state
- Queue/R2 history path

The source shows real local-first persistence and exact ACK deletion semantics; detailed crash/storage/load verification remains 8C/8D/8F.

### `SAFETY`

Primary sources:

- `SafetyOutbox.kt`
- `SafetyDispatcher.kt`
- SOS / I'M SAFE child UI paths
- cloud safety event ingest/current-state/parent display

This supports `SAFE-001..006`. Fall inference/Emergency Evidence Bundle is separately missing.

### `CLOUD_HISTORY`

Primary sources:

- cloud history codec/store/Queue/R2 path
- `phase4.ts` trip/geofence/history APIs
- parent history/playback rendering

Automatic commute summaries and optional flight features are separately missing.

### `PORTAL`

Primary sources:

- `parent-v5b.ts`
- `parent-v6.ts`
- `parent-v7.ts`
- `parent-v8.ts`
- `web/brick-map.ts`

The production worker v9 composes the hardened parent layers. OneMap and stale Location-command truth findings override generic portal credit where applicable.

### `PORTAL_MAP`

Primary sources:

- `web/brick-map.ts`
- `private-map.ts`
- parent map integration

Current implementation is MapLibre + private PMTiles/Protomaps/OSM. OneMap-first current requirements are separately missing/partial.

### `CLOUD_BACKEND`

Primary sources:

- `worker-v9.ts` production entry
- underlying worker v8/v7/v6/v5b layers
- `location-ingest-v6.ts`
- `device-do.ts`
- D1 migrations/storage modules
- Queue/R2/history/evidence/Witness/Ground/command modules
- `wrangler.template.jsonc`

### `CLOUD_PAIRING`

Primary sources:

- signed opaque-UUID pairing path in cloud worker layers
- Access-authenticated parent creation of short-lived one-time pairing token

Fallback-PIN semantics remain only partial where explicitly required.

### `SECURITY`

Primary sources/config:

- Android Keystore P-256 `DeviceKeys.kt`
- signed protocol/network calls
- Cloudflare Access JWT verification in `access-auth.ts`
- device key verification / revocation / rate limiting
- CSP/security headers
- no third-party analytics/ad SDK path identified

Detailed adversarial verification remains 8C/8D/8E/8F.

### `RELEASE`

Primary sources/config:

- Android Gradle/release workflows
- production signing public manifest
- GitHub Actions
- cloud `wrangler.template.jsonc`
- release/version routes

The permanent signing identity exists, but the current implementation candidate is still `testOnly`/beta and uses split Android/cloud heads.

### `FIELD_TEST`

The requirement has an explicit acceptance scenario/field-test contract, but source audit cannot truthfully convert that into a device PASS. These items remain `IMPLEMENTED — UNVERIFIED` until Phase 9 or the applicable deep phase executes the real scenario.

### `AUDIT`

Governance/coverage requirement represented by the frozen contract/audit program and trace artifacts. This does not convert implementation findings into PASS.

### `NEGATIVE_SCAN`

The forbidden function was not found in the inspected current implementation source/config and no intended production wiring reintroduces it. This is source/config absence only; 8C-8F must recheck packaged components, runtime traffic and deployed configuration.

## Named finding evidence

Keys such as `P8B-006`, `P8B-007`, `P8B-008`, etc. refer directly to the detailed finding in `PHASE8B_FINDINGS.md` or `PHASE8B_FINDINGS_CONTINUED.md`.

## Test-evidence boundary

The exact Android head has successful GitHub Actions including same-certificate Phase 7->8 upgrade continuity and substantial `androidTest` coverage. The exact cloud head has successful Phase 8 Cloud Hardening CI. These are credited only to the exact paths they exercise.

The Android source set has no ordinary `app/src/test` JVM unit-test tree; this is recorded as P8B-011, not used to invalidate stronger existing instrumentation evidence automatically.

The cloud `package.json` has no generic `npm test` target; its validation is mainly workflow/script based. 8D must inspect the exact production test scripts and deployed behavior rather than assuming a package-level test command exists.
