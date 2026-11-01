# Brick V1 Phase 4 Requirement Matrix

Date: 2026-11-01
Exact candidate pair at this checkpoint:
- Android `v1-p4-atlas-trust-android`: `c6bb20268b22c4f0567773f70c3f5a3717218437`
- Cloud `v1-p4-atlas-trust-cloud`: `20e6e482b06160a4f5d5329b1452e3af02ab7d9f`
- Exact-pair CI: run `41268166679` (in progress when this matrix was updated)

Status vocabulary: `IMPLEMENTED`, `PARTIAL`, `CI PENDING`, `DEVICE VERIFY`, `OPEN`, `RULE`, `P5 INTEGRATION`.

| Requirement | Current evidence | Status / remaining gate |
|---|---|---|
| ATL-001 trusted-position-only learning | `Phase4AtlasController.notePosition`, training freshness/accuracy gates; test coverage | IMPLEMENTED / CI PENDING / DEVICE VERIFY |
| ATL-002 compact learned fingerprints | bounded labels/signals, compact encrypted Atlas codec | IMPLEMENTED; privacy/resource device measurement pending |
| ATL-003 trust from distinctiveness/stability/freshness/quality | `SignalTrustEngine` | IMPLEMENTED / CI PENDING |
| WIFI-SEM-001 learn Wi-Fi fingerprints with legitimate access | `WifiEnvironmentProvider`, permission/location gates, passive result receiver | IMPLEMENTED / DEVICE VERIFY |
| WIFI-SEM-002 SSID hint only, never truth | SSID reduced separately; common/copied signals heavily down-weighted | IMPLEMENTED rule; richer semantic landmark interpretation belongs P5 |
| WIFI-SEM-003 combinations stronger than one SSID | cluster evidence + independence caps | IMPLEMENTED source / P5 final fusion |
| WIFI-001 privacy-reduced long-lived AP identity | HMAC-reduced BSSID | IMPLEMENTED |
| WIFI-002 SSID semantic hint only | separate reduced SSID hint with low spoof resistance | IMPLEMENTED |
| WIFI-003 RSSI distribution | running mean/variance over repeated trusted scans | IMPLEMENTED |
| WIFI-004 relative AP ordering | `relativeOrderObservations` | IMPLEMENTED |
| WIFI-005 band/frequency/channel/width/security | reduced correlated metadata + bounded evidence payload | IMPLEMENTED |
| WIFI-006 AP co-occurrence/zone transition/route gradients | co-occurrence features, transition tracker, coarse zone, RSSI-gradient feature | IMPLEMENTED source / real-route verification pending |
| WIFI-007 RTT distance/uncertainty | `WifiRttEnvironmentProvider`; same Wi-Fi independence group | IMPLEMENTED / DEVICE VERIFY / unsupported hardware must fail cleanly |
| WIFI-008 cluster survives AP replacement | cluster model + router replacement tests | IMPLEMENTED / CI PENDING / DEVICE VERIFY |
| WIFI-009 common/shared SSID near-zero value | known common list + geographic spread classification; copied-SSID adversarial test | IMPLEMENTED / multi-location device verification pending |
| BLE-ENV-001 all legitimately permitted advertisements | unfiltered BLE scan with permission/capability gate | IMPLEMENTED / DEVICE VERIFY |
| BLE-ENV-002 RSSI/Tx power/manufacturer/service/UUID/SID/PHY/co-occurrence | reduced identity + correlated metadata/co-occurrence | IMPLEMENTED / DEVICE VERIFY |
| BLE-ENV-003 TRUSTED_ANCHOR class | model supports explicit trusted-anchor flag | IMPLEMENTED model; authorised anchor enrollment/integration remains P5/device work |
| BLE-ENV-004 DISTINCTIVE_STATIC | repeated trusted visits + spread/stability rules | IMPLEMENTED / CI PENDING |
| BLE-ENV-005 LOCAL_COMMON | trust classifier | IMPLEMENTED / CI PENDING |
| BLE-ENV-006 MOBILE | geographic-spread classifier | IMPLEMENTED / CI PENDING / moving-device verify pending |
| BLE-ENV-007 UNSTABLE | health/variance classifier | IMPLEMENTED / CI PENDING |
| BLE stale/unknown semantics | stale age + insufficient-evidence handling | IMPLEMENTED / CI PENDING |
| LAN-001 authorised local environment | Android NSD service environment | PARTIAL: useful supported subset; generic gateway address was not promoted because it is commonly shared and would add weak/correlated location value |
| LAN-002 mDNS/NSD/casting/printer/Matter/etc. | Cast, AirPlay, IPP/printer, Matter and HTTP NSD categories | PARTIAL: no broad SSDP/UPnP/NAS probing by design; platform permission/power/privacy gate remains |
| LAN-003 association learned only under trusted position | Atlas training gate applies to LAN | IMPLEMENTED |
| CELL-001 LTE/NR exposed radio environment | LTE/NR identity, signal, RSRQ/SINR, TA when API exposes, channel/bands, neighbor set, transitions | IMPLEMENTED source / DEVICE VERIFY |
| CELL-002 never DIY tower triangulation | provider produces environmental evidence only | RULE satisfied / P5 final fusion audit |
| GNSS-001 GNSS is quality evidence, not custom solver | aggregate `GnssStatus` evidence only | IMPLEMENTED |
| GNSS-002 weak geometry/signal/degradation lowers trust | sky counts, C/N0 distribution/stddev, azimuth/elevation, used-in-fix, coarse blocked/constrained/degraded/open state | IMPLEMENTED source / controlled device degradation verify pending |
| GNSS-ATL-001 aggregate sky fingerprint | constellation/count/CN0/azimuth/elevation/carrier/used-in-fix | IMPLEMENTED / DEVICE VERIFY |
| GNSS-ATL-002 no permanent satellite identity | fingerprint uses aggregate buckets only | IMPLEMENTED rule |
| NET-001 Wi-Fi/mobile/loss/recovery transitions | passive network state + offline durable evidence + transition tracker | IMPLEMENTED subset; latency/loss measurement remains PARTIAL |
| NET-ATL-001 transport/IP/DNS/captive/transition/latency/loss | transport, v4/v6, reduced DNS, captive/validated, loss/recovery implemented | PARTIAL: active latency/packet-loss probing intentionally not added without measured value/cost justification; no extra network chatter is introduced merely to tick this row |
| NET-ATL-002 network context cannot outweigh stronger evidence | low spoof-resistance weight; P5 owns final fusion | IMPLEMENTED source / P5 integration audit |
| COMP-001 known companion/accessory presence weak only | `CompanionPresenceController` uses only Android CompanionDeviceManager associations; system-only callback services are API-gated; raw addresses are privacy-reduced/not persisted; companion + charging share one `device.context` independence group | IMPLEMENTED SOURCE / CI PENDING / DEVICE VERIFY; association setup/real presence behaviour must be verified on target OPPO |
| COMP-002 charging type/state as weak context | `DeviceContextProvider`; missing battery broadcast no longer suppresses companion evidence | IMPLEMENTED / CI PENDING |
| ARR-001 approach/departure/building-entry sequences | privacy-reduced environmental/activity transition tracker | PARTIAL: generic sequence learning implemented; real building-entry validation + P5 use pending |
| ARR-002 turns/stops/stairs/escalator/lift/corridor/dwell with environment | broad activity transitions + Phase 3 motion foundation | PARTIAL: no claim of specific stairs/lift/corridor recognition without validated evidence |
| ZONE-001 zone/floor fingerprints | coarse environmental zone ID + Wi-Fi/BLE/RTT/GNSS/motion evidence available | PARTIAL: zone groundwork exists; validated floor classifier not implemented |
| ZONE-002 weak floor UI estimated | no Phase 4 UI claim | P7/P9; floor truth not claimed |
| ZONE-003 no invented barometer | no barometer added | RULE satisfied |
| PRIOR-001 time/dwell as weak prior only | no standalone time-only location claim | PARTIAL/P5 INTEGRATION; Phase 4 does not currently learn a persistent schedule prior because unvalidated schedule inference must not become location truth |
| TRUST-001 geographic uniqueness/spread | signal label spread | IMPLEMENTED |
| TRUST-002 stability across trusted visits | visit counts/presence | IMPLEMENTED |
| TRUST-003 mobility across distant places | MOBILE classification | IMPLEMENTED |
| TRUST-004 freshness/age | decay/stale rules | IMPLEMENTED |
| TRUST-005 quality/repeatability | quality, measurements, counts/variance | IMPLEMENTED |
| TRUST-006 spoofability | type-specific spoof-resistance factors; SSID very weak | IMPLEMENTED |
| TRUST-007 correlation/independence | independence-group caps; derived sequence inherits source group; companion and charging explicitly share one weak context group | IMPLEMENTED / CI PENDING |
| TRUST-008 source health | health ratio participates in classification/weight | IMPLEMENTED |
| TRUST-009 count + replacement history | observation/visit counts + trusted misses/relearning | IMPLEMENTED / CI PENDING |
| TRUST-010 common collapse/distinctive gain | common/mobile/static weighting | IMPLEMENTED / CI PENDING |
| TRUST-011 full signal-class suite | TRUSTED_ANCHOR/DISTINCTIVE_STATIC/LOCAL_COMMON/GLOBAL_COMMON/MOBILE/UNSTABLE/STALE/UNKNOWN | IMPLEMENTED / CI PENDING |
| IND-001 correlated observations cannot multiply confidence | per-group hard cap; RTT/Wi-Fi and derived Wi-Fi transitions share group; device companion/charging context is one group | IMPLEMENTED / CI PENDING |
| NEG-001 cautious negative evidence | first miss weak; repeated trusted scoped misses stronger; hard total cap 0.15 | IMPLEMENTED / CI PENDING |
| RELEARN-001 automatic router/beacon/LAN/cellular relearning | eligible-scan denominator + scoped trusted misses + retirement after repeated evidence | IMPLEMENTED / CI PENDING / DEVICE VERIFY |
| PRIV-ATL-001 HMAC/privacy-reduced Wi-Fi/BLE identifiers | Android Keystore-backed HMAC reduction; legacy companion MAC is reduced before storage | IMPLEMENTED / Android runtime verify pending |
| PRIV-ATL-002 bounded raw environmental retention | inherited Phase 2 raw `evidence/raw/` 30-day R2 lifecycle; local pending evidence is durable until ACK | IMPLEMENTED IN SOURCE / Cloudflare deployed lifecycle verification pending |
| EVD-008 Wi-Fi RTT provider available to later fusion | capability-gated RTT source exists | IMPLEMENTED / P5 INTEGRATION / DEVICE VERIFY |

## Phase 4 exit-gate cases

| Case | Source test/evidence | State |
|---|---|---|
| common SSID | geographic/common classification tests | CI PENDING |
| copied SSID | `testCopiedSsidAcrossDistantPlacesCannotBecomeAnAnchor` | CI PENDING |
| moving BLE | geographic-spread MOBILE test | CI PENDING / DEVICE VERIFY |
| replaced router | router replacement cluster test | CI PENDING / DEVICE VERIFY |
| replaced beacon | trusted disappearance/replacement test + completed-empty BLE evidence | CI PENDING / DEVICE VERIFY |
| replaced LAN device | scoped LAN disappearance/replacement tests | CI PENDING / DEVICE VERIFY |
| changing cellular environment | independent Wi-Fi/BLE vs changed-cell adversarial test | CI PENDING / DEVICE VERIFY |

Additional regression evidence in this candidate: companion association pruning, privacy reduction before persistence, reboot/update presence-cache clearing, and proof that companion + charging cannot manufacture independent location confirmation.

## Honest closeout state

Phase 4 is **not ACCEPTED**. The main Atlas/Trust implementation is substantially complete in source and the authorised companion-context source gap is now closed, but exact-pair CI run `41268166679` is still running at this checkpoint; physical OPPO/ColorOS verification is not executed; Phase 2/3 formal acceptance dependencies remain open; and the explicitly partial capabilities above remain partial rather than being falsely claimed complete.
