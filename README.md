# Brick V1 — Phase 3 Child Position Intelligence

This branch builds directly on the validated Phase 2 reliability branch. Phase 3 is only the positioning/intelligence layer; Phase 1 and Phase 2 branches remain untouched.

## Implemented Phase 3 scope

- Android Fused Location Provider remains the primary measured position source;
- raw Android location and Brick trusted/estimated position are transmitted separately;
- horizontal accuracy, speed, speed accuracy, bearing, bearing accuracy, altitude and vertical accuracy are retained when Android provides them;
- monotonic location timestamps are used for ordering/freshness;
- mock locations are flagged and are never promoted to trusted position;
- basic physics/jump plausibility filtering prevents obvious teleport fixes from replacing the trusted anchor;
- weak fixes cannot replace a recent substantially better trusted fix;
- stationary low-speed noise is suppressed instead of displaying fake movement;
- broad Activity Recognition only: stationary, walking, running, bicycle, vehicle and unknown;
- Brick deliberately does not claim car/bus/train from Activity Recognition;
- adaptive tracking: vehicle 3s, running 3s, bicycle 4s, walking 5s, unknown 8s, stationary 60s;
- low-power Activity Transition API plus confidence sampling;
- GNSS status quality telemetry: total satellites, satellites used in fix and average C/N0;
- GNSS telemetry is diagnostic only; Brick does not implement its own raw-GNSS solver;
- local step detector and rotation-vector heading inputs stay on-device;
- short walking/running inertial fallback using learned stride + heading;
- very short vehicle/bicycle constant-velocity fallback, capped at 20 seconds;
- walking/running inertial projection is capped at 120 seconds;
- uncertainty expands during fallback and the source is explicitly marked estimated/inertial;
- last trusted anchor is persisted for short process-recovery windows;
- stride calibration only occurs between good trusted fixes;
- the position engine is synchronized so fused and fallback calculations cannot race;
- V2 compact signed binary packet includes raw/trusted positions, uncertainty, speed, activity and GNSS quality;
- the Phase 3 Cloudflare backend remains backward-compatible with Phase 1/2 V1 packets.

## Accuracy rules

Brick never relabels an estimate as GPS. Rejected raw measurements remain raw evidence. If there is no trustworthy anchor, a rejected/stale/mock reading does not become the trusted current location.

Phase 3 uses the states PRECISE, ASSISTED, ANCHORED, ESTIMATED, COARSE, LAST_KNOWN and UNKNOWN. Numerical confidence percentages are not invented; measurable uncertainty is sent instead.

## Deliberate exclusions

- No custom raw-GNSS position solving.
- No constant Wi-Fi scanning.
- No carrier tower triangulation.
- No camera/microphone localization.
- No permanent 1-second GPS.
- No long-duration inertial fantasy tracking.
- No fake bus/train/car classification.
- BLE anchor scanning is not enabled until actual trusted anchor hardware is configured.
- Route/path snapping is not enabled until Brick has a real usable road/path graph. Until then, fallback stays explicitly estimated rather than being snapped to an invented road.

## Build and validation

Every push to `phase3-child-position-intelligence` compiles, runs Android lint and publishes `brick-child-phase3-debug-apk` on success.

Compile/lint proves the code builds. It does **not** prove real positioning quality on OPPO/ColorOS. Reno10 Pro / Reno14 Pro field testing remains required, including outdoors, indoors, tunnel/elevator, stationary drift, activity changes, GPS loss and GPS recovery.

## Later phases

Phase 4 adds durable location history, route playback, trips, places/geofences, real SOS and I'm Safe. Phase 5 finishes the parent experience, map/privacy infrastructure and operational Device Health UI. Phase 6 performs final security/privacy/reliability qualification.
