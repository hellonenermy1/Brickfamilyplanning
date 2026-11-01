# Brick V1 Phase 4 Source Inventory

Date: 2026-11-01
Android candidate: `f6cfcc178ee8a4e7799c176e350c5b967c56069d`
Cloud candidate: `bfe99f59697944467b0ac11fc2253ca16b68fa0b`

This inventory records source existence only. It is not device or production acceptance evidence.

## Android Phase 4 Atlas core

### `app/src/main/java/com/brick/safety/atlas/AtlasModel.kt`
- Phase 4 signal kinds/classes and candidate model.
- Coarse environmental grid/zone primitive.
- Derived transition kind appended without shifting earlier enum ordinals.

### `EnvironmentalAtlas.kt`
- trusted-position-only learning gate;
- bounded label/signal model;
- running signal distributions;
- geographic spread and visit history;
- independence-group contribution caps;
- cautious negative evidence with global hard cap;
- scoped disappearance groups so unrelated providers/categories cannot manufacture absence;
- repeated trusted-miss history;
- automatic relation retirement/relearning after repeated trusted disappearance;
- replacement-signal eligible-scan denominator so new router/beacon evidence is not penalised by the place's entire historical lifetime;
- encrypted-state codec compatibility with older Phase 4 relation formats;
- bounded retention/pruning.

### `SignalTrustEngine.kt`
- TRUSTED_ANCHOR, DISTINCTIVE_STATIC, LOCAL_COMMON, GLOBAL_COMMON, MOBILE, UNSTABLE, STALE and UNKNOWN classification;
- geographic uniqueness/spread, stability, freshness, quality, source health, repeat count and spoof-resistance weighting;
- very weak derived-transition trust;
- support weight explicitly remains an internal weight, not calibrated probability.

### `AtlasTransitionTracker.kt`
- privacy-reduced material environmental transitions;
- broad activity transitions only above confidence threshold;
- short bounded sequence signatures;
- Wi-Fi RSSI route-gradient signatures from repeated stable BSSIDs;
- small radio churn ignored;
- transition/sequence/gradient evidence remains in originating independence group, preventing derived evidence from masquerading as a new sensor.

### `AtlasPrivacyId.kt`
- Android-Keystore-backed keyed/HMAC identifier reduction retained.

### `AtlasStateStore.kt`
- encrypted local Atlas state retained with corruption fail-closed behavior.

### `Phase4AtlasController.kt`
- owns Phase 4 provider lifecycle inside Brick foreground tracking lifecycle;
- trains only from fresh accepted PRECISE/ASSISTED trusted positions;
- coarse zone attached to training label;
- environmental/activity transition learning;
- provider health publication;
- critical duplicate-learning fix: only the newly arrived provider scan is trained once; the short combined cache is used for matching only.

## Wi-Fi

### `WifiEnvironmentProvider.kt`
- privacy-reduced BSSID and SSID hint;
- fresh Android scan-age validation;
- consumes each Android scan generation once;
- passive `SCAN_RESULTS_AVAILABLE_ACTION` receiver so successful platform scans can be consumed immediately without waiting for a later long stationary pulse;
- scheduled `startScan()` remains bounded by Phase 2 sampling coordinator and Android throttling;
- RSSI, relative AP ordering, AP co-occurrence;
- reduced correlated band/frequency/channel/channel-width/security metadata;
- common SSID hints;
- no raw BSSID retained in Atlas.

### `WifiRttEnvironmentProvider.kt`
- capability/permission gated RTT;
- range and standard-deviation handling;
- same `wifi.scan` independence group as Wi-Fi RF evidence;
- unsupported/unavailable hardware fails as provider state rather than breaking Brick Core.

## BLE

### `BleEnvironmentProvider.kt`
- scans advertisements Android legitimately exposes rather than Brick-owned beacons only;
- reduced advertisement identity;
- RSSI aggregation;
- Tx power, manufacturer/service fingerprint, reduced UUIDs, SID and PHY metadata;
- BLE co-occurrence features;
- successful completed empty scans produce only a semantic-common weak absence sentinel;
- scan failure/unavailable path never becomes absence evidence.

## Cellular

### `CellularEnvironmentProvider.kt`
- LTE/NR environment from `allCellInfo`;
- privacy-reduced identity;
- RSRP/dBm, RSRQ, SINR/RSSNR, Timing Advance where exposed, channel and band information;
- registered + neighbour cells;
- Android platform snapshot timestamp dedupe so one cached `CellInfo` set cannot fabricate repeatability;
- material cellular environment changes feed generic transition learning;
- no tower triangulation.

## GNSS sky

### `GnssSkyProvider.kt`
- `GnssStatus` aggregate only;
- constellation mix/count;
- used-in-fix count;
- C/N0 average, distribution buckets and standard deviation;
- azimuth/elevation distribution;
- carrier-frequency bands;
- coarse open/constrained/blocked/degraded/mixed aggregate state;
- no permanent satellite identity;
- no claim that aggregate degradation proves multipath;
- exact GNSS-status snapshot dedupe so repeated foreground pulses cannot fabricate repeated observations.

## LAN

### `LanEnvironmentProvider.kt`
- authorised Android NSD discovery for selected useful service classes: Google Cast, AirPlay, IPP/printer, Matter and HTTP;
- privacy-reduced service identity;
- per-category Atlas absence scope (`lan.nsd.<category>`);
- discovery failure never creates negative evidence;
- a successfully completed empty category scan creates only a semantic-common weak category sentinel;
- evidence wire group remains canonical `lan.nsd`.

Explicit partial: no broad raw SSDP/UPnP probing or generic gateway fingerprint was added merely to satisfy a checklist. Platform local-network permission, privacy and power behavior remains a later verified design decision.

## Network / device context

### `NetworkContextProvider.kt`
- active transport;
- IPv4/IPv6 availability;
- reduced DNS context;
- validated/captive/metered state;
- explicit offline evidence so loss/recovery and transport changes can enter transition learning;
- no active ping loop or synthetic packet-loss workload.

### `DeviceContextProvider.kt`
- weak charging/plug/battery context only.

Explicit partial: despite the historical provider enum name `COMPANION`, this source does not claim an arbitrary nearby/bonded device is a trusted companion. Proper companion evidence requires explicit authorisation/association and presence lifecycle.

## Android test source

- `Phase4AtlasCoreInstrumentedTest.kt` — trusted training gate, repeated visits, common/mobile signal behavior, one-family confidence cap, independent-family support, missing-provider behavior, expiry.
- `Phase4SignalTrustInstrumentedTest.kt` — trusted-anchor/local-common, unstable/stale, charging weakness, router replacement, copied SSID, beacon/LAN replacement, LAN absence-scope isolation, cellular-change adversarial case.
- `Phase4AtlasStateInstrumentedTest.kt` — HMAC privacy, encrypted round trip, corrupt-state fail closed.
- `Phase4TransitionInstrumentedTest.kt` — material transition vs churn, Wi-Fi route gradient, derived-sequence correlation, weak activity rejection, coarse zone stability.
- Retained Phase 2/3 Android instrumentation remains in the candidate and is run by Phase 4 CI.

## Cloud / wire side

### `v1-p4-atlas-trust-cloud`
Relative to Phase 3 cloud staging, Phase 4 adds/changes:
- `.github/workflows/v1-phase4-atlas-trust-ci.yml` — exact Android SHA pin, Cloud regressions, Android dependency lock/compile/lint/APK/instrumentation gate and architecture invariant checks;
- `scripts/test-phase4-provider-contract.mjs` — exact Android↔Cloud provider/wire mapping checks;
- retained Phase 2 evidence regression compatibility updates;
- `src/evidence-ingest.ts` compatibility/hardening used by retained evidence tests.

The Phase 4 cloud branch does not perform final Atlas fusion. Phase 5 remains the owner of central hypothesis fusion.

## Unmodified architectural invariants deliberately retained

- live-location packet remains the existing 90-byte Core protocol;
- Phase 4 environmental evidence continues through the Phase 2 durable evidence journal/ACK path instead of creating a side-channel transport;
- SOS/live location retain priority over evidence backlog;
- Atlas providers remain optional evidence sources and cannot make Brick Core unavailable;
- final child location remains outside Phase 4.
