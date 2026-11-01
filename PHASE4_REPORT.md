# Brick V1 Phase 4 Progress / Verification Report

Date: 2026-11-01
Phase: 4 of 9 — Environmental Fingerprint Atlas & Signal Trust Engine
Current result: **SOURCE-HARDENED / FINAL EXACT-PAIR CI QUEUED / REAL OPPO + DEPENDENCY ACCEPTANCE GATES PENDING / NOT ACCEPTED**
Production qualification change: **none**

## Exact frozen candidate pair

- Android `v1-p4-atlas-trust-android`: `93d7424d9d9f4a33c283c54411605a6f4871e799`
- Cloud `v1-p4-atlas-trust-cloud`: `6c66ba8735b3362255e29ca51e50fcb52dcc1dff`
- PR #11 remains draft/unmerged.
- Final exact-pair CI: `41269624890`.

No Phase 4 runtime source is promoted to canonical branches by this report.

## What Phase 4 now implements

The candidate provides a local Environmental Atlas and Signal Trust layer that learns only under fresh accepted trusted positions and never becomes the final position engine. It includes:

- privacy-reduced Wi-Fi/BLE/LAN/cellular/GNSS/network fingerprints;
- repeated Wi-Fi RSSI distributions, relative ordering, cluster co-occurrence and reduced AP metadata;
- bounded Wi-Fi route-gradient and material environment transition signatures;
- capability-gated Wi-Fi RTT with range uncertainty retained in the same Wi-Fi correlation group;
- BLE advertisement identity, RSSI, Tx-power, manufacturer/service/UUID/SID/PHY and cluster evidence;
- LTE/NR identity/signal/band/channel/Timing Advance where Android exposes them, plus neighbor/environment transitions;
- aggregate GNSS sky fingerprints without permanent satellite identity;
- Android NSD LAN evidence with per-category absence scopes;
- passive network transport/IP/DNS/captive/validated/offline context and loss/recovery transitions;
- authorised companion presence from explicit Android Companion Device Manager associations only;
- weak charging/device-power context sharing the same `device.context` independence group as companion presence;
- coarse environmental zones and low-trust broad activity/environment sequences;
- geographic spread, repeated-visit stability, freshness, quality, source-health, spoofability and correlation-aware Signal Trust;
- cautious negative evidence and automatic replacement/relearning;
- encrypted local Atlas state and privacy-reduced identifiers;
- cache/snapshot dedupe so repeated foreground pulses cannot manufacture repeatability from the same platform observation.

## Reliability fixes retained in the final source candidate

1. Training uses only the newly arrived provider scan; the 15-second multi-provider cache is match-only.
2. Wi-Fi, cellular and GNSS platform generations/snapshots are consumed once so foreground pulses cannot manufacture repeatability.
3. Derived transitions and route gradients inherit the source independence group rather than pretending to be extra sensors.
4. Negative evidence remembers the specific observation scope allowed to prove absence.
5. LAN discovery failure and BLE scan failure remain unknown/degraded, not absence.
6. Replacement signals use an eligible-scan history beginning when the replacement appears.
7. Companion presence is restricted to explicit Android associations; raw legacy MAC addresses are reduced before Brick persistence.
8. API 31–32 and API 33+ companion callback services are separated and manifest-gated so newer framework types are not loaded on older supported Android versions.
9. Companion presence cache is ephemeral and cleared across reboot/package replacement while the Android association remains intact.
10. Companion observation bookkeeping reconciles against current associations. If an association is removed, Brick forgets only its process-local subscription marker so the same device can be re-associated and observed again without restarting Brick.
11. A failed companion presence subscription start is retryable rather than becoming permanently marked as already-started.

## Deliberate non-claims / open Phase 4 boundaries

These remain explicit rather than being hidden behind a checklist:

- LAN support is an authorised Android NSD subset. Broad raw SSDP/UPnP/NAS probing is not claimed complete without proving permission/privacy/power value.
- Network loss/recovery is learned, but Brick does not add an active ping/packet-loss workload merely to tick a requirement row.
- Broad activity/environment sequences and coarse zones exist, but no specific stairs/lift/corridor/floor truth is claimed without ground truth.
- No persistent time-of-day-only predictor is allowed to become location truth.
- Companion association setup UX and real target-device callback behavior remain integration/device-verification work.
- Phase 5 owns final multi-source location/state/area/uncertainty decisions.

## Hosted evidence

### Superseded checkpoints

Run `41268830935` verified the immediately preceding candidate through:

- Phase 4 provider/wire contract + retained Phase 2/3 Cloud regressions — **PASS**;
- Android dependency lock — **PASS**;
- Android debug/test APK compile + lint — **PASS**;
- Phase 4 architecture invariants — **PASS**.

That run is not final evidence because the companion re-association self-healing hardening was added afterwards.

### Final candidate

Run `41269624890` is the only final-candidate hosted gate for Android `93d7424d...` + Cloud `6c66ba87...`.

Current state at this report revision: **QUEUED / NO FINAL PASS CLAIMED**.

No PASS from an earlier SHA is substituted for this final pair.

## Phase 4 exit-gate source coverage

Source tests cover:

- common SSID;
- copied SSID;
- moving BLE classification;
- replaced router;
- replaced beacon;
- replaced LAN device with provider-category scoping;
- changing cellular environment;
- one correlated family cannot manufacture precise truth;
- derived evidence cannot manufacture a new independence group;
- trusted companion + charging context cannot manufacture independent confirmations;
- stale companion presence can be cleared without deleting the Android association;
- remove → re-associate can re-register presence without a Brick process restart;
- failed presence registration can be retried.

The exact final candidate still needs its hosted build/instrumentation result and physical target-device runs before these become final evidence.

## Formal dependency boundary

Phase 2 and Phase 3 are not formally accepted while their required real Android/OPPO/hosted/live dependency gates remain open. Phase 4 staging work does not override that ordering and cannot become formally accepted ahead of those dependencies.

## Required closeout before Phase 4 acceptance

1. Finish final exact-pair run `41269624890`; repair any real compile/lint/instrumentation failure without weakening trust, privacy or uncertainty rules.
2. Run the required physical OPPO/ColorOS Phase 4 tests: screen-off/background Wi-Fi/BLE, real provider availability, GNSS degradation, LTE/5G change, companion presence, replacement/relearning, process/reboot recovery and resource measurements.
3. Verify Wi-Fi RTT as supported or cleanly unsupported on target hardware.
4. Verify LAN behavior under target Android/ColorOS networking permissions.
5. Keep the deliberate partial capabilities above partial unless evidence justifies promotion.
6. Close Phase 2 and Phase 3 formal acceptance prerequisites.
7. Update the requirement matrix/test evidence with the final run and device evidence.
8. Only then may Phase 4 be labelled `ACCEPTED` and Phase 5 formally unlock under the master plan.

## Current verdict

Phase 4 source is stronger than the earlier checkpoint and now includes companion re-association self-healing without extra scans, permissions or network traffic. It is **not accepted**. The final hosted exact-pair gate is still outstanding, and real OPPO/ColorOS qualification plus earlier phase dependencies remain mandatory.
