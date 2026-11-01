# Brick V1 Phase 4 Requirement Matrix

Date: 2026-11-01
Final exact candidate pair:
- Android `v1-p4-atlas-trust-android`: `93d7424d9d9f4a33c283c54411605a6f4871e799`
- Cloud `v1-p4-atlas-trust-cloud`: `6c66ba8735b3362255e29ca51e50fcb52dcc1dff`
- Exact-pair CI: run `41269624890`

Status vocabulary: `IMPLEMENTED`, `PARTIAL`, `FINAL CI IN PROGRESS`, `DEVICE VERIFY`, `RULE`, `P5 INTEGRATION`.

| Requirement | Current evidence | Status / remaining gate |
|---|---|---|
| ATL-001 trusted-position-only learning | `Phase4AtlasController.notePosition`, freshness/accuracy gates, test source | IMPLEMENTED / FINAL CI IN PROGRESS / DEVICE VERIFY |
| ATL-002 compact learned fingerprints | bounded labels/signals, compact encrypted Atlas codec | IMPLEMENTED; privacy/resource device measurement pending |
| ATL-003 trust from distinctiveness/stability/freshness/quality | `SignalTrustEngine` | IMPLEMENTED / FINAL CI IN PROGRESS |
| WIFI-SEM-001 learn Wi-Fi fingerprints with legitimate access | `WifiEnvironmentProvider`, permission/location gates, passive result receiver | IMPLEMENTED / DEVICE VERIFY |
| WIFI-SEM-002 SSID hint only, never truth | SSID reduced separately; common/copied signals heavily down-weighted | IMPLEMENTED rule; richer semantic landmark interpretation belongs P5 |
| WIFI-SEM-003 combinations stronger than one SSID | cluster evidence + independence caps | IMPLEMENTED source / P5 final fusion |
| WIFI-001 privacy-reduced long-lived AP identity | HMAC-reduced BSSID | IMPLEMENTED |
| WIFI-002 SSID semantic hint only | separate reduced SSID hint with low spoof resistance | IMPLEMENTED |
| WIFI-003 RSSI distribution | running mean/variance over repeated trusted scans | IMPLEMENTED |
| WIFI-004 relative AP ordering | `relativeOrderObservations` | IMPLEMENTED |
| WIFI-005 band/frequency/channel/width/security | reduced correlated metadata + bounded payload | IMPLEMENTED |
| WIFI-006 AP co-occurrence/zone transition/route gradients | co-occurrence, transitions, coarse zone, RSSI gradient | IMPLEMENTED source / real-route verification pending |
| WIFI-007 RTT distance/uncertainty | `WifiRttEnvironmentProvider`; same Wi-Fi independence group | IMPLEMENTED / DEVICE VERIFY / unsupported hardware must fail cleanly |
| WIFI-008 cluster survives AP replacement | cluster model + router replacement tests | IMPLEMENTED / FINAL CI IN PROGRESS / DEVICE VERIFY |
| WIFI-009 common/shared SSID near-zero value | common list + geographic-spread classification + copied-SSID test | IMPLEMENTED / multi-location device verification pending |
| BLE-ENV-001 legitimately permitted advertisements | unfiltered BLE scan with permission/capability gate | IMPLEMENTED / DEVICE VERIFY |
| BLE-ENV-002 RSSI/Tx power/manufacturer/service/UUID/SID/PHY/co-occurrence | reduced identity + correlated metadata | IMPLEMENTED / DEVICE VERIFY |
| BLE-ENV-003 TRUSTED_ANCHOR class | model supports explicit trusted-anchor flag | IMPLEMENTED model; authorised anchor enrollment/integration remains later work |
| BLE-ENV-004 DISTINCTIVE_STATIC | repeated trusted visits + spread/stability rules | IMPLEMENTED / FINAL CI IN PROGRESS |
| BLE-ENV-005 LOCAL_COMMON | trust classifier | IMPLEMENTED / FINAL CI IN PROGRESS |
| BLE-ENV-006 MOBILE | geographic-spread classifier | IMPLEMENTED / FINAL CI IN PROGRESS / moving-device verify pending |
| BLE-ENV-007 UNSTABLE | health/variance classifier | IMPLEMENTED / FINAL CI IN PROGRESS |
| BLE stale/unknown semantics | stale age + insufficient-evidence handling | IMPLEMENTED / FINAL CI IN PROGRESS |
| LAN-001 authorised local environment | Android NSD service environment | PARTIAL: useful supported subset; generic gateway identity not promoted because weak/correlated |
| LAN-002 mDNS/NSD/casting/printer/Matter/etc. | Cast, AirPlay, IPP/printer, Matter, HTTP NSD categories | PARTIAL: no broad SSDP/UPnP/NAS probing by design; permission/power/privacy gate remains |
| LAN-003 association learned only under trusted position | Atlas training gate applies to LAN | IMPLEMENTED |
| CELL-001 LTE/NR exposed radio environment | identity, signal, RSRQ/SINR, TA where exposed, channel/bands, neighbor set, transitions | IMPLEMENTED source / DEVICE VERIFY |
| CELL-002 never DIY tower triangulation | provider produces environmental evidence only | RULE satisfied / P5 final fusion audit |
| GNSS-001 GNSS is quality evidence, not custom solver | aggregate `GnssStatus` evidence only | IMPLEMENTED |
| GNSS-002 weak geometry/signal/degradation lowers trust | counts, C/N0, azimuth/elevation, used-in-fix, coarse environment state | IMPLEMENTED source / controlled device degradation verify pending |
| GNSS-ATL-001 aggregate sky fingerprint | constellation/count/CN0/azimuth/elevation/carrier/used-in-fix | IMPLEMENTED / DEVICE VERIFY |
| GNSS-ATL-002 no permanent satellite identity | aggregate buckets only | IMPLEMENTED rule |
| NET-001 Wi-Fi/mobile/loss/recovery transitions | passive network state + offline durable evidence + transition tracker | IMPLEMENTED subset; latency/loss measurement remains PARTIAL |
| NET-ATL-001 transport/IP/DNS/captive/transition/latency/loss | transport, v4/v6, reduced DNS, captive/validated, loss/recovery | PARTIAL: no active latency/packet-loss workload without measured value/cost justification |
| NET-ATL-002 network context cannot outweigh stronger evidence | low spoof-resistance weight; P5 owns final fusion | IMPLEMENTED source / P5 integration audit |
| COMP-001 known companion/accessory presence weak only | explicit CDM associations; API-gated callback services; privacy-reduced IDs; shared `device.context`; process-local registry reconciles removals and retries failed starts | IMPLEMENTED SOURCE / FINAL CI IN PROGRESS / DEVICE VERIFY; association UX/real OPPO callback behavior pending |
| COMP-002 charging type/state as weak context | `DeviceContextProvider`; missing battery broadcast does not suppress companion evidence | IMPLEMENTED / FINAL CI IN PROGRESS |
| ARR-001 approach/departure/building-entry sequences | privacy-reduced environmental/activity transition tracker | PARTIAL: generic sequence learning implemented; real building-entry validation + P5 use pending |
| ARR-002 turns/stops/stairs/escalator/lift/corridor/dwell with environment | broad activity transitions + Phase 3 motion foundation | PARTIAL: no specific stairs/lift/corridor recognition claim without validated evidence |
| ZONE-001 zone/floor fingerprints | coarse environmental zone ID + Wi-Fi/BLE/RTT/GNSS/motion evidence | PARTIAL: zone groundwork exists; validated floor classifier not implemented |
| ZONE-002 weak floor UI estimated | no Phase 4 UI claim | P7/P9; floor truth not claimed |
| ZONE-003 no invented barometer | no barometer added | RULE satisfied |
| PRIOR-001 time/dwell as weak prior only | no standalone time-only location claim | PARTIAL/P5 INTEGRATION; no persistent schedule prior because unvalidated schedule inference must not become location truth |
| TRUST-001 geographic uniqueness/spread | signal label spread | IMPLEMENTED |
| TRUST-002 stability across trusted visits | visit counts/presence | IMPLEMENTED |
| TRUST-003 mobility across distant places | MOBILE classification | IMPLEMENTED |
| TRUST-004 freshness/age | decay/stale rules | IMPLEMENTED |
| TRUST-005 quality/repeatability | quality, measurements, counts/variance | IMPLEMENTED |
| TRUST-006 spoofability | type-specific spoof-resistance factors; SSID very weak | IMPLEMENTED |
| TRUST-007 correlation/independence | independence caps; derived evidence inherits source group; companion/charging share one group | IMPLEMENTED / FINAL CI IN PROGRESS |
| TRUST-008 source health | health ratio participates in classification/weight | IMPLEMENTED |
| TRUST-009 count + replacement history | observation/visit counts + trusted misses/relearning | IMPLEMENTED / FINAL CI IN PROGRESS |
| TRUST-010 common collapse/distinctive gain | common/mobile/static weighting | IMPLEMENTED / FINAL CI IN PROGRESS |
| TRUST-011 full signal-class suite | TRUSTED_ANCHOR/DISTINCTIVE_STATIC/LOCAL_COMMON/GLOBAL_COMMON/MOBILE/UNSTABLE/STALE/UNKNOWN | IMPLEMENTED / FINAL CI IN PROGRESS |
| IND-001 correlated observations cannot multiply confidence | per-group hard cap; RTT/Wi-Fi and derived transitions share group; device context shares one group | IMPLEMENTED / FINAL CI IN PROGRESS |
| NEG-001 cautious negative evidence | first miss weak; repeated trusted scoped misses stronger; total cap 0.15 | IMPLEMENTED / FINAL CI IN PROGRESS |
| RELEARN-001 automatic router/beacon/LAN/cellular relearning | eligible-scan denominator + scoped trusted misses + retirement after repeated evidence | IMPLEMENTED / FINAL CI IN PROGRESS / DEVICE VERIFY |
| PRIV-ATL-001 HMAC/privacy-reduced Wi-Fi/BLE identifiers | Keystore-backed HMAC; legacy companion MAC reduced before persistence | IMPLEMENTED / Android runtime verify pending |
| PRIV-ATL-002 bounded raw environmental retention | inherited Phase 2 raw `evidence/raw/` 30-day R2 lifecycle; local pending evidence durable until ACK | IMPLEMENTED IN SOURCE / Cloudflare deployed lifecycle verification pending |
| EVD-008 Wi-Fi RTT provider available to later fusion | capability-gated RTT source | IMPLEMENTED / P5 INTEGRATION / DEVICE VERIFY |

## Phase 4 exit-gate cases

| Case | Source test/evidence | State |
|---|---|---|
| common SSID | geographic/common classification tests | FINAL CI IN PROGRESS |
| copied SSID | `testCopiedSsidAcrossDistantPlacesCannotBecomeAnAnchor` | FINAL CI IN PROGRESS |
| moving BLE | geographic-spread MOBILE test | FINAL CI IN PROGRESS / DEVICE VERIFY |
| replaced router | router replacement cluster test | FINAL CI IN PROGRESS / DEVICE VERIFY |
| replaced beacon | trusted disappearance/replacement + completed-empty BLE evidence | FINAL CI IN PROGRESS / DEVICE VERIFY |
| replaced LAN device | scoped LAN disappearance/replacement tests | FINAL CI IN PROGRESS / DEVICE VERIFY |
| changing cellular environment | independent Wi-Fi/BLE vs changed-cell adversarial test | FINAL CI IN PROGRESS / DEVICE VERIFY |
| correlated family cap | `testOneCorrelatedRadioFamilyCannotBecomePreciseLocationTruth` | FINAL CI IN PROGRESS |
| companion/charger anti-double-counting | `testCompanionAndChargingCannotManufactureIndependentConfirmations` | FINAL CI IN PROGRESS |
| companion remove → re-associate | `testObservationRegistryAllowsSameDeviceAfterRemovalAndReassociation` | FINAL CI IN PROGRESS / DEVICE VERIFY |
| companion start failure retry | `testObservationRegistryRetriesAfterStartFailure` | FINAL CI IN PROGRESS / DEVICE VERIFY |

Additional source evidence covers companion association pruning, privacy reduction before persistence, reboot/update presence-cache clearing, provider replay/dedupe, derived-evidence correlation and scoped negative evidence.

## Honest closeout state

Phase 4 is **not ACCEPTED**. The Atlas/Trust implementation and authorised companion-context source are implemented, including process-local re-association/start-failure self-healing. Final exact-pair CI run `41269624890` is executing; physical OPPO/ColorOS verification is not executed; Phase 2/3 formal dependencies remain open; and the explicitly partial capabilities above remain partial rather than being falsely called complete.
