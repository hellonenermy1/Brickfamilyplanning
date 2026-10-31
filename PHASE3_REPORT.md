# Brick V1 Phase 3 — Motion Intelligence, Learned Odometry & Particle Positioning

Date: 2026-11-01
Status: **SOURCE-COMPLETE / ACCEPTANCE-READY / NOT ACCEPTED**
Production qualification change: **none**

## Exact frozen staging pair

- Android `v1-p3-motion-positioning-android`: `48423e5ba84dd6273315581f6c101141e5eae9ac`
- Android PR #10: draft/unmerged, base `v1-p2-evidence-android`
- Cloud `v1-p3-motion-positioning-cloud`: `3db7c6c54fcf4a6b35afa22e91076178fde29de9`
- Cloud PR #9: draft/unmerged, base `v1-p2-evidence-cloud`
- Phase 3 exact-pair CI run: `41254615824`

Phase 3 was intentionally developed on top of the unmerged Phase 2 staging branches. It must not be merged into canonical branches or called accepted until Phase 2 closes and Phase 3's own execution/device gates pass.

## Requirements addressed

Primary Phase 3 owner requirements include:

- `DR-001`, `DR-002`, `DR-003`
- `POS-003`, `POS-004`, `POS-005`
- `FILT-004`, `FILT-005`, `FILT-006`, `FILT-007`
- `PF-001` through `PF-006`
- `MAG-001` through `MAG-005` where Phase 3 owns capture/sequence matching; Atlas-level learning remains Phase 4
- `LAND-001` through `LAND-003`
- `ODO-001` through `ODO-007`
- `ARR-002` Phase 3 motion/landmark contribution only

## Implemented Android architecture

### Motion adapter and bounded sensor features

`MotionEngine` now has a Phase 3 adapter for:

- linear acceleration where available, with accelerometer/gravity fallback;
- gyroscope;
- geomagnetic field;
- rotation vector;
- step counter/detector;
- light/proximity only as weak placement/context features.

Sampling profiles are explicit: `LOW_POWER`, `NORMAL`, `DEGRADED`, `SOS`. Android sensor streams are treated as evidence and may individually become unhealthy/unavailable without breaking Brick Core.

The rotation-vector world frame is used as Earth-relative East/North/Up. Android's current documentation describes the rotation-vector reference frame as X approximately East, Y toward geomagnetic North and Z up; this assumption was externally rechecked during Phase 3.

### Pure motion feature processor

`Phase3MotionCore.kt` maintains bounded recent windows and derives:

- acceleration/gyro features;
- heading and heading change;
- step cadence;
- magnetic magnitude/gradient sequence;
- stationary score;
- conservative phone placement (`HAND_LIKELY`, `POCKET_OR_BAG_LIKELY`, `UNKNOWN`);
- bounded landmark events including turns, stop/start, bump/rough and vertical-step-pattern clues.

One event is never treated as a location.

### Learned odometry

`LearnedOdometryModel` implements:

- walking/running stride learning only from good trusted fixes;
- separate model keys by motion mode and measurable placement;
- separate stationary, walking, running, bicycle, vehicle and unknown behavior;
- zero-velocity correction under strong stationary evidence;
- bounded wheeled propagation from trusted previous speed and bounded acceleration;
- no indefinite raw-acceleration integration;
- explicit uncertainty growth.

### Particle/hypothesis positioning

`ParticlePositionEngine` maintains a deterministic set of 96 hypotheses by default. It:

- initializes around a trusted precise/assisted fix;
- propagates many hypotheses rather than one guessed point;
- reweights using motion, actual route/path geometry, repeated magnetic sequences and repeated physical-landmark sequences;
- performs bounded resampling;
- keeps scalar uncertainty monotonic between trusted fixes;
- expires after 20 minutes of unsupported propagation or >=5 km uncertainty;
- recenters cleanly when a trusted fix returns;
- refuses to restore continuous inertial state across an `elapsedRealtime` reboot reset.

Internal particle weights are not exposed as calibrated user probabilities.

### Route/path constraints

`LocalRouteGraph` supports two evidence sources:

- `LEARNED`: path segments observed during good trusted movement;
- `PRIVATE_MAP`: signed private-map geometry fetched from Brick's Cloudflare backend.

Important anti-overconfidence rules:

- one-off learned paths are weaker than repeated learned paths;
- private-map geometry is a broad movement-plausibility constraint, not legal navigation truth;
- stationary particles are never pulled toward roads;
- missing graph coverage is never interpreted as a wall/barrier;
- private-map segments expire after 7 days;
- single learned route segments expire after 45 days;
- repeated learned route segments expire after 180 days;
- badly future-skewed route timestamps are discarded;
- private-route timestamps/freshness use phone receipt time rather than trusting server wall-clock skew.

**Explicit non-claim:** Phase 3 does not have general building-wall polygons. It cannot truthfully guarantee that a walking hypothesis never crosses an indoor wall where no wall geometry exists. `ODO-006` is implemented only to the extent that actual available path/private-map constraints support it; broader indoor geometry remains unproven/data-limited.

### Private route graph Cloud path

Cloud Phase 3 adds `worker-v8` and a signed `/api/device/{id}/route-graph` endpoint over the existing Phase 2/Phase 6 worker.

Properties:

- canonical v4 device identity;
- paired/non-revoked device required;
- P-256 signature over exact bounded request bytes;
- requester-attempt rate limit before auth and device bucket after valid signature;
- request body <=1,024 bytes;
- server extraction radius fixed to 650 m;
- maximum 256 segments;
- private Singapore PMTiles source;
- recognized detailed road class preferred; unrecognized detail may fall back to a recognized broad road class; unknown/non-road classes remain excluded;
- private map failure returns optional-provider failure and never invents geometry.

Android additionally validates:

- response <=128 KiB;
- exact requested center;
- radius <=650 m;
- <=256 segments;
- serialization-safe segment IDs;
- only known movement mode bits;
- segment geometry actually intersects the declared local radius, with a small tolerance.

### Magnetic sequence evidence

Magnetic matching uses orientation-corrected multi-sample sequences, not one reading. Smooth/common field patterns are discarded. A signature needs repeated trusted observations before it contributes. Magnetic support only reweights route/particle hypotheses; it never produces a standalone coordinate.

Magnetic signatures expire after 90 days and must be relearned.

### Physical landmark sequence evidence

Physical landmarks are compact multi-event sequences. A single bump, turn or stop has no location authority. A sequence needs repeated trusted observations before it contributes to a route hypothesis.

Landmark signatures expire after 90 days and must be relearned.

### Fused-fix consistency guard

`PositionConsistencyGuard` executes before a fused fix can update trusted state or train Phase 3 models.

It can reject only strong contradictions such as:

- hard accuracy-adjusted physics-speed violation;
- extreme acceleration when coordinate displacement independently supports the claimed high speed;
- strong stationary evidence plus a large high-quality displacement;
- high-confidence walking/running with a working step sensor, virtually no steps and a large high-quality displacement;
- sudden high-quality walking/running bearing reversal only when the previous trusted travel bearing already agreed with a fresh hand-held phone heading.

Fail-open rules are deliberate:

- missing/weak sensors do not reject GPS;
- bag/pocket orientation is not treated as travel direction;
- phone orientation alone does not reject GPS;
- a speed-field glitch alone cannot reject an otherwise plausible coordinate;
- raw rejected GPS remains in the normal raw observation fields and is not deleted.

Only rejection reason/time/count are written to diagnostics; no rejected coordinates are copied into health telemetry.

### Long process-gap handling

If the process was absent long enough that Brick cannot know the intervening turn path, Phase 3 does not replay missed steps down one guessed heading. Direct propagation is limited to a 30-second gap; longer gaps suppress direct displacement and grow uncertainty aggressively.

### Encrypted state

`Phase3StateStore` persists odometry, routes, magnetic/landmark models and particles to `brick_phase3_state.bin` using Brick's existing Android-Keystore-backed `JournalCipher` and `AtomicFile`.

- plaintext limit is bounded;
- encrypted size is bounded;
- fsync + atomic finish/fail path;
- corrupt state fails closed and is deleted rather than being interpreted;
- state health/failure counters are exposed without model contents.

### Privacy-safe health

Health publishes counts/state only, including:

- Phase 3 initialized;
- learned/private route counts;
- current uncertainty and age from trusted fix;
- whether route constraints are active;
- accelerometer/gyro/magnetic/rotation health;
- encrypted state health;
- route-cache provider health/failure counts;
- consistency rejection count/reason/age.

No route coordinates, raw IMU vectors, magnetic fingerprints or particle cloud are sent in health telemetry.

## Source tests present

Android instrumentation source covers:

- learned odometry and ZVC;
- particle uncertainty growth, route elimination, persistence, reboot refusal, expiry and precise-fix recovery;
- stationary route isolation;
- route evidence expiry;
- repeated magnetic/landmark sequence requirement and 90-day expiry;
- fused-fix consistency rejection and fail-open cases;
- speed-only metadata glitch fail-open behavior;
- encrypted state round-trip, plaintext absence, corruption fail-closed and oversized-state rejection;
- route response ID/locality/mode-mask/center/radius validation.

Cloud test source covers:

- road-class movement masks and broad-class fallback;
- unauthorized and oversized route requests;
- real signed request path;
- route device rate limit;
- fixed client radius boundary;
- revoked device rejection;
- retained Phase 2 evidence tests and retained route-constraint regression.

## Executed evidence

Real local execution achieved before the final freeze:

- `PHASE3_PURE_CORE_ACCEPTANCE_PASS` on the earlier pure core implementation covering learned odometry/ZVC, route graph behavior, repeated sequence support, particle persistence, uncertainty growth, route elimination, long-outage expiry and trusted-fix recovery.
- latest focused `PositionConsistencyGuard` Kotlin/JVM checks passed normal walking, strong stationary rejection, no-step rejection, coordinate-supported acceleration rejection, speed-only metadata fail-open, plausible vehicle change, calibrated reversal rejection, weak-sensor fail-open and hard teleport rejection.

Evidence boundary: later hardening added route/sequence TTLs, stationary route isolation, health publishing, route response locality/ID validation and encrypted-state instrumentation after the original full pure-core marker. Those changes are source-reviewed and test-covered but have **not** received a complete Android framework/emulator run because hosted jobs still do not start.

## Hosted CI blocker

Run `41254615824` on Cloud `3db7c6c54fcf4a6b35afa22e91076178fde29de9` pins Android `48423e5ba84dd6273315581f6c101141e5eae9ac`.

Observed jobs:

- Phase 3 Cloud + retained regressions: `failure`, no step data / no source execution;
- Phase 3 Android compile/lint/dependency-lock: `failure`, no step data / no source execution;
- Phase 3 Android instrumentation: skipped.

This is the same external execution pattern seen in Phase 2. It is neither a source pass nor evidence of a source defect.

## Monday physical-device qualification required

When the real OPPO/ColorOS test becomes available, Phase 2 must be closed first. Then Phase 3 device qualification should explicitly measure:

1. accelerometer, gyro, magnetometer, rotation-vector and step availability/health on the actual phone;
2. normal walking hand-held and pocket/bag behavior;
3. running behavior;
4. bicycle behavior if safely testable;
5. vehicle behavior if safely testable as passenger/data collection, not while operating a vehicle;
6. stationary ZVC: no growing fake motion while the phone sits still;
7. GNSS loss while Location remains ON: short walk continues with growing uncertainty;
8. multiple turns: wrong path hypotheses reduce rather than Brick following one hidden snapped road;
9. private route graph received/cached, then network removed: local route evidence remains usable;
10. no-map/route-provider failure: odometry continues and uncertainty grows rather than failing tracking;
11. long process gap >30 s: Brick does not replay missed steps down one guessed heading;
12. process death/restart in the same boot: encrypted state restores safely;
13. reboot: continuous inertial particle state is not falsely restored across elapsed-realtime reset;
14. precise fix return: particle estimate recenters and uncertainty collapses to the new trusted fix;
15. magnetometer/rotation degradation or strange phone orientation: weak sensors fail open instead of rejecting good GPS;
16. deliberate GNSS spike/teleport scenario where safely reproducible: strong contradiction rejected while raw observation remains available;
17. battery/CPU impact for normal, degraded and SOS sampling profiles;
18. screen-off/background/ColorOS pressure for several hours;
19. verify health fields reflect sensor/provider failure/recovery without raw sensor/location leakage.

Do not manufacture device outcomes. Unsupported/missing sensors become measured capability states rather than invented support.

## Exit decision

Phase 3 is **source-complete and acceptance-ready**, but **NOT ACCEPTED**.

Acceptance requires:

1. Phase 2 acceptance/dependency closure;
2. a real hosted exact-pair Cloud test pass;
3. exact Android dependency-lock/compile/lint pass;
4. Android instrumentation execution;
5. relevant physical OPPO/ColorOS Phase 3 qualification;
6. repair of any real failures without weakening the contract;
7. only then merge PR #9/#10 into the Phase 2 staging/canonical progression and mark Phase 3 accepted.
