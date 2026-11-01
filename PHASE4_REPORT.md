# Brick V1 Phase 4 Progress / Verification Report

Date: 2026-11-01
Phase: 4 of 9 — Environmental Fingerprint Atlas & Signal Trust Engine
Current result: **SOURCE-HARDENED / EXACT-PAIR CI IN PROGRESS / REAL OPPO + DEPENDENCY ACCEPTANCE GATES PENDING / NOT ACCEPTED**
Production qualification change: **none**

## Exact frozen candidate pair

- Android `v1-p4-atlas-trust-android`: `f6cfcc178ee8a4e7799c176e350c5b967c56069d`
- Cloud `v1-p4-atlas-trust-cloud`: `bfe99f59697944467b0ac11fc2253ca16b68fa0b`
- PR #11 remains draft/unmerged.
- Exact-pair CI: `41267183265`.

No Phase 4 runtime source is promoted to canonical branches by this report.

## What Phase 4 now implements

The candidate provides a local Environmental Atlas and Signal Trust layer that learns only under fresh accepted trusted positions and never becomes the final position engine. It includes:

- privacy-reduced Wi-Fi/BLE/LAN/cellular/GNSS/network fingerprints;
- repeated Wi-Fi RSSI distributions, relative ordering, cluster co-occurrence and reduced AP metadata;
- bounded Wi-Fi route-gradient and material environment transition signatures;
- capability-gated Wi-Fi RTT with range uncertainty retained in the same Wi-Fi correlation group;
- BLE advertisement identity, RSSI, Tx-power, manufacturer/service/UUID/SID/PHY and cluster evidence;
- LTE/NR identity/signal/band/channel/Timing Advance where the Android API exposes them, plus neighbor/environment transitions;
- aggregate GNSS sky fingerprints using constellation/count/CN0/azimuth/elevation/used/carrier data without permanent satellite identity;
- Android NSD LAN evidence with per-category absence scopes;
- passive network transport/IP/DNS/captive/validated/offline context and loss/recovery transitions;
- weak charging/device-power context;
- coarse environmental zones and low-trust broad activity/environment sequences;
- geographic spread, repeated-visit stability, freshness, quality, source-health, spoofability and correlation-aware Signal Trust;
- cautious negative evidence and automatic replacement/relearning;
- encrypted local Atlas state and privacy-reduced identifiers;
- cache/snapshot dedupe so repeated foreground pulses cannot manufacture repeatability from the same Wi-Fi, cellular or GNSS platform observation.

## Important reliability fixes made during Phase 4 closeout

1. Training uses only the newly arrived provider scan; the 15-second multi-provider cache is match-only. This prevents another provider callback from re-training the same old Wi-Fi/BLE/etc. observation.
2. Wi-Fi scans are keyed to Android scan-generation time and consumed once. A passive scan-results receiver can consume fresh platform results immediately without creating an extra scan loop.
3. Cellular `CellInfo` snapshots and GNSS `GnssStatus` snapshots are each consumed once.
4. Derived transitions and route gradients inherit the source independence group rather than pretending to be an extra sensor.
5. Negative evidence remembers the specific observation scope that is allowed to prove absence.
6. LAN absence is category scoped. Printer discovery cannot imply a Cast device disappeared.
7. LAN discovery failure and BLE scan failure remain unknown/degraded, not absence. Only successfully completed empty scans can produce weak absence evidence.
8. New replacement signals use an eligible-scan history beginning when the replacement appears, so a new router/beacon is not suppressed by months of earlier place history.

## Deliberate non-claims / open Phase 4 items

These are recorded rather than hidden:

- **Trusted companion presence:** charging context exists, but no arbitrary bonded/nearby device is treated as a trusted companion. Proper explicit association/presence enrollment is still open and must not be faked.
- **Broad LAN signature:** Android NSD covers useful authorised service categories, but generic gateway characteristics and raw SSDP/UPnP/NAS scanning are not claimed complete. Any expansion must respect Android local-network permissions, privacy and power cost.
- **Network latency/packet loss:** loss/recovery state is learned, but Brick does not run an active ping/packet-loss workload merely to tick a box. Passive or already-required transport metrics may be integrated later if measured value justifies cost.
- **Specific stairs/lift/corridor/floor truth:** broad activity/environment sequences and coarse zones exist; Brick does not claim a validated floor or specific building-transition classifier without ground-truth evidence.
- **Persistent schedule prior:** no time-of-day-only location predictor was added. A schedule may only be a weak prior in later fusion and must not become location truth.
- **Final candidate fusion:** Phase 5 owns final multi-source location/state/area/uncertainty decisions.

These gaps mean Phase 4 is not marked accepted merely because the core Atlas source is mature.

## Exact-pair hosted evidence so far

Run `41267183265`:

- Phase 4 provider/wire contract + retained Phase 2/3 Cloud regressions — **PASS**.
- exact Android SHA verification — reached successfully.
- Android dependency lock — **PASS**.
- Android debug/test APK compile + lint — **IN PROGRESS** at this report revision.
- Android instrumentation — **PENDING** behind build gate.

Earlier intermediate run `41266360856` passed Android dependency lock + compile/lint on the then-current `cbd83c5...` Android candidate. That result is retained as a checkpoint but is not substituted for the final candidate.

## Phase 4 exit-gate source coverage

- common SSID — covered;
- copied SSID — covered;
- moving BLE — covered in classifier/adversarial source, real moving-device test pending;
- replaced router — covered;
- replaced beacon — covered;
- replaced LAN device — covered with provider-category scoping;
- changing cellular environment — covered against independent Wi-Fi/BLE evidence.

The exact final candidate still needs the hosted instrumentation result and real target-device runs before these can become device evidence.

## Formal dependency boundary

`audit-progress/AUDIT_STATUS.md` correctly records Phase 2 and Phase 3 as not accepted because their real Android/OPPO/hosted/live dependency gates remain open. Phase 4 staging work does not override that ordering. Phase 4 therefore cannot become formally accepted ahead of those dependencies.

## Required closeout before Phase 4 acceptance

1. Finish run `41267183265`; repair any real compile/lint/instrumentation failure without weakening trust or uncertainty rules.
2. Run the required physical OPPO/ColorOS Phase 4 tests: screen-off/background Wi-Fi/BLE, real provider availability, GNSS degradation, LTE/5G change, replacement/relearning, process/reboot recovery and resource measurements.
3. Verify Wi-Fi RTT as supported or cleanly unsupported on the target hardware.
4. Verify current LAN behavior under target Android/ColorOS networking permissions.
5. Resolve/implement or explicitly reassign the remaining contract partials above; do not silently call them complete.
6. Close Phase 2 and Phase 3 formal acceptance prerequisites.
7. Update the requirement matrix/test evidence with actual final run/device evidence.
8. Only then may Phase 4 be labelled `ACCEPTED` and Phase 5 formally unlock under the master plan.

## Current verdict

Phase 4 is substantially stronger than the initial staging candidate and the main Atlas/Signal Trust architecture is now source-hardened. It is **not accepted**. The remaining work is evidence, target-device qualification and the explicitly listed partial capabilities—not a reason to weaken or bypass the Phase 4 gate.
