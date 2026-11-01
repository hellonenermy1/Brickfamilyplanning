# Brick V1 Phase 4 Source Inventory

Date: 2026-11-01
Android candidate: `93d7424d9d9f4a33c283c54411605a6f4871e799`
Cloud/CI candidate: `6c66ba8735b3362255e29ca51e50fcb52dcc1dff`
Exact-pair CI: `41269624890`

This inventory records source existence only. It is not physical-device or production-acceptance evidence.

## Android Phase 4 Atlas core

### `app/src/main/java/com/brick/safety/atlas/AtlasModel.kt`
- Phase 4 signal kinds/classes and candidate model.
- Coarse environmental grid/zone primitive.
- Derived transition kind appended without shifting earlier enum ordinals.

### `EnvironmentalAtlas.kt`
- trusted-position-only learning gate;
- bounded label/signal model and running distributions;
- geographic spread and visit history;
- independence-group contribution caps;
- cautious scoped negative evidence with a global hard cap;
- repeated trusted-miss history and automatic relation retirement/relearning;
- replacement-signal eligible-scan denominator;
- encrypted-state compatibility and bounded retention/pruning.

### `SignalTrustEngine.kt`
- `TRUSTED_ANCHOR`, `DISTINCTIVE_STATIC`, `LOCAL_COMMON`, `GLOBAL_COMMON`, `MOBILE`, `UNSTABLE`, `STALE`, `UNKNOWN`;
- geographic uniqueness/spread, stability, freshness, quality, source health, repeat count and spoof-resistance weighting;
- very weak derived-transition trust;
- support weight remains internal weight, not calibrated probability.

### `AtlasTransitionTracker.kt`
- privacy-reduced material environmental transitions;
- broad activity transitions above confidence threshold;
- bounded sequence signatures;
- Wi-Fi RSSI route-gradient signatures from repeated stable BSSIDs;
- derived evidence remains in its originating independence group.

### `AtlasPrivacyId.kt`
- Android-Keystore-backed keyed/HMAC identifier reduction.
- Used for long-lived environmental identities including legacy companion-address reduction.

### `AtlasStateStore.kt`
- encrypted local Atlas state with corrupt-state fail-closed behavior.

### `Phase4AtlasController.kt`
- owns Phase 4 provider lifecycle inside Brick foreground tracking lifecycle;
- trains only from fresh accepted PRECISE/ASSISTED trusted positions;
- attaches coarse zone to training label;
- learns environmental/activity transitions;
- publishes provider health;
- trains only the newly arrived provider scan once; short combined cache is match-only.

## Wi-Fi

### `WifiEnvironmentProvider.kt`
- privacy-reduced BSSID and SSID hint;
- fresh Android scan-age validation and scan-generation dedupe;
- passive scan-result receiver;
- bounded scheduled `startScan()` under existing sampling coordinator;
- RSSI, relative ordering, co-occurrence and reduced band/frequency/channel/width/security metadata;
- common-SSID hints;
- no raw BSSID retained in Atlas.

### `WifiRttEnvironmentProvider.kt`
- capability/permission-gated RTT;
- range + standard-deviation handling;
- same `wifi.scan` independence group as Wi-Fi RF evidence;
- unsupported/unavailable hardware degrades provider state instead of Brick Core.

## BLE

### `BleEnvironmentProvider.kt`
- legitimately exposed advertisements rather than Brick-owned beacons only;
- reduced identity, RSSI, Tx power, manufacturer/service fingerprint, reduced UUIDs, SID, PHY and co-occurrence;
- successful completed empty scan produces only weak semantic-common absence sentinel;
- scan failure/unavailable never becomes absence evidence.

## Cellular

### `CellularEnvironmentProvider.kt`
- LTE/NR environment from `allCellInfo`;
- privacy-reduced identity;
- RSRP/dBm, RSRQ, SINR/RSSNR, Timing Advance where exposed, channel/bands;
- registered + neighbor cells;
- platform snapshot timestamp dedupe;
- environment transitions only; no tower triangulation.

## GNSS sky

### `GnssSkyProvider.kt`
- aggregate `GnssStatus` only;
- constellation/count, used-in-fix, C/N0 distribution/stddev, azimuth/elevation and carrier bands;
- coarse open/constrained/blocked/degraded/mixed state;
- no permanent satellite identity and no custom raw-GNSS solver;
- exact-snapshot dedupe.

## LAN

### `LanEnvironmentProvider.kt`
- authorised Android NSD discovery for selected service classes such as Cast, AirPlay, IPP/printer, Matter and HTTP;
- privacy-reduced service identity;
- per-category absence scopes;
- discovery failure never creates negative evidence;
- successfully completed empty category scan creates only a weak sentinel.

Explicit partial: no broad raw SSDP/UPnP/NAS probing or generic gateway identity is promoted merely to satisfy a checklist. Expansion remains subject to Android permission, privacy and measured power/value constraints.

## Network context

### `NetworkContextProvider.kt`
- active transport, IPv4/IPv6 availability, reduced DNS context, validated/captive/metered state and explicit offline evidence;
- network loss/recovery and transport changes can enter transition learning;
- no active ping loop or synthetic packet-loss workload.

Explicit partial: latency/packet-loss measurement is not fabricated through extra traffic. Passive timings from already-required transport may be evaluated later if they provide measured value.

## Trusted companion / device context

### `CompanionPresence.kt`
- accepts presence only for Android `CompanionDeviceManager` associations, never arbitrary nearby/bonded Bluetooth devices;
- API 31–32 legacy callback service and API 33+ `AssociationInfo` callback service are separated so newer framework types are not loaded on older supported Android versions;
- manifest/resource SDK gating and system-only `BIND_COMPANION_DEVICE_SERVICE` protection;
- framework method references isolated behind API-gated helpers;
- legacy addresses HMAC/privacy-reduced before Brick persistence;
- removed associations prune stale presence state;
- presence cache is ephemeral and clearable after reboot/update without deleting the Android association;
- no silent association creation/enrollment;
- `CompanionObservationRegistry` tracks only process-local observation starts, reconciles against the current association-address set, forgets removed associations and allows the same explicitly authorised device to be observed again after re-association;
- failed observation starts clear their registry marker so later collection can retry automatically.

### `DeviceContextProvider.kt`
- weak charging/plug/battery context;
- weak authorised companion-presence context;
- charger and companion intentionally share `device.context`;
- missing battery sticky broadcast does not suppress valid companion evidence;
- bounded payload contains reduced companion IDs only;
- optional companion capability failure does not make Brick Core unhealthy.

### `app/src/main/AndroidManifest.xml`
- requests `REQUEST_OBSERVE_COMPANION_DEVICE_PRESENCE`;
- companion setup optional;
- two system-bound callback services protected by `BIND_COMPANION_DEVICE_SERVICE`;
- `tools:targetApi` and versioned boolean resources document/enforce service API gates.

### `app/src/main/res/values/bools.xml`, `values-v31/bools.xml`, `values-v33/bools.xml`
- API <31: both companion callback services disabled;
- API 31–32: legacy callback service only;
- API 33+: association callback service only.

### `reliability/BootReceiver.kt`
- clears only ephemeral companion-presence cache on reboot/package replacement before ordinary tracker self-recovery;
- keeps Android companion associations intact.

## Android test source

- `Phase4AtlasCoreInstrumentedTest.kt` — trusted training gate, repeated visits, common/mobile behavior, one-family confidence cap, independent-family support, missing-provider behavior, expiry.
- `Phase4SignalTrustInstrumentedTest.kt` — trust classes, router replacement, copied SSID, beacon/LAN replacement, LAN absence scope and cellular-change adversarial case.
- `Phase4AtlasStateInstrumentedTest.kt` — HMAC privacy, encrypted round trip, corrupt-state fail closed.
- `Phase4TransitionInstrumentedTest.kt` — material transition vs churn, route gradient, correlation, weak activity rejection, coarse zone stability.
- `Phase4CompanionContextInstrumentedTest.kt` — association pruning, reboot/update presence-cache clearing primitive, legacy-address privacy reduction, companion/charger anti-double-counting, remove→re-associate self-healing and retry after observation-start failure.
- Retained Phase 2/3 Android instrumentation remains in the candidate and is run by Phase 4 CI.

## Cloud / wire side

### `v1-p4-atlas-trust-cloud`
Relative to Phase 3 cloud staging, Phase 4 adds/changes:
- `.github/workflows/v1-phase4-atlas-trust-ci.yml` — exact Android SHA pin, Cloud regressions, Android dependency lock/compile/lint/instrumentation gate and architecture invariants;
- invariant checks lock the companion permission/API gates, weak shared independence group, anti-double-counting test and re-association/start-failure self-healing regressions into the exact candidate;
- `scripts/test-phase4-provider-contract.mjs` — Android↔Cloud provider/wire mapping checks;
- retained Phase 2 evidence regression compatibility updates;
- `src/evidence-ingest.ts` compatibility/hardening used by retained evidence tests.

The Cloud branch does not perform final Atlas fusion. Phase 5 remains the owner of central hypothesis fusion.

## Deliberately retained architectural invariants

- live-location packet remains the existing 90-byte Core protocol;
- Phase 4 evidence uses the retained Phase 2 durable evidence journal/ACK path, not a side-channel transport;
- SOS/live location retain priority over evidence backlog;
- Atlas providers remain optional evidence sources and cannot make Brick Core unavailable;
- final child location remains outside Phase 4.
