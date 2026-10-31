# Brick V1 Phase 1 — Baseline Freeze

Date: 2026-10-31
Status: frozen for requirement comparison; not a production-qualification claim

## 1. Repository identity

Repository: `hellonenermy1/Brickfamilyplanning`

Current canonical branch heads observed at Phase 1 start:

- `main`: `9ae0f2b72b63d3dfd0bc7807adfbd2928dcd2059`
- `apk-download`: `c99fe4ce7f74b14ba23d280739ed150a327b8520`
- `audit-progress`: `da2d56f6d46eeb293d5ef5010304730dd45378d1`

Important: `main` currently contains the temporary historical-branch export workflow documented in project memory. Its runtime tree at that head is `33cdcddcfab9cd3e0325b2cd9312511b65c5b7f3`.

The Android branch tree at its observed head is `034d0cdfe494f3f74ddfa5d44e1d1e974fd92f42`.

Phase 1 work is documentation-only and is being staged from `audit-progress`; no runtime source modification is part of this phase.

## 2. Proven pre-Phase-1 validation baseline

The existing audit record identifies:

- fully validated Phase 6 source commit: `176d94f604eb562a59260ef380ee680a564acfcc`
- validated Git tree: `b5f4ea6e97e9e2afef7a01c8386829f316b4af2e`
- later pre-cleanup hardening head `b23741d31ec6c51a5b00b6fe15b753b0d70d04c8` had the same tree according to the retained audit record.

The retained audit says eight normal Phase 6 workflows passed on the validated source tree:

1. source inventory;
2. Android runtime wiring;
3. Android recovery hardening;
4. Cloudflare Phase 6 validation;
5. security hardening;
6. operations/durability checks;
7. exact Android dependency-lock generation;
8. Android debug/release build, lint, APK inspection and provenance.

This evidence is a **source/build baseline**, not proof of live deployment or physical OPPO qualification.

## 3. Android release identity at Phase 1 start

From `apk-download/app/build.gradle.kts`:

- namespace/application ID: `com.brick.safety`
- minSdk: `29`
- targetSdk: `35`
- compileSdk: `36`
- versionCode: `6`
- versionName: `0.6.0-phase6-rc`
- Java/Kotlin target: 17
- release minification: disabled at the current candidate baseline
- release signing is configured only when the required environment variables are supplied.

Current declared Android runtime dependencies include AndroidX core/appcompat/WorkManager, Material, Google Play Services Location and Google code scanner.

## 4. Cloudflare/runtime identity at Phase 1 start

Current `main` configuration uses the Phase 6 Worker line and includes:

- Worker runtime;
- Durable Object binding;
- D1;
- R2 history and map buckets;
- Queue + DLQ bindings;
- rate-limit bindings;
- Workers observability;
- private MapLibre/PMTiles map assets;
- parent authentication through the existing Access-auth code path;
- scheduled backup/maintenance hooks.

The current runtime package pins its JavaScript dependencies in `package-lock.json`; notable map/runtime dependencies include MapLibre, PMTiles, Protomaps, vector-tile and PBF libraries.

## 5. Existing Android implementation observed before new V1 work

The current Android source already contains concrete modules for:

- app bootstrap and crash handling;
- activity recognition;
- device cryptographic keys;
- local data/journal/protocol handling;
- fused location service;
- GNSS quality monitoring;
- motion/step/heading handling;
- position evaluation and simple fallback;
- configured BLE place anchors;
- Device Owner policy/admin receiver;
- signed HTTPS API client;
- recovery/health/safety dispatch;
- minimal child UI.

Observed current behavior includes:

- Fused Location Provider as the primary source;
- raw and trusted fields in the V2 position packet;
- speed/speed-accuracy, bearing/bearing-accuracy, altitude/vertical-accuracy fields;
- activity mode/confidence;
- GNSS used/total/average-CN0 summary;
- mock-fix rejection and basic freshness/physical-speed filtering;
- learned walking/running stride values;
- short walking/running/vehicle/bicycle inertial projection;
- last-known fallback;
- configured BLE anchor fallback;
- adaptive cadence including SOS 1-second target and vehicle/running ~3-second operation;
- local journal + signed upload + exact ACK handling;
- safety outbox priority;
- foreground-service tracking and recovery scheduler;
- Device Owner permission/location policy application;
- QR/manual pairing;
- child `I'M SAFE` and SOS controls.

These are source observations. Long-duration reliability on the target OPPO remains unqualified.

## 6. Existing Cloudflare/browser implementation observed before new V1 work

The current backend/browser source already contains concrete support for:

- per-device Durable Object live/current state;
- WebSockets;
- compact V1/V2 location packet decoding;
- signed-device authentication;
- pairing and revocation/archive behavior;
- history storage/codec;
- R2 detailed history;
- D1 metadata/events/operations;
- Queue/DLQ processing;
- safety events;
- health incidents and measured reliability reporting;
- battery-drain trend support;
- geofences/trips/history/retention;
- configured BLE anchors;
- route-constrained fallback using private map geometry;
- private MapLibre/PMTiles map and same-infrastructure place resolution;
- device/app release diagnostics;
- crash/audit reporting;
- backup/restore tooling.

The current route constraint preserves the inertial estimate and attaches plausible map corridors instead of silently snapping to one invented street. This remains useful and should become one input to the future unified fusion engine rather than being discarded.

## 7. Current important implementation gaps relative to the new `Yes.docx`

The new contract materially exceeds the present Phase 6 candidate. Major missing or incomplete areas include:

- general evidence-provider framework and independence groups;
- persistent parallel multi-source Evidence Engine;
- raw accelerometer/gyroscope/magnetometer localisation use beyond current step/rotation handling;
- learned per-placement/per-motion inertial odometry;
- full particle-filter hypothesis map;
- geomagnetic sequence learning/matching;
- physical landmark sequence learning/matching;
- Environmental Fingerprint Atlas;
- Signal Trust / Uniqueness Engine;
- broad Wi-Fi/BLE/LAN/cellular/GNSS-sky/network fingerprints;
- learned place signatures and radio-route matching;
- opportunistic Wi-Fi RTT provider;
- private authorised-device BLE Witness Mesh;
- fixed Ground Network receivers;
- future ranging-provider abstraction;
- backward smoothing/refined estimate history;
- parent persistent Location ON/OFF desired-state control;
- optional Shizuku bridge and its bounded privileged evidence/diagnostic/repair operations;
- full degraded-position circle/corridor/heat/witness/anchor rendering;
- new Atlas/provider health reporting;
- real-device validation of all target-dependent capabilities.

Some older V1 areas are present in source but still require deeper audit or physical qualification, including full raw-fix retention semantics, true 7–14 day backlog behavior, Android/ColorOS recovery, exact alert behavior under all modes, and production-signed release operation.

## 8. Production blockers carried into the new nine-phase program

The pre-existing blockers remain open unless a later phase closes them with evidence:

1. stable Android production signing;
2. exact live Phase 6/new-V1 Cloudflare deployment evidence;
3. authenticated parent-browser smoke test;
4. physical Reno10 Pro/Reno14 Pro ColorOS qualification;
5. zero-manual-intervention endurance proof;
6. measured battery/storage/network behavior;
7. verified backlog capacity and drain;
8. hard SOS/I'M SAFE durability tests;
9. final pairing/revocation production behavior verification;
10. actual backup restore proof;
11. privacy/dependency/build/security final audits;
12. final source/backend/APK/version freeze.

## 9. Phase 1 truth rule

This baseline is intentionally conservative. If a later detailed code audit finds that an item described here as existing is only partial, the ledger must be corrected explicitly; no requirement may be silently upgraded.
