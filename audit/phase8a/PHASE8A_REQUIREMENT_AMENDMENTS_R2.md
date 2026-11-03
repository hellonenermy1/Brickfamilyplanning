# Brick V1 — Phase 8A Requirement Amendments Round 2

Purpose: convert every `ADD-R2` item from `PHASE8A_MASTER_PLAN_COVERAGE.md` into explicit atomic requirements. These IDs are provisional until final duplicate/supersession reconciliation, but none may be silently dropped.

## Evidence platform

`EVOBS-001` — All evidence providers emit one canonical `EvidenceObservation` representation rather than incompatible provider-specific top-level models.

`EVOBS-002` — Evidence observations carry identity/order/time fields sufficient for `id`, device epoch, sequence, monotonic time and wall time semantics.

`EVOBS-003` — Evidence observations identify provider, evidence family and independence/correlation group.

`EVOBS-004` — Evidence observations carry raw quality, freshness and source-health semantics.

`EVOBS-005` — Evidence observations can represent geometry/constraint, measurement and uncertainty.

`EVOBS-006` — Evidence observations carry privacy class, retention class and optional feature-vector semantics where applicable.

`PROV-001` — Evidence-provider abstraction exposes capability, health, desired sampling mode, start, stop, collect and latest-evidence semantics (exact implementation names may differ).

`PROV-002` — Provider capability/health vocabulary can distinguish at least SUPPORTED, UNSUPPORTED, PERMISSION_REQUIRED, TEMPORARILY_UNAVAILABLE, DEGRADED and FAILED.

`PROV-003` — A correctly detected UNSUPPORTED optional provider does not make Brick Core/device health globally unhealthy.

`SAMP-001` — A central sampling coordinator controls evidence-provider cadence using Brick state/motion/safety mode rather than allowing independent uncontrolled provider loops.

`SAMP-002` — No evidence provider may independently choose permanent maximum-rate sampling; SOS may be aggressive but remains bounded.

## Durable Evidence Journal

`EJOUR-001` — Environmental/evidence batches use a separate durable Evidence Journal rather than inflating the small realtime location record.

`EJOUR-002` — Evidence Journal is encrypted, sequence ordered, append-safe and crash-safe.

`EJOUR-003` — Evidence Journal storage is bounded by explicit retention/storage policy rather than silent arbitrary deletion of undelivered data.

`EJOUR-004` — Evidence Journal upload is batched/resumable and uses exact server acknowledgement before delivered local data is removed/retired.

`EJOUR-005` — Evidence-learning/diagnostic upload priority is lower than SOS/critical safety/current location traffic.

## Evidence protocol

`EVPROTO-001` — Preserve compatibility of the realtime compact location protocol while environmental evidence uses a separately versioned evidence-batch protocol.

`EVPROTO-002` — Evidence protocol is versioned, length bounded and schema validated.

`EVPROTO-003` — Evidence protocol is timestamped, replay protected and device authenticated/signed.

`EVPROTO-004` — Evidence protocol has an explicit forward-compatibility strategy for unknown/new fields or versions rather than undefined parsing behavior.

`EVPROTO-005` — Evidence protocol parser/validator is fuzz/adversarial-input tested before acceptance.

## Backend evidence/model foundation

`EVDB-001` — Backend storage/index foundation supports evidence batches, provider health, signal identities and signal classes.

`EVDB-002` — Backend foundation supports learned places/routes plus Atlas/model version identity.

`EVDB-003` — Backend foundation supports witness identities and fixed ground receivers.

`EVDB-004` — Backend foundation supports parent command records and command acknowledgements/results.

`EVDB-005` — Backend foundation supports smoothing runs and refined-history identity separate from raw observations.

## Phase 2 integration gate

`P2QUAL-001` — A dummy evidence provider must prove collect -> durable local persistence -> process-death survival -> authenticated transmission -> dedupe -> durable server store -> exact ACK -> safe local retirement.

`P2QUAL-002` — The dummy evidence end-to-end test must prove evidence processing cannot break or starve existing location/SOS operation.

## Sensor health / local route architecture

`SENHLTH-001` — Accelerometer, gyroscope, magnetometer, rotation vector, step detector and step counter health are tracked independently where each exists.

`SENHLTH-002` — Sensor health distinguishes missing/unsupported hardware from runtime failure.

`SENHLTH-003` — Sensor health detects stale samples.

`SENHLTH-004` — Sensor health detects impossible/out-of-range or otherwise invalid readings where defensible checks exist.

`SENHLTH-005` — Sensor health detects event starvation when events are expected under the active mode.

`SENHLTH-006` — Sensor health detects timestamp regressions/order violations.

`PFSTATE-001` — Particle/hypothesis state can represent position, heading, motion state, speed, weight, age, route segment and uncertainty without reducing the internal model to one guessed coordinate.

`ROUTEGRAPH-001` — Android has sufficient local route/map geometry for degraded/offline hypothesis constraint without requiring a cloud round-trip for every particle operation.

`ROUTEGRAPH-002` — Server route/corridor intelligence may remain useful, but loss of Cloudflare connectivity alone must not disable the phone's short-term local hypothesis propagation.

`P3QUAL-001` — Controlled particle/odometry acceptance covers precise-fix loss, short walking propagation, uncertainty growth, turn-based hypothesis elimination, stationary drift suppression, precise-fix return/convergence and preservation of raw history.

## Exact command contract

`CMD2-001` — Every parent/device command carries command ID, device ID, command type, requested target state/action, creation time, expiry and nonce.

`CMD2-002` — Every command is bound to parent authorization context/device authentication and produces a server audit record.

`CMD2-003` — Phone result carries command ID, attempted operation, actual resulting state, success/failure, reason and device timestamp.

`CMD2-004` — Duplicate delivery of the same command ID is safe/idempotent.

`CMD2-005` — Replayed command outside valid semantics/window is rejected.

`CMD2-006` — Expired command is rejected rather than executed late.

`CMD2-007` — Command targeted to another device is rejected.

`SHZCAP-001` — Shizuku bridge exposes only the explicitly approved typed capability set: Location ON/OFF, Shizuku Wi-Fi evidence, Shizuku BLE evidence, cellular-environment evidence, privileged health, approved power-policy repair and child-initiated SOS emergency mode; no generic shell-string execution.

`SHZBLE-001` — Location-OFF Shizuku BLE evidence is real-device capability tested and may legitimately resolve to SUPPORTED or BLOCKED/UNAVAILABLE; either outcome must leave Brick Core functional.

## Detailed Singapore map acceptance details

`MAPSG-012` — Child selection may focus around zoom 17–18 when appropriate, without preventing later manual parent control.

`MAPSG-013` — Desktop normally gives the map most tracking workspace with an adjacent event/detail rail; narrow layouts stack/collapse without hiding critical state/actions.

`MAPQUAL-001` — Map acceptance includes representative Singapore HDB/building-label checks.

`MAPQUAL-002` — Map acceptance includes responsive desktop/mobile layout checks.

`MAPQUAL-003` — Map acceptance includes label-density checks across multiple zoom levels.

`MAPQUAL-004` — Map acceptance checks pan, zoom, Recenter and Follow semantics including manual-follow cancellation.

`MAPQUAL-005` — Map acceptance checks supported style switching without losing Brick overlays/state.

`MAPQUAL-006` — Map acceptance injects primary-basemap failure and proves fallback preserves current Brick state/overlays.

`MAPQUAL-007` — Map acceptance proves a delayed reverse-geocode result cannot replace enrichment for a newer coordinate/time.

`MAPQUAL-008` — Map acceptance proves map/render/enrichment work does not violate the approved Fast Live Path latency budget.

## OneMap exact boundary refinements

`ONEMAP-008` — Token-free Basemap/Mini Map/Advanced Mini Map/Static Map capability must not depend on authenticated enrichment availability.

`ONEMAP-009` — Search, Coordinate Converters, Reverse Geocode, Themes, Routing, Planning Area and Population Query are treated as authenticated enrichment services when used.

`ONEMAP-010` — Backend manages the approved three-day OneMap token lifecycle with refresh-before-expiry and bounded refresh/retry.

`ONEMAP-011` — Central provider limiting remains below the approved/published 300 calls-per-minute ceiling rather than letting individual clients independently exhaust it.

`ONEMAP-012` — A 2-second live-position update cadence must not cause a 2-second reverse-geocode/enrichment cadence; requests are decoupled/coalesced/cached.

## Geofence source-quality protection

`GEOQUAL-001` — Estimated/degraded position must not create false high-confidence geofence arrival/departure events.

`GEOQUAL-002` — Geofence logic explicitly incorporates position source/quality and uncertainty rather than treating every coordinate equally.

`P7QUAL-001` — Parent/child UI acceptance covers precise, no-position, poor-position, estimated-route, witness, anchor, offline, stale-data, revoked-device, unavailable-Shizuku, unsupported-Atlas-provider, SOS and I'M SAFE states.

## Phase 8 hardening specifics

`PRIORITY-001` — Durable/network work priority is SOS > critical safety > current location > health > evidence learning > diagnostics.

`STRESS-001` — Storage/backlog tests cover one-day, seven-day and fourteen-day offline-equivalent accumulation.

`STRESS-002` — Stress tests cover thousands/millions of evidence records rather than only normal-sized queues.

`STRESS-003` — Stress tests exercise low-storage behavior without silent corruption/loss of protected undelivered data.

`STRESS-004` — Stress tests kill the process during database/journal writes.

`STRESS-005` — Recoverable storage/process stress must not corrupt the durable journal/database.

`CRASHISO-001` — Deliberately failing/crashing the Wi-Fi evidence provider must not stop Brick Core tracking.

`CRASHISO-002` — Deliberately failing/crashing the BLE evidence provider must not stop Brick Core tracking.

`CRASHISO-003` — Deliberately failing/crashing magnetometer/geomagnetic processing must not stop Brick Core tracking.

`CRASHISO-004` — Deliberately failing/crashing Atlas learning must not stop Brick Core tracking.

`CRASHISO-005` — Deliberately failing/crashing particle/hypothesis work must not stop Brick Core tracking.

`CRASHISO-006` — Deliberately failing/losing Shizuku must not stop Brick Core tracking.

`CRASHISO-007` — Provider/worker failure is surfaced through health/diagnostics while unaffected critical subsystems continue.

`BATOPT-001` — Measure battery impact attributable to each major optional evidence/provider subsystem on real target hardware before acceptance.

`BATOPT-002` — If an advanced feature materially worsens battery/reliability for negligible useful location value, tune or remove/disable it rather than keeping it for feature count.

`PERF-001` — Hardening measures CPU, memory and wakeups.

`PERF-002` — Hardening measures sensor sampling, Wi-Fi scan cadence and BLE duty cycle.

`PERF-003` — Hardening measures database growth and device/network data transfer.

`PERF-004` — Hardening measures Worker requests, D1 operations, Queue traffic and R2 growth where those services are part of the production architecture.

`P8GATE-001` — Phase 8 hardening cannot close with an open critical reliability/security/privacy issue.

`P8GATE-002` — Optional target-device capabilities may close as `UNSUPPORTED — VERIFIED`, but may not remain `UNKNOWN` for the actual qualification phone/profile.

## Production APK and release identity

`RELAPK-001` — Production candidate is an actual release APK signed by the permanent/stable Brick V1 release identity, not a debug APK.

`RELAPK-002` — Release signing process keeps private signing secrets out of Git/source and records secure recovery/identity evidence.

`RELAPK-003` — Release candidate records versionCode, versionName, R8/ProGuard review, release configuration, APK SHA-256, signing-certificate fingerprint and reproducible source identity.

`APKINSPECT-001` — Inspect final APK packaging for manifest, permissions, exported components, package name and version identity.

`APKINSPECT-002` — Inspect final APK for signing certificate, network security configuration, packaged dependencies, services and receivers.

`RELID-001` — A release record binds Android source SHA, backend source SHA, schema version, protocol version, map version, Atlas/model version and dashboard version.

`RELID-002` — Production acceptance forbids an APK from one revision communicating with an unidentified/mismatched backend/browser/schema revision.

`BROWSERQ-001` — Full production browser qualification uses the real intended authenticated parent session/path, not a bypassed development auth mode.

`BROWSERQ-002` — Production browser matrix covers login/logout, live map, WebSocket, history, playback, trips, places/geofences, SOS, I'M SAFE, health, crash/reliability/retention views, private map, Atlas/degraded UI, parent Location control, witness state and receiver state where applicable.

## Location-OFF acceptance matrix

`QUALOFF-001` — Location-OFF qualification covers walking and vehicle motion.

`QUALOFF-002` — Location-OFF qualification covers known-route and unknown-route cases.

`QUALOFF-003` — Location-OFF qualification covers indoor, Home and School/known-place cases where safely testable.

`QUALOFF-004` — Location-OFF qualification varies availability of geomagnetic match, radio match, Wi-Fi semantics, Witness, Ground receiver and Shizuku rather than testing only the best-case evidence stack.

`QUALOFF-005` — Every Location-OFF case verifies honest uncertainty/state presentation; unavailable evidence cannot be replaced with fake precision.

`QUALREV-000` — The complete `QUALREV-001..014` reversible-control/latency/notification matrix is executed on both approved target OPPO profiles specified by the current master plan.

## Witness and Ground acceptance matrices

`QWIT-001` — Witness qualification tests rotating-ID generation/rotation expiry and replay of an old ID.

`QWIT-002` — Witness qualification tests unauthorised and authorised witness submissions.

`QWIT-003` — Witness qualification tests poor and fresh/good witness-position uncertainty.

`QWIT-004` — Witness qualification tests weak and strong BLE RSSI without treating RSSI as exact distance.

`QWIT-005` — Witness qualification tests witness movement and multiple witnesses.

`QGROUND-001` — Ground qualification tests one receiver and several receivers.

`QGROUND-002` — Ground qualification tests receiver offline, stale and wrong-configuration states.

`QGROUND-003` — Ground qualification tests replayed and duplicate sightings.

`QGROUND-004` — Ground qualification tests receiver/backend connectivity outage and recovery.

## Final classification

`RELEASECLASS-001` — Before Phase 9 acceptance closes, Brick may be classified at most `RELEASE CANDIDATE`, not production qualified.

`RELEASECLASS-002` — `PRODUCTION QUALIFIED` is permitted only after the complete Phase 9 acceptance contract passes.

## Round-2 count

Current atomic IDs in this Round-2 amendment file: **112**.

As with Round 1, this is a provisional amendment count. Final Phase 8A must reconcile semantic overlap against the 456-row base ledger and Round-1 amendments before publishing one unique-current-requirement total.
