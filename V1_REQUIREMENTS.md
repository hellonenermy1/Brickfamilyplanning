# Brick V1 Requirement Ledger

Date: 2026-10-31
Contract source: `Yes.docx` project file version 1
Program: `V1_PHASES.md`
Architecture invariants: `V1_ARCHITECTURE_FREEZE.md`

This ledger is the canonical Phase 1 mapping from the V1 contract into stable implementation IDs. It is deliberately more granular than the document headings so later work cannot mark an entire section complete while skipping a critical clause.

## Status vocabulary used for the Phase 1 baseline

- `RULE` — product/architecture requirement, not a feature-completion claim.
- `BUILT_SOURCE` — concrete source exists in the current candidate; still subject to later regression/device acceptance.
- `PARTIAL` — some source exists, but the contract requires material extension or semantics are incomplete.
- `MISSING` — no matching implementation was found in the current candidate baseline.
- `AUDIT_REQUIRED` — likely present or partly present, but Phase 1 does not have enough direct evidence to claim the exact contract semantics.
- `DEVICE_VERIFY` — source may exist, but real target-device behavior is explicitly unproven.
- `EXCLUDED` — explicit V1 non-goal.

Owner phase is the phase responsible for completing or re-verifying the item. Existing features usually re-enter Phase 8/9 for hardening/acceptance even if their source already exists.

---

# A. Product objective, architecture and child experience

| ID | Contract requirement | Source | Baseline | Owner | Acceptance evidence |
|---|---|---|---|---|---|
| OBJ-001 | Brick behaves like an appliance: configure once and normally forget it. | §1 | RULE | P8/P9 | endurance + intervention count |
| OBJ-002 | Ordinary network/process/server/GPS failures must not require reopening Brick, manual sync, service restart, storage clearing or phone reboot. | §1 | PARTIAL | P8/P9 | injected-failure recovery tests |
| OBJ-003 | Reliability/accuracy/safety/maintenance value outranks feature count. | intro/§83 | RULE | all | requirement review |
| ARCH-001 | Child stack contains safety service, positioning, activity, fusion/evidence, reliability, durable journal/network retry and health monitoring. | §2 | PARTIAL | P2-P8 | source inventory + integration tests |
| ARCH-002 | Device/cloud traffic uses HTTPS/TLS and signed protocol messages. | §2/§54 | BUILT_SOURCE | P8/P9 | protocol/security audit |
| ARCH-003 | Cloudflare remains the main infrastructure trust boundary. | §2 | BUILT_SOURCE | P8/P9 | deployment/auth audit |
| ARCH-004 | Cloud stack uses Worker API, per-device Durable Object, WebSockets, Queue/DLQ, D1, R2 and observability. | §2 | BUILT_SOURCE | P7-P9 | deployed binding/schema checks |
| ARCH-005 | Parent website remains parent-only and authenticated through approved Cloudflare Access path. | §2/§53 | BUILT_SOURCE | P8/P9 | authenticated/unauthenticated browser tests |
| ARCH-006 | Android/ColorOS/Google fused/activity APIs remain legitimate platform dependencies rather than being reimplemented. | §2/§5 | RULE | P8/P9 | source/dependency audit |
| CUI-001 | Normal child UI contains only Brick safety status, I'M SAFE and SOS. | §3 | BUILT_SOURCE | P7/P9 | APK UI test |
| CUI-002 | Child UI must not expose map, coordinates, speed, graphs, history, tracking settings, battery graphs, diagnostics or exploratory menus in normal operation. | §3 | BUILT_SOURCE | P7/P9 | UI inspection |
| CUI-003 | Required foreground-service notification remains Android-visible during continuous tracking. | §3 | BUILT_SOURCE | P6/P9 | device notification test |
| CUI-004 | Genuine actionable problem shows `Location needs attention` and a FIX action. | §3 | BUILT_SOURCE | P7/P9 | permission/location failure tests |
| CUI-005 | FIX takes the child to the exact Android action needed rather than a generic settings maze. | §3 | PARTIAL | P7/P9 | device repair-path tests |

---

# B. Managed mode and normal positioning

| ID | Contract requirement | Source | Baseline | Owner | Acceptance evidence |
|---|---|---|---|---|---|
| MGT-001 | Device Owner is the preferred managed mode if real ColorOS testing validates it. | §4 | BUILT_SOURCE/DEVICE_VERIFY | P6/P9 | provisioning + endurance test |
| MGT-002 | Manage only safety-critical controls; do not turn the whole phone into a kiosk. | §4 | RULE | P6/P9 | DevicePolicy audit |
| MGT-003 | Device Owner can keep Location enabled/restrict user configuration where the desired policy is ON. | §4 | BUILT_SOURCE | P6/P9 | actual-state verification |
| MGT-004 | New parent Location OFF semantics must replace unconditional Location-on enforcement rather than fight it. | §23N | MISSING/CONFLICT | P6 | state-machine tests |
| POS-001 | Android Fused Location Provider is the primary position source. | §5 | BUILT_SOURCE | P8/P9 | source + device test |
| POS-002 | Brick adds validity filtering above fused output rather than replacing Android fusion. | §5 | BUILT_SOURCE | P3/P8 | filter tests |
| POS-003 | Motion consistency contributes to trust evaluation. | §5/§12 | PARTIAL | P3/P5 | injected inconsistency tests |
| POS-004 | Trajectory consistency contributes to trust evaluation. | §5/§12 | PARTIAL | P3/P5 | route-jump tests |
| POS-005 | Map plausibility contributes to trust evaluation. | §5/§12 | PARTIAL | P3/P5 | impossible-path tests |
| POS-006 | Every fix records latitude/longitude where available. | §6 | BUILT_SOURCE | P8/P9 | packet/history audit |
| POS-007 | Every fix records horizontal accuracy. | §6 | BUILT_SOURCE | P8/P9 | packet/history audit |
| POS-008 | Every fix records altitude/vertical accuracy where available. | §6 | BUILT_SOURCE | P8/P9 | packet/history audit |
| POS-009 | Every fix records speed/speed accuracy where available. | §6 | BUILT_SOURCE | P8/P9 | packet/history audit |
| POS-010 | Every fix records bearing/bearing accuracy where available. | §6 | BUILT_SOURCE | P8/P9 | packet/history audit |
| POS-011 | Every fix records monotonic elapsed realtime and wall-clock time. | §6/§12 | BUILT_SOURCE | P8/P9 | ordering tests |
| POS-012 | Location age/freshness is tracked from monotonic time. | §6/§12 | BUILT_SOURCE | P8/P9 | stale-fix tests |
| POS-013 | Provider/source indicators are retained. | §6 | BUILT_SOURCE | P8/P9 | packet/history audit |
| POS-014 | Mock-location indicator is retained and mock fixes are not trusted. | §6/§12 | BUILT_SOURCE | P8/P9 | mock injection test |
| POS-015 | Prefer Android measured speed when uncertainty is good rather than always deriving distance/time speed. | §6/§7 | BUILT_SOURCE | P8/P9 | speed test |
| SPD-001 | Parent shows speed in km/h. | §7 | BUILT_SOURCE | P7/P9 | dashboard test |
| SPD-002 | Parent shows speed uncertainty when available. | §7 | BUILT_SOURCE | P7/P9 | dashboard test |
| SPD-003 | Suppress tiny noisy stationary speeds when motion evidence says stationary. | §7 | BUILT_SOURCE | P3/P9 | stationary device test |
| SPD-004 | Maintain current speed, average trip speed, maximum trusted speed and speed history. | §7/§27 | PARTIAL/BUILT_SOURCE | P7/P9 | trip/history test |
| SPD-005 | Maximum speed must never be calculated from rejected GPS spikes. | §27 | AUDIT_REQUIRED | P7/P8 | spike-injection test |

---

# C. Activity, cadence, GNSS quality and acceptance filtering

| ID | Contract requirement | Source | Baseline | Owner | Acceptance evidence |
|---|---|---|---|---|---|
| ACT-001 | Support stationary, walking, running, bicycle, vehicle/on-foot/unknown semantics using Android activity evidence. | §8 | BUILT_SOURCE | P8/P9 | activity transition tests |
| ACT-002 | Preserve activity confidence. | §8 | BUILT_SOURCE | P8/P9 | packet/dashboard test |
| ACT-003 | Do not claim car/bus/train from activity recognition alone. | §8 | RULE | P7/P8 | UI/source audit |
| ACT-004 | Activity drives tracking/power policy, not just UI labels. | §9 | BUILT_SOURCE | P3/P8 | cadence tests |
| CAD-001 | SOS target cadence ~1 s. | §10 | BUILT_SOURCE | P8/P9 | SOS cadence measurement |
| CAD-002 | Parent live/vehicle target ~3 s when useful. | §10 | BUILT_SOURCE | P8/P9 | cadence measurement |
| CAD-003 | Bicycle target 3–5 s. | §10 | BUILT_SOURCE | P8/P9 | cadence measurement |
| CAD-004 | Walking target 3–6 s. | §10 | BUILT_SOURCE | P8/P9 | cadence measurement |
| CAD-005 | Running target ~3 s. | §10 | BUILT_SOURCE | P8/P9 | cadence measurement |
| CAD-006 | Uncertain movement target 5–10 s. | §10 | BUILT_SOURCE | P8/P9 | cadence measurement |
| CAD-007 | Stationary target 30–120 s; deep stable stationary can become passive/event based. | §10 | BUILT_SOURCE/PARTIAL | P3/P8/P9 | battery/cadence test |
| GNSS-001 | GNSS/satellite information is quality evidence, not a custom V1 raw-pseudorange position solver. | §11 | BUILT_SOURCE/PARTIAL | P4/P8 | source audit |
| GNSS-002 | Detect weak satellite geometry/signal/degrading accuracy/multipath-like behavior and lower trust. | §11 | PARTIAL | P4/P5 | controlled GNSS degradation tests |
| FILT-001 | Freshness gate uses monotonic time. | §12 | BUILT_SOURCE | P8 | stale timestamp tests |
| FILT-002 | Accuracy gate grades/limits weak fixes. | §12 | BUILT_SOURCE | P8 | accuracy threshold tests |
| FILT-003 | Physics gate rejects implausible distance/time speeds. | §12 | BUILT_SOURCE | P8 | teleport tests |
| FILT-004 | Acceleration consistency catches walk→170 km/h→walk style spikes. | §12 | PARTIAL | P3/P5/P8 | spike sequence tests |
| FILT-005 | Motion agreement compares GPS movement with activity/sensor evidence. | §12 | PARTIAL | P3/P5 | conflict tests |
| FILT-006 | Heading agreement checks reversals/trajectory contradictions. | §12 | PARTIAL | P3/P5 | turn/reversal tests |
| FILT-007 | Map consistency prefers physically plausible path/road/footpath explanations. | §12 | PARTIAL | P3/P5 | path constraint tests |
| RAW-001 | Rejected raw GPS must not be deleted merely because Brick distrusts it. | §13 | PARTIAL/AUDIT_REQUIRED | P2/P7/P8 | storage audit + rejection test |
| RAW-002 | Raw observation and trusted interpretation remain separate. | §13 | BUILT_SOURCE/PARTIAL | P2/P7 | schema/history audit |
| RAW-003 | History is never rewritten to make the algorithm appear correct. | §13/§23M | RULE | P5/P7/P8 | raw/realtime/refined immutability tests |
| CONF-001 | Do not expose uncalibrated numerical confidence percentages as truth. | §14/§23D/§23O | RULE | P5/P7 | UI audit |
| CONF-002 | User-facing confidence remains qualitative plus measurable uncertainty. | §14 | PARTIAL | P5/P7 | UI test |
| STATE-001 | Support PRECISE. | §15 | BUILT_SOURCE | P5/P9 | state test |
| STATE-002 | Support ASSISTED. | §15 | BUILT_SOURCE | P5/P9 | state test |
| STATE-003 | Support ANCHORED. | §15 | BUILT_SOURCE | P5/P9 | state test |
| STATE-004 | Support ESTIMATED. | §15 | BUILT_SOURCE | P5/P9 | state test |
| STATE-005 | Support COARSE. | §15 | BUILT_SOURCE/PARTIAL | P5/P9 | state test |
| STATE-006 | Support LAST_KNOWN. | §15 | BUILT_SOURCE | P5/P9 | state test |
| STATE-007 | Support UNKNOWN when evidence is insufficient. | §15 | BUILT_SOURCE | P5/P9 | state test |

---

# D. Fallback fundamentals

| ID | Contract requirement | Source | Baseline | Owner | Acceptance evidence |
|---|---|---|---|---|---|
| FB-001 | Distinguish GNSS loss with Location still ON from Android master Location OFF. | §16 | PARTIAL | P5/P6/P7 | device state tests |
| FB-002 | GNSS loss may still use WLAN/cellular/A-GNSS through normal fused positioning. | §16 | BUILT_SOURCE/DEVICE_VERIFY | P9 | indoor/GNSS-loss test |
| FB-003 | Location unavailable enters degraded mode rather than pretending exact coordinates. | §16 | PARTIAL | P5/P7 | Location OFF tests |
| FB-004 | Fallback policy hierarchy retains fresh fused → assisted/network → known anchor/place → inertial → route/path → network context → coarse IP → last verified → unknown. | §17 | PARTIAL | P5 | fusion integration tests |
| FB-005 | Multiple evidence sources may operate together; hierarchy is not strictly one-source-at-a-time. | §17/§23A | MISSING | P2/P5 | parallel-fusion tests |
| DR-001 | Short-term dead reckoning may use accelerometer, gyroscope, compass, activity, steps, last speed/bearing/position. | §18 | PARTIAL | P3 | sensor/odometry tests |
| DR-002 | Dead reckoning is only trusted short-term and uncertainty grows with time. | §18/§20 | BUILT_SOURCE/PARTIAL | P3/P5 | drift/uncertainty test |
| ROUTE-001 | Degraded route estimation maintains plausible corridors rather than free drift. | §19 | BUILT_SOURCE/PARTIAL | P3/P5 | route constraint tests |
| ROUTE-002 | Do not secretly snap an uncertain child position to one chosen street. | §19 | BUILT_SOURCE | P5/P7 | UI/algorithm test |
| DR-003 | Long unsupported inertial prediction eventually becomes possible area/exact unknown. | §20 | PARTIAL | P3/P5 | long-outage test |
| ANCH-001 | Support optional fixed BLE anchors at controlled trusted places. | §21 | BUILT_SOURCE | P5/P9 | anchor tests |
| ANCH-002 | No family-car anchor/tracking role. | §21/§82 | RULE | P8 | source/config audit |
| ANCH-003 | BLE RSSI is never treated as exact ranging. | §21/§23B/ground | BUILT_SOURCE | P5/P8 | algorithm audit |
| NET-001 | Observe Wi-Fi/mobile/IP/connectivity-loss/recovery/latency transitions as operational evidence. | §22 | PARTIAL | P4/P5 | network transition tests |
| NET-002 | Network context may support departure/route inference but must not invent exact coordinates. | §22 | RULE | P5/P8 | fusion tests |
| IP-001 | IP location is last-resort coarse context only, e.g. country/city scale. | §23 | PARTIAL | P5/P7/P9 | coarse-network test |
| IP-002 | IP evidence never claims building-level precision. | §23 | RULE | P5/P7 | UI/fusion audit |

---

# E. Parallel Evidence Engine and unified hypothesis model

| ID | Contract requirement | Source | Baseline | Owner | Acceptance evidence |
|---|---|---|---|---|---|
| EVD-001 | Evaluate all safely available degraded-position evidence in parallel. | §23A | MISSING | P2/P5 | parallel-provider integration test |
| EVD-002 | Evidence inputs include last trusted position. | §23A | PARTIAL | P5 | fusion test |
| EVD-003 | Evidence inputs include motion sensors/steps/heading/activity. | §23A | PARTIAL | P3/P5 | fusion test |
| EVD-004 | Evidence inputs include route/path geometry. | §23A | PARTIAL | P3/P5 | fusion test |
| EVD-005 | Evidence inputs include known-place evidence. | §23A | PARTIAL | P4/P5 | fusion test |
| EVD-006 | Evidence inputs include network/cellular transitions. | §23A | PARTIAL | P4/P5 | fusion test |
| EVD-007 | Evidence inputs include authorised Brick witnesses. | §23A/B | MISSING | P5 | witness fusion test |
| EVD-008 | Evidence inputs include Wi-Fi RTT when supported and appropriate. | §23A/F | MISSING | P4/P5 | RTT supported/unsupported tests |
| EVD-009 | Fusion output includes best-supported position **or area**. | §23A | MISSING | P5 | state/geometry tests |
| EVD-010 | Fusion output includes official location state. | §23A | PARTIAL | P5 | state tests |
| EVD-011 | Fusion output includes uncertainty shape. | §23A | MISSING | P5/P7 | geometry tests |
| EVD-012 | Fusion output includes evidence used and evidence age. | §23A | MISSING | P2/P5/P7 | explanation tests |
| EVD-013 | Fusion output includes evidence conflicts. | §23A | MISSING | P5/P7 | conflict tests |
| EVD-014 | Weak evidence cannot create precise coordinate alone. | §23A | RULE | P5/P8 | adversarial weak-evidence tests |
| EVD-015 | Independent agreeing evidence may shrink uncertainty. | §23A | MISSING | P5 | fusion tests |
| EVD-016 | Conflicting evidence expands uncertainty rather than selecting the nicest answer. | §23A | MISSING | P5 | conflict tests |
| EVD-017 | Existing official location-state vocabulary remains unchanged. | §23A | RULE | P5/P7 | compatibility tests |

---

# F. Witness Mesh and fixed Ground Network

| ID | Contract requirement | Source | Baseline | Owner | Acceptance evidence |
|---|---|---|---|---|---|
| WIT-001 | Child periodically advertises rotating privacy-preserving Brick BLE identifier. | §23B | MISSING | P5 | BLE advertising test |
| WIT-002 | Authorised family Brick witness can detect child rotating ID and report its own trusted position + sighting. | §23B | MISSING | P5 | two-device test |
| WIT-003 | Witness uncertainty includes witness location uncertainty + conservative BLE proximity allowance. | §23B | MISSING | P5 | geometry test |
| WIT-004 | BLE RSSI is supporting proximity evidence only, not exact distance. | §23B | RULE | P5/P8 | algorithm audit |
| WIT-005 | No permanent public BLE identifier. | §23B | MISSING | P5/P8 | rotation/privacy test |
| WIT-006 | Rotating identifiers are cryptographically generated/resolved. | §23B | MISSING | P5/P8 | crypto/replay test |
| WIT-007 | Only paired/authorised Brick devices can resolve/report useful witness sightings. | §23B | MISSING | P5/P8 | unauthorised-witness test |
| WIT-008 | No public crowdsourced tracking network in V1. | §23B/§23O | RULE | P8 | architecture/privacy audit |
| WIT-009 | Raw BLE identifiers are retained only as operationally necessary. | §23B | MISSING | P4/P8 | retention test |
| GROUND-001 | Fixed authorised Brick receivers can observe rotating child IDs at controlled sites. | duplicate §23G | MISSING | P5 | receiver test |
| GROUND-002 | One receiver can provide strong place/zone anchor, not fake exact range. | duplicate §23G | MISSING | P5 | single-receiver test |
| GROUND-003 | Multiple receivers may narrow likely zone using conservative observation geometry. | duplicate §23G | MISSING | P5 | multi-receiver test |
| GROUND-004 | AoA/direction finding is optional and only enabled on specialised calibrated hardware. | duplicate §23G | MISSING/RULE | P5/P9 | capability/calibration evidence |
| GROUND-005 | Receiver identifier protocol uses cryptographic rotation to avoid stranger-trackable static beacon. | duplicate §23G | MISSING | P5/P8 | rotation/privacy test |
| GROUND-006 | Receiver sightings can collapse large dead-reckoning uncertainty to the validated site area. | duplicate §23G | MISSING | P5 | fusion test |

---

# G. Learned places, particle filter, radio route and RTT

| ID | Contract requirement | Source | Baseline | Owner | Acceptance evidence |
|---|---|---|---|---|---|
| PLACE-001 | Learn conservative place signatures for Home/School/Grandparents/custom places from trusted periods. | §23C | MISSING | P4/P5 | repeated-place test |
| PLACE-002 | Place signature can combine verified arrival, movement/stationary pattern, network transitions, paired Bluetooth context, charging, cellular range, route and dwell. | §23C | MISSING | P4/P5 | feature/fusion tests |
| PLACE-003 | Ordinary fresh background Wi-Fi scanning is not treated as a normal Location-OFF trick. | §23C/§23L | RULE | P4/P6/P8 | source/device audit |
| PLACE-004 | Strong place match may produce ANCHORED place state without claiming exact room/coordinate. | §23C | MISSING | P5/P7 | anchor UI test |
| PLACE-005 | Place signatures decay/relearn automatically as networks/devices change. | §23C/§23O | MISSING | P4 | replacement test |
| PF-001 | On precise-fix loss, create many possible map positions rather than one guessed corridor. | §23D | MISSING | P3 | particle initialization test |
| PF-002 | Particle propagation uses steps, rotation, gyro, accelerometer, compass when trustworthy, activity, speed, turn sequence, elapsed time and path geometry. | §23D | MISSING | P3 | deterministic simulation tests |
| PF-003 | Candidates inconsistent with map/motion are reduced or removed. | §23D | MISSING | P3 | impossible-route tests |
| PF-004 | Parent gets corridor/possible-area representation rather than hidden snapping. | §23D | MISSING | P5/P7 | UI test |
| PF-005 | Particle uncertainty continues growing without external correction. | §23D | MISSING | P3/P5 | long-outage test |
| PF-006 | Internal weights are not exposed as fake calibrated probabilities. | §23D | RULE | P5/P7 | UI audit |
| RADIO-001 | Learn coarse cellular/network/mobility patterns along frequently travelled routes while precise location is available. | §23E | MISSING | P4/P5 | route-learning test |
| RADIO-002 | Radio-route features may include signal trends, LTE↔5G, Wi-Fi↔mobile, connectivity loss/recovery, IP/network changes, latency, activity, travel time and turns. | §23E | MISSING | P4 | provider tests |
| RADIO-003 | Radio patterns never create exact coordinates independently. | §23E | RULE | P5/P8 | fusion audit |
| RADIO-004 | Radio patterns mainly eliminate/strengthen route hypotheses. | §23E | MISSING | P5 | fusion test |
| RADIO-005 | Radio models adapt as networks change. | §23E | MISSING | P4 | relearning test |
| RTT-001 | Support opportunistic Wi-Fi RTT when phone/APs support it and Location is ON. | §23F | MISSING | P4/P5 | capability + ranging test |
| RTT-002 | RTT is not promised as Location-OFF workaround. | §23F | RULE | P6/P8 | device/API audit |
| RTT-003 | RTT ranges feed fusion together with fused/GNSS/motion evidence. | §23F | MISSING | P5 | fusion test |
| RTT-004 | Runtime feature detection; unsupported RTT must not break Brick or count as device failure. | §23F/§23O | MISSING | P2/P4/P7 | unsupported capability test |

---

# H. Degraded-position rendering

| ID | Contract requirement | Source | Baseline | Owner | Acceptance evidence |
|---|---|---|---|---|---|
| DEG-001 | Small accuracy circle for trustworthy precise fix. | first §23G | BUILT_SOURCE | P7/P9 | map test |
| DEG-002 | Larger circle for assisted/coarse fix. | first §23G | PARTIAL | P7 | map test |
| DEG-003 | Corridor for route-constrained estimate. | first §23G | BUILT_SOURCE/PARTIAL | P7 | map test |
| DEG-004 | Heat/possible-area region for particle estimate. | first §23G | MISSING | P5/P7 | map geometry test |
| DEG-005 | Known-place card/region for ANCHORED state. | first §23G | PARTIAL | P7 | map test |
| DEG-006 | Witness area when witness sighting exists. | first §23G | MISSING | P5/P7 | map test |
| DEG-007 | Last-known marker plus expanding uncertainty when evidence weakens. | first §23G | PARTIAL | P5/P7 | aging test |
| DEG-008 | UI states evidence source and age without pretending estimate is GPS. | first §23G | PARTIAL | P7 | UI test |

---

# I. Geomagnetic, physical landmarks and learned odometry

| ID | Contract requirement | Source | Baseline | Owner | Acceptance evidence |
|---|---|---|---|---|---|
| MAG-001 | Learn magnetic signatures for frequently visited indoor routes/places while position is trusted. | §23H | MISSING | P3/P4 | repeated-route test |
| MAG-002 | Use magnetic **sequences**, not one magnetic reading. | §23H | MISSING | P3/P4 | false-match test |
| MAG-003 | Magnetic match changes corridor/particle likelihood rather than generating exact standalone position. | §23H | MISSING | P3/P5 | fusion test |
| MAG-004 | Validate actual OPPO performance; do not promise research-lab accuracy everywhere. | §23H | RULE/DEVICE_VERIFY | P9 | real building tests |
| MAG-005 | Expand magnetic features to orientation-corrected Bx/By/Bz, magnitude, variance, gradients, spikes/dips and turn-relative sequences. | §23O | MISSING | P3/P4 | feature extraction tests |
| LAND-001 | Learn repeatable vehicle/bicycle physical sequences: humps, turns, bends, rough sections, stops, ramps, acceleration/deceleration. | §23I | MISSING | P3 | route sequence tests |
| LAND-002 | Learn repeatable walking/indoor sequences: stairs, escalators, lifts, corridors, doorways, turns, stationary periods. | §23I | MISSING | P3 | indoor sequence tests |
| LAND-003 | Single bump/turn proves almost nothing; sequence is supporting evidence. | §23I | RULE | P3/P5 | false-positive tests |
| ODO-001 | Upgrade dead reckoning to per-device/per-motion learned models. | §23J | MISSING/PARTIAL | P3 | calibration tests |
| ODO-002 | Distinguish walking phone-in-hand vs pocket/bag where measurable. | §23J | MISSING | P3 | placement tests |
| ODO-003 | Separate running/bicycle/vehicle/stationary models. | §23J | MISSING | P3 | mode tests |
| ODO-004 | Dynamic stride uses step data, accel waveform, gyro, magnetic/heading, activity, orientation, recent trusted speed/position. | §23J | PARTIAL | P3 | stride calibration tests |
| ODO-005 | Zero-velocity correction pulls estimated velocity to zero under strong stationary confidence. | §23J | MISSING | P3 | stationary test |
| ODO-006 | Map constraints remove impossible particles such as walking through walls/barriers or vehicle through pedestrian-only geometry. | §23J | MISSING | P3 | map constraint tests |
| ODO-007 | Learned odometry is backbone for Location-OFF propagation but uncertainty still grows. | §23J | MISSING | P3/P5 | outage tests |

---

# J. Future ranging and Wi-Fi semantics

| ID | Contract requirement | Source | Baseline | Owner | Acceptance evidence |
|---|---|---|---|---|---|
| RNG-001 | Evidence interface is future-ready for precise peer/anchor ranging without architecture rewrite. | §23K | MISSING | P2/P5 | provider-interface test |
| RNG-002 | Future providers may include UWB, Bluetooth Channel Sounding and Wi-Fi NAN RTT. | §23K | MISSING | P5 | capability abstraction audit |
| RNG-003 | Direct ranges can support multilateration/tight local constraints only when genuinely supported. | §23K | MISSING | P5/P9 | compatible-hardware test when available |
| RNG-004 | Reno14 Pro V1 must not depend on UWB/Bluetooth 6 Channel Sounding support. | §23K | RULE | P9 | capability report |
| WIFI-SEM-001 | Learn Wi-Fi fingerprints while Location is ON and normal scan access is legitimate. | §23L | MISSING | P4 | learning test |
| WIFI-SEM-002 | SSID names may provide semantic hints such as mall/school/station/building/business but never truth alone. | §23L | MISSING/RULE | P4/P5 | spoof test |
| WIFI-SEM-003 | Combinations of radio/semantic clues are stronger than a single SSID. | §23L | MISSING | P4/P5 | fusion test |
| WIFI-SEM-004 | Normal Android Location-OFF limitations must be respected; no permission abuse. | §23L | RULE | P6/P8 | Android API/security audit |
| WIFI-SEM-005 | Ground receivers may independently contribute local Wi-Fi context. | §23L | MISSING | P5 | receiver context test |

---

# K. Location-OFF fusion and backward smoothing

| ID | Contract requirement | Source | Baseline | Owner | Acceptance evidence |
|---|---|---|---|---|---|
| FUS-001 | Learned odometry, ground receivers, magnetic, landmarks, Wi-Fi semantics and future ranging feed one persistent hypothesis map rather than isolated fallbacks. | §23M | MISSING | P5 | integration test |
| FUS-002 | Hypothesis weight incorporates motion likelihood. | §23M | MISSING | P5 | deterministic fusion test |
| FUS-003 | Incorporate map likelihood. | §23M | MISSING | P5 | deterministic fusion test |
| FUS-004 | Incorporate magnetic likelihood. | §23M | MISSING | P5 | deterministic fusion test |
| FUS-005 | Incorporate landmark likelihood. | §23M | MISSING | P5 | deterministic fusion test |
| FUS-006 | Incorporate place-signature likelihood. | §23M | MISSING | P5 | deterministic fusion test |
| FUS-007 | Incorporate radio-route likelihood. | §23M | MISSING | P5 | deterministic fusion test |
| FUS-008 | Incorporate witness/receiver likelihood. | §23M | MISSING | P5 | deterministic fusion test |
| FUS-009 | Historical route is weak/supporting prior, not truth. | §23M | MISSING/RULE | P5 | alternative-route tests |
| FUS-010 | Strong/medium/weak evidence hierarchy influences weighting without exposing fake calibrated percentages. | §23M | MISSING | P5/P7 | calibration/UI audit |
| FUS-011 | Parent can show estimated area dimensions and evidence summary with last precise age. | §23M | MISSING | P7 | UI test |
| FUS-012 | Trusted receiver may collapse uncertainty to validated receiver area. | §23M | MISSING | P5/P7 | receiver test |
| SMOOTH-001 | When precise location returns, run backward smoothing over degraded interval. | §23M | MISSING | P5 | synthetic endpoint test |
| SMOOTH-002 | New precise endpoint helps rerank earlier hypotheses. | §23M | MISSING | P5 | smoothing test |
| SMOOTH-003 | Raw evidence is never rewritten by smoothing. | §23M | RULE | P5/P8 | immutability test |
| SMOOTH-004 | Refined estimated history is stored separately from raw observations/original realtime estimate. | §23M | MISSING | P5/P7 | schema/history test |

---

# L. Optional Shizuku Enhanced System Bridge and parent Location control

| ID | Contract requirement | Source | Baseline | Owner | Acceptance evidence |
|---|---|---|---|---|---|
| SHZ-001 | Shizuku is optional enhancement, never Brick Core dependency. | §23N | MISSING/RULE | P6/P8/P9 | kill/reboot tests |
| SHZ-002 | Device Owner remains primary persistent management mechanism. | §23N | BUILT_SOURCE/RULE | P6/P9 | state tests |
| SHZ-003 | Test Shizuku UserService fresh Wi-Fi evidence with Location OFF on actual Reno14 Pro/ColorOS. | §23N | MISSING/DEVICE_VERIFY | P6/P9 | device test result: supported or verified unsupported |
| SHZ-004 | If available, Shizuku Wi-Fi evidence may include SSID, privacy-reduced BSSID, RSSI, frequency/band, timestamp and useful security/capability summary. | §23N | MISSING | P6 | provider test |
| SHZ-005 | Shizuku Wi-Fi feeds normal Wi-Fi semantic/Atlas evidence; no single SSID becomes truth. | §23N | MISSING | P6 | fusion test |
| SHZ-006 | If ColorOS blocks privileged Wi-Fi scan, provider becomes unavailable without breaking Brick. | §23N | MISSING | P6/P9 | denied-capability test |
| SHZ-007 | Optional privileged cellular environment may support coarse patterns only, not carrier-grade exact location. | §23N | MISSING | P6 | provider test |
| SHZ-008 | Privileged diagnostics may inspect Location/provider, Wi-Fi scanner, network, Doze/device idle, process/FGS and battery/power state where available. | §23N | MISSING | P6 | diagnostics tests |
| SHZ-009 | Approved power-policy repairs are narrowly scoped and capability checked. | §23N | MISSING | P6/P8 | allowlist/security tests |
| LOCCTL-001 | Parent portal stores persistent desired Location state ON/OFF. | §23N | MISSING | P6/P7 | command/state test |
| LOCCTL-002 | Desired ON + actual ON = healthy. | §23N | MISSING | P6 | state-machine test |
| LOCCTL-003 | Desired ON + actual OFF = Device Owner repair first, optional Shizuku secondary, then verification. | §23N | MISSING | P6 | state-machine test |
| LOCCTL-004 | Desired OFF + actual OFF = healthy. | §23N | MISSING | P6 | state-machine test |
| LOCCTL-005 | Desired OFF + actual ON applies requested managed state only where permitted and verifies result. | §23N | MISSING | P6 | state-machine test |
| LOCCTL-006 | Portal never claims Location changed until phone reports actual resulting state. | §23N | MISSING | P6/P7 | delayed/failure command tests |
| LOCCTL-007 | If Shizuku dies after Location ON, normal tracking stays ON; enhancement loss is separately reported. | §23N | MISSING | P6/P9 | Shizuku kill test |
| NOTIF-001 | Managed GPS-on notification title `Brick`, text `GPS on`. | §23N | MISSING | P6 | device notification test |
| NOTIF-002 | GPS-on notification is low importance/silent: no sound, vibration, heads-up, popup or per-position alerts. | §23N | MISSING | P6/P9 | device notification test |
| NOTIF-003 | Foreground status remains visible; do not hide ongoing foreground activity. | §23N | RULE | P6/P9 | device test |
| SOS-PRIV-001 | Child-initiated SOS may prototype privileged location-settings bypass separately from normal parent control. | §23N | MISSING/DEVICE_VERIFY | P6/P9 | device test |
| SOS-PRIV-002 | If emergency bypass unsupported, SOS falls back to existing Evidence Engine. | §23N | MISSING | P6/P9 | unsupported test |
| CMD-001 | Never expose generic remote shell command endpoint. | §23N | RULE | P6/P8 | source/security audit |
| CMD-002 | Privileged operations are typed and locally allowlisted. | §23N | MISSING | P6/P8 | allowlist tests |
| CMD-003 | Parent/device relationship authenticates each privileged command. | §23N | MISSING | P6/P8 | unauthorized test |
| CMD-004 | Commands are signed/device-bound. | §23N | MISSING | P6/P8 | wrong-device/signature tests |
| CMD-005 | Commands use nonce and short replay window. | §23N | MISSING | P6/P8 | replay test |
| CMD-006 | Commands are schema validated and audited. | §23N | MISSING | P6/P8 | malformed/audit test |
| SHZ-010 | Shizuku provider health is separately feature-detected/reported. | §23N | MISSING | P6/P7 | health UI test |
| SHZ-011 | No reboot may leave Brick waiting indefinitely for Shizuku. | §23N | MISSING | P6/P9 | reboot test |
| SHZ-012 | Test Location commands during network outage. | §23N acceptance | MISSING | P6/P9 | outage command test |
| SHZ-013 | Test duplicate/replayed and unauthorised parent commands. | §23N acceptance | MISSING | P6/P8/P9 | security tests |
| SHZ-014 | Test SOS with Location OFF and normal tracking after Shizuku failure. | §23N acceptance | MISSING | P6/P9 | device tests |

---

# M. Environmental Fingerprint Atlas and Signal Trust

| ID | Contract requirement | Source | Baseline | Owner | Acceptance evidence |
|---|---|---|---|---|---|
| ATL-001 | Atlas learns environment only when fresh trustworthy position can label the area/route. | §23O | MISSING | P4 | training-gate test |
| ATL-002 | Atlas stores compact learned fingerprints rather than collecting data for its own sake. | §23O | MISSING/RULE | P4/P8 | storage/privacy audit |
| ATL-003 | Signal value depends on geographic distinctiveness, stability, freshness and measurement quality, with other trust factors. | §23O | MISSING | P4 | trust-model tests |
| WIFI-001 | Long-lived Wi-Fi identity uses BSSID or privacy-reduced stable fingerprint. | §23O | MISSING | P4/P8 | privacy test |
| WIFI-002 | SSID is semantic hint only. | §23O | MISSING/RULE | P4/P8 | spoof test |
| WIFI-003 | Learn RSSI distribution across repeated scans. | §23O | MISSING | P4 | learning test |
| WIFI-004 | Learn relative AP signal ordering. | §23O | MISSING | P4 | learning test |
| WIFI-005 | Learn band/frequency/channel and useful exposed capability/security summary. | §23O | MISSING | P4 | provider test |
| WIFI-006 | Learn AP cluster co-occurrence, zone appearance/disappearance and route gradients. | §23O | MISSING | P4 | learning test |
| WIFI-007 | Incorporate RTT distance/uncertainty when supported. | §23O | MISSING | P4/P5 | RTT integration test |
| WIFI-008 | Wi-Fi fingerprint is cluster-based; AP replacement should not destroy place recognition if other evidence remains. | §23O | MISSING | P4 | router replacement test |
| WIFI-009 | Shared/common SSIDs such as Wireless@SGx/guest@swn automatically approach near-zero semantic location value when geographically broad. | §23O | MISSING | P4/P9 | common-SSID test |
| BLE-ENV-001 | Scan all BLE advertisements Android legitimately permits, not only Brick-owned beacons. | §23O | MISSING | P4 | provider test |
| BLE-ENV-002 | Learn privacy-reduced identifier, RSSI distribution, Tx power, manufacturer/service fingerprints, service UUIDs, SID, PHY, timing/co-occurrence/stability where exposed. | §23O | MISSING | P4 | provider/schema test |
| BLE-ENV-003 | Classify TRUSTED_ANCHOR. | §23O | PARTIAL | P4 | classification test |
| BLE-ENV-004 | Classify DISTINCTIVE_STATIC. | §23O | MISSING | P4 | classification test |
| BLE-ENV-005 | Classify LOCAL_COMMON. | §23O | MISSING | P4 | classification test |
| BLE-ENV-006 | Classify MOBILE. | §23O | MISSING | P4 | moving-device test |
| BLE-ENV-007 | Classify UNSTABLE. | §23O | MISSING | P4 | instability test |
| BLE-ENV-008 | Classify STALE. | §23O | MISSING | P4 | decay test |
| BLE-ENV-009 | Classify UNKNOWN for insufficient history. | §23O | MISSING | P4 | new-device test |
| BLE-ENV-010 | Moving transmitter automatically loses place-location weight. | §23O | MISSING | P4 | moving-device test |
| BLE-ENV-011 | BLE sampling is adaptive: sparse deep stationary, periodic moving, increased degraded, aggressive but bounded SOS. | §23O | MISSING | P2/P4/P8/P9 | cadence/battery tests |
| LAN-001 | Learn authorised local gateway/router/service/device environment. | §23O | MISSING | P4 | LAN learning test |
| LAN-002 | LAN signals may include mDNS/NSD, SSDP/UPnP, casting, printers, TVs, NAS, smart-home/Matter and DNS/network characteristics where visible. | §23O | MISSING | P4 | provider test |
| LAN-003 | LAN devices do not reveal address alone; association is learned only from trusted position. | §23O | RULE | P4/P5 | training/fusion audit |
| CELL-001 | Learn legitimately exposed LTE/NR, signal, RSRP/RSRQ/SINR/RSSNR, Timing Advance, identity/band/channel/neighbour/handovers where permitted. | §23O | MISSING | P4/P6 | provider capability tests |
| CELL-002 | Cellular evidence remains route/area support, never DIY exact tower triangulation. | §23O | RULE | P5/P8 | fusion/source audit |
| GNSS-ATL-001 | Learn constellation mix/count, C/N0, azimuth/elevation, used-in-fix, carrier info, blocked-sky and multipath/open-sky transition patterns where available. | §23O | MISSING/PARTIAL | P4 | GNSS fingerprint tests |
| GNSS-ATL-002 | Do not treat satellite identity as permanent place identifier. | §23O | RULE | P4/P8 | model audit |
| NET-ATL-001 | Learn transport, IPv4/IPv6, DNS, captive-portal, latency, loss and interface-transition patterns where permitted. | §23O | MISSING/PARTIAL | P4 | network fingerprint tests |
| NET-ATL-002 | Network context cannot outweigh stronger sensor/radio anchors by itself. | §23O | RULE | P5/P8 | fusion test |
| COMP-001 | Known companion/accessory presence may be weak/medium context only. | §23O | MISSING | P4/P5 | context test |
| COMP-002 | Charging type/start/duration/battery state may be contextual evidence only. | §23O | MISSING/PARTIAL | P4/P5 | context test |
| ARR-001 | Learn approach/departure/building-entry temporal sequences. | §23O | MISSING | P4 | repeated-route test |
| ARR-002 | Learn turns/stops/stairs/escalator/lift/corridor/dwell together with environment. | §23O | MISSING | P3/P4 | sequence test |
| ZONE-001 | Learn zone/floor fingerprints using relative Wi-Fi, BLE, RTT, magnetic, vertical transitions and motion where evidence supports it. | §23O | MISSING | P4/P5 | zone test |
| ZONE-002 | UI labels zone/floor as estimated unless validation proves stronger accuracy. | §23O | MISSING/RULE | P7/P9 | UI + ground-truth test |
| ZONE-003 | Never invent barometer evidence on target hardware that lacks it. | §23O/§82 | RULE | P8 | source audit |
| PRIOR-001 | Typical arrival/departure/dwell timing is weak prior only. | §23O | MISSING | P4/P5 | time-only adversarial test |
| TRUST-001 | Trust model uses geographic uniqueness/spread. | §23O | MISSING | P4 | trust tests |
| TRUST-002 | Trust model uses stability across repeated trusted visits. | §23O | MISSING | P4 | trust tests |
| TRUST-003 | Trust model detects mobility across distant places. | §23O | MISSING | P4 | moving-device test |
| TRUST-004 | Trust model uses freshness/age. | §23O | MISSING | P4 | stale test |
| TRUST-005 | Trust model uses measurement quality and repeatability. | §23O | MISSING | P4 | noisy-provider tests |
| TRUST-006 | Trust model considers spoofability. | §23O | MISSING | P4 | spoof tests |
| TRUST-007 | Trust model considers correlation/independence. | §23O | MISSING | P2/P4 | duplicate-evidence test |
| TRUST-008 | Trust model considers source health. | §23O | MISSING | P2/P4 | provider-failure test |
| TRUST-009 | Trust model considers observation count and replacement/change history. | §23O | MISSING | P4 | learning/decay tests |
| TRUST-010 | Common signals collapse toward zero; distinctive stable clusters may gain weight. | §23O | MISSING | P4 | geographic-spread tests |
| TRUST-011 | Maintain DISTINCTIVE_STATIC/LOCAL_COMMON/GLOBAL_COMMON/MOBILE/UNSTABLE/STALE/UNKNOWN classes as applicable. | §23O | MISSING | P4 | classification suite |
| IND-001 | Correlated observations are grouped so they cannot multiply confidence unrealistically. | §23O | MISSING | P2/P4/P5 | anti-double-count test |
| NEG-001 | Missing signal is cautious negative evidence; repeated trusted disappearance matters more than one missed scan. | §23O | MISSING | P4 | negative-evidence test |
| RELEARN-001 | Router/TV/beacon/cellular changes automatically decay old signals and promote stable replacements. | §23O | MISSING | P4/P9 | replacement/relearning tests |
| PRIV-ATL-001 | Long-term Wi-Fi/BLE identifiers use keyed/HMAC/privacy-reduced form where practical. | §23O | MISSING | P4/P8 | privacy audit |
| PRIV-ATL-002 | Raw environmental scans have bounded retention only as needed for calibration/debugging. | §23O | MISSING | P4/P8/P9 | retention expiry test |
| PRIV-ATL-003 | No public crowdsourced BLE/Wi-Fi database. | §23O | RULE | P8 | architecture audit |
| ATL-FUS-001 | Atlas match feeds the central Evidence Engine/particle map with motion/map/magnetic/landmark/Wi-Fi/RTT/BLE/LAN/cell/GNSS/network/companion/route context. | §23O | MISSING | P5 | integration test |
| ATL-UI-001 | Parent UI shows honest ANCHORED/ESTIMATED descriptions and evidence families, not raw internal score. | §23O | MISSING | P7 | UI test |
| ATL-HLTH-001 | Device Health separately reports each Atlas provider/capability including unsupported state. | §23O | MISSING | P7 | health UI test |

---

# N. History, playback, stops, geofences and trips

| ID | Contract requirement | Source | Baseline | Owner | Acceptance evidence |
|---|---|---|---|---|---|
| HIST-001 | Parent supports Today, Yesterday, 7 days, 30 days and custom date history. | §24 | BUILT_SOURCE/PARTIAL | P7/P9 | browser test |
| HIST-002 | History stores trusted route and raw route where needed. | §24 | PARTIAL/AUDIT_REQUIRED | P7/P8 | schema/history audit |
| HIST-003 | History includes time, speed, transport mode, accuracy, source, quality, battery and connectivity events. | §24 | PARTIAL | P7 | history audit |
| HIST-004 | Timeline includes meaningful movement/arrival/departure events. | §24 | BUILT_SOURCE/PARTIAL | P7 | browser test |
| PLAY-001 | Route playback supported. | §25 | BUILT_SOURCE | P7/P9 | browser test |
| PLAY-002 | Playback speeds include 0.5×/1×/2×/5×/10×. | §25 | BUILT_SOURCE/AUDIT_REQUIRED | P7 | browser test |
| PLAY-003 | Playback marker shows time, speed, mode and accuracy. | §25 | BUILT_SOURCE/PARTIAL | P7 | browser test |
| ROUTE-DISP-001 | Display route simplifies redundant points while retaining original history. | §26 | PARTIAL/AUDIT_REQUIRED | P7 | 10k-point rendering test |
| ROUTE-DISP-002 | Display simplification preserves turns/stops. | §26 | AUDIT_REQUIRED | P7 | route-shape test |
| TRIP-001 | Trip details include distance, duration, moving time, average speed, max trusted speed and mode transitions. | §27 | PARTIAL | P7 | trip test |
| STOP-001 | Detect meaningful stationary stops. | §28 | BUILT_SOURCE/PARTIAL | P7 | trip tests |
| STOP-002 | Avoid treating traffic lights/brief stops as location events through activity+dwell logic. | §28 | PARTIAL | P7/P9 | vehicle stop tests |
| GEO-001 | Parent supports Home/School/Grandparents/custom geofences. | §29 | BUILT_SOURCE | P7/P9 | browser/device test |
| GEO-002 | Geofences use hysteresis around boundaries. | §29 | BUILT_SOURCE/AUDIT_REQUIRED | P7 | boundary test |
| GEO-003 | Geofences use dwell to reduce flapping. | §29 | BUILT_SOURCE/AUDIT_REQUIRED | P7 | boundary test |
| TRIP-002 | Parent or child can start Trip Mode to destination. | §30 | BUILT_SOURCE/PARTIAL | P7 | trip start test |
| TRIP-003 | Trip Mode prioritizes tracking, battery/connectivity, route progress, quality and prolonged-stop detection. | §30 | PARTIAL | P7/P8 | trip behavior test |
| TRIP-004 | Alternate road alone does not trigger an alert. | §30 | AUDIT_REQUIRED | P7/P8 | alternate-route test |

---

# O. SOS and I'M SAFE

| ID | Contract requirement | Source | Baseline | Owner | Acceptance evidence |
|---|---|---|---|---|---|
| SOS-001 | SOS is highest-priority event. | §31 | BUILT_SOURCE | P8/P9 | priority/backlog test |
| SOS-002 | SOS preserves previous history. | §31 | BUILT_SOURCE/AUDIT_REQUIRED | P8/P9 | offline SOS test |
| SOS-003 | SOS raises location frequency. | §31 | BUILT_SOURCE | P8/P9 | cadence measurement |
| SOS-004 | SOS raises transmission priority. | §31 | BUILT_SOURCE | P8/P9 | backlog test |
| SOS-005 | SOS immediately alerts parent when transport permits. | §31 | BUILT_SOURCE/PARTIAL | P7/P9 | live/offline test |
| SOS-006 | SOS requests fresh current location and aggressive fallback. | §31 | BUILT_SOURCE/PARTIAL | P5/P6/P9 | Location ON/OFF SOS tests |
| SOS-007 | SOS continues until explicitly cancelled. | §31 | BUILT_SOURCE | P8/P9 | persistence/reboot test |
| SOS-008 | SOS packets bypass normal history/evidence backlog. | §31 | BUILT_SOURCE | P8/P9 | backlog priority test |
| SAFE-001 | I'M SAFE is one-tap. | §32 | BUILT_SOURCE | P7/P9 | device test |
| SAFE-002 | Parent receives check-in time/location/battery/position quality where available. | §32 | PARTIAL | P7/P9 | event display test |
| SAFE-003 | I'M SAFE uses durable retry semantics like other safety events. | §33/acceptance | BUILT_SOURCE | P8/P9 | offline/reboot/ACK tests |

---

# P. Local durability, protocols and Cloudflare processing

| ID | Contract requirement | Source | Baseline | Owner | Acceptance evidence |
|---|---|---|---|---|---|
| DUR-001 | Durable tracking record path is create → encrypted local journal → send → durably accept → ACK → mark delivered. | §33 | BUILT_SOURCE | P8/P9 | crash/network fault tests |
| DUR-002 | Never use send-and-hope semantics. | §33 | RULE | P8 | source/fault audit |
| DUR-003 | Retain at least 7 days, preferably 14 days, normal encrypted local backlog. | §34 | DEVICE_VERIFY | P8/P9 | measured outage/backlog test |
| DUR-004 | Every durable event/location uses device epoch, sequence and monotonic timestamp as applicable. | §35 | BUILT_SOURCE | P8 | protocol tests |
| DUR-005 | Server can detect missing sequence without deleting unsent client record. | §35 | BUILT_SOURCE/PARTIAL | P8 | gap test |
| DUR-006 | No blind duplicate-every-packet strategy. | §36 | BUILT_SOURCE/RULE | P8 | source audit |
| DUR-007 | Missing ACK causes resend; exact valid ACK permits removal. | §36 | BUILT_SOURCE | P8/P9 | dropped-ACK test |
| DUR-008 | Duplicate upload is logically harmless/idempotent. | §37 | BUILT_SOURCE | P8/P9 | duplicate test |
| DUR-009 | Critical safety has realtime state plus durable queue path. | §38 | BUILT_SOURCE | P8/P9 | Queue failure test |
| DUR-010 | Repeated Queue processing failures reach DLQ instead of disappearing. | §39 | BUILT_SOURCE | P8/P9 | DLQ recovery test |
| DO-001 | One authoritative Durable Object per child owns current state. | §40 | BUILT_SOURCE | P7/P8 | state consistency test |
| DO-002 | Current state covers trusted/raw position, sequence, battery, speed, motion, quality, heartbeat and health. | §40 | BUILT_SOURCE/PARTIAL | P7 | state schema audit |
| WS-001 | Parent live state uses WebSocket rather than 1-second polling. | §41 | BUILT_SOURCE | P7/P9 | browser/network test |
| Q-001 | Live position updates current state immediately while history processing may batch via Queue. | §42 | BUILT_SOURCE | P7/P8 | latency/load test |
| PKT-001 | Live packet is compact and contains protocol/epoch/sequence/time/location/accuracy/speed/bearing/battery/activity/quality/status information. | §43 | BUILT_SOURCE | P2/P8 | protocol audit |
| PKT-002 | Infrequent health metadata is not redundantly sent every 3 seconds. | §43 | BUILT_SOURCE | P8 | network capture |
| PKT-003 | Binary compact encoding is used instead of giant repetitive JSON for live tracking. | §44 | BUILT_SOURCE | P8 | packet audit |
| COMPRESS-001 | Tiny live packets are not pointlessly compressed. | §45 | BUILT_SOURCE | P8 | protocol audit |
| COMPRESS-002 | Offline/history data uses delta/batch/compression where beneficial. | §45 | BUILT_SOURCE | P7/P8 | codec tests |
| KEYFRAME-001 | History periodically includes absolute coordinate keyframes so one damaged delta cannot poison all following history. | §46 | PARTIAL/AUDIT_REQUIRED | P7/P8 | missing-delta test |

---

# Q. Recovery, lifecycle and device qualification

| ID | Contract requirement | Source | Baseline | Owner | Acceptance evidence |
|---|---|---|---|---|---|
| SUP-001 | Independently monitor Location, Sensor, Activity, Network, Journal and Health loops. | §47 | PARTIAL | P2/P3/P8 | fault-injection tests |
| SUP-002 | Recover failed submodule rather than restart whole app/phone where possible. | §47 | PARTIAL | P8/P9 | module crash tests |
| SUP-003 | Stale location subscription is recreated automatically. | §47/§81 | BUILT_SOURCE | P8/P9 | stale subscription test |
| WATCH-001 | Cloud side independently detects missing device heartbeat/offline condition. | §48 | BUILT_SOURCE/PARTIAL | P7/P8/P9 | heartbeat-loss test |
| WATCH-002 | Persistent failure, not momentary lateness, drives parent notification. | §48/§71/§72 | BUILT_SOURCE/PARTIAL | P7/P8 | hysteresis tests |
| WM-001 | WorkManager is used for persisted recovery/backlog/housekeeping/cleanup/retry, not as main live tracker. | §49 | BUILT_SOURCE | P8/P9 | lifecycle audit |
| AND-001 | Design for modern Android 15 foreground/background/boot constraints. | §50 | BUILT_SOURCE/DEVICE_VERIFY | P8/P9 | Android/ColorOS tests |
| OPPO-001 | Real Reno10 Pro and/or Reno14 Pro ColorOS testing is mandatory; emulator alone is insufficient. | §51 | DEVICE_VERIFY | P9 | physical test report |
| OPPO-002 | Reno14 Pro is primary V1 target but no dual-frequency/centimetre-GNSS claim. | intro/§52 | RULE | P9 | capability report |
| OPPO-003 | Battery behavior is measured using real device telemetry, not estimated only. | §51/§80 | DEVICE_VERIFY | P8/P9 | 24h/72h measurements |

---

# R. Security, pairing, storage, retention and backup

| ID | Contract requirement | Source | Baseline | Owner | Acceptance evidence |
|---|---|---|---|---|---|
| SEC-001 | Parent path is protected by Cloudflare Access/approved parent auth before sensitive Worker operations. | §53 | BUILT_SOURCE | P8/P9 | auth tests |
| SEC-002 | Mandatory device auth: TLS + per-device asymmetric signing key + Android Keystore + sequence/replay protection. | §54 | BUILT_SOURCE | P8/P9 | security audit |
| SEC-003 | mTLS may be optional defense-in-depth but not sole identity layer. | §54 | MISSING/OPTIONAL | P8 | explicit decision/config audit |
| SEC-004 | No hard-coded shared secret in APK. | §55 | BUILT_SOURCE | P8/P9 | APK/static audit |
| PAIR-001 | Parent creates one-time pairing QR. | §56 | BUILT_SOURCE | P8/P9 | pairing test |
| PAIR-002 | Child generates keypair and registers public key. | §56 | BUILT_SOURCE | P8/P9 | pairing test |
| PAIR-003 | Pairing token is one-time/consumed/destroyed. | §56 | BUILT_SOURCE | P8/P9 | replay test |
| PAIR-004 | Lost/revoked device can be revoked. | §56 | BUILT_SOURCE | P8/P9 | revoke test |
| PAIR-005 | Revocation blocks future uploads while preserving historical records read-only. | production requirement | BUILT_SOURCE | P8/P9 | post-revoke tests |
| WAF-001 | Device/public API uses WAF/rate limiting/schema validation/auth/replay protection as applicable. | §57 | BUILT_SOURCE | P8/P9 | deployment/security tests |
| STORE-001 | Durable Object is current state; D1 structured metadata/indexes/audit; R2 compressed detailed history. | §58 | BUILT_SOURCE | P7/P8 | schema/storage audit |
| STORE-002 | R2 history is segmented/batched, not one object per GPS point. | §59 | BUILT_SOURCE | P7/P8 | object-layout test |
| RET-001 | Automatic retention exists; example policy raw detail 30d/trusted 90d/safety configurable/system logs 7d unless contract later changes explicitly. | §60 | BUILT_SOURCE/PARTIAL | P7/P8/P9 | lifecycle/retention test |
| RET-002 | Retention cleanup is automatic; no routine manual cleanup. | §60 | BUILT_SOURCE | P8/P9 | expiry test |
| BAK-001 | Critical configuration/history indexes have logical backup strategy beyond provider durability. | §61 | BUILT_SOURCE/PARTIAL | P8 | backup audit |
| BAK-002 | D1 PITR/scheduled export strategy must be paired with actual tested restore. | §61 + production blocker | PARTIAL | P8/P9 | destructive restore drill |

---

# S. Parent dashboard, health and alerts

| ID | Contract requirement | Source | Baseline | Owner | Acceptance evidence |
|---|---|---|---|---|---|
| PUI-001 | Primary desktop dashboard centers on live map + child summary; mobile becomes map + expandable sheet. | §62 | BUILT_SOURCE/PARTIAL | P7 | browser responsive test |
| PUI-002 | Primary tabs include Now, History, Trips, Places and Device Health. | §62 | BUILT_SOURCE | P7/P9 | browser test |
| PUI-003 | Map marker stays minimal; tap reveals name/mode/speed/accuracy/age. | §63 | BUILT_SOURCE | P7/P9 | browser test |
| PUI-004 | Accuracy geometry remains visible. | §63 | BUILT_SOURCE | P7/P9 | map test |
| PUI-005 | UI interpolates movement smoothly between network updates rather than sending animation-frame packets. | §64 | BUILT_SOURCE | P7/P9 | browser/network test |
| PUI-006 | Always distinguish DEVICE HEALTH from POSITION quality. | §65 | BUILT_SOURCE | P7/P9 | UI test |
| PUI-007 | Quick info includes current place, update age, accuracy, speed, mode, battery/charging, connectivity and position quality. | §66 | BUILT_SOURCE/PARTIAL | P7 | browser test |
| PUI-008 | History UI uses date selector, map route and timeline; selecting timeline moves map. | §67 | BUILT_SOURCE/PARTIAL | P7 | browser test |
| HEALTH-001 | Device Health reports tracker service, Location, precise/background permission, activity, sensors, network, cloud, local queue, ACK, last location/packet, pending/oldest, uptime and recovery evidence. | §68 | BUILT_SOURCE/PARTIAL | P7/P8 | health schema/UI test |
| HEALTH-002 | Health page explains failure rather than requiring guesswork. | §68 | PARTIAL | P7/P8 | injected failures |
| HEALTH-003 | Maintain automatic health/failure history with recovery details. | §69 | BUILT_SOURCE | P7/P8 | incident test |
| REL-001 | Reliability metrics are based on measured tracking availability, position availability, packet delivery and interventions. | §70 | BUILT_SOURCE/PARTIAL | P7/P8/P9 | metric validation |
| REL-002 | Do not invent arbitrary 98/100 health score. | §70 | RULE | P7/P8 | UI audit |
| ALERT-001 | Alert on SOS. | §71 | BUILT_SOURCE | P7/P9 | alert test |
| ALERT-002 | Alert on persistent Location unavailable. | §71 | BUILT_SOURCE/PARTIAL | P7/P9 | hysteresis test |
| ALERT-003 | Alert on persistent device offline. | §71 | BUILT_SOURCE/PARTIAL | P7/P9 | hysteresis test |
| ALERT-004 | Alert on critical battery. | §71/§73 | BUILT_SOURCE | P7/P9 | battery test |
| ALERT-005 | Alert on unhealthy Brick service. | §71 | BUILT_SOURCE/PARTIAL | P7/P9 | service-failure test |
| ALERT-006 | Arrival/departure and trip-overdue alerts are opt-in/appropriate. | §71 | BUILT_SOURCE/PARTIAL | P7 | settings/event test |
| ALERT-007 | Do not alert for one packet a couple seconds late. | §71 | RULE | P7/P8 | jitter test |
| ALERT-008 | Alert hysteresis escalates internal degraded/health check/persistent notification over time; SOS tighter. | §72 | PARTIAL | P7/P8 | timing test |
| BAT-001 | Default low battery 15%, critical 5%. | §73 | BUILT_SOURCE | P7/P9 | battery event test |
| BAT-002 | Parent shows battery + charging state. | §73 | BUILT_SOURCE | P7/P9 | dashboard test |
| BAT-003 | Track abnormal drain trends. | §73 | BUILT_SOURCE | P7/P8/P9 | measured trend test |
| BAT-004 | Do not promise exact remaining runtime without enough calibrated data. | §73 | RULE | P7 | UI audit |
| CONN-001 | Parent shows Wi-Fi/Mobile/Offline. | §74 | BUILT_SOURCE | P7/P9 | network test |
| CONN-002 | Avoid unnecessary SSID exposure in history; minimize personal metadata. | §74 | RULE/PARTIAL | P7/P8 | privacy audit |

---

# T. Map privacy, reverse geocoding, analytics, crash and update health

| ID | Contract requirement | Source | Baseline | Owner | Acceptance evidence |
|---|---|---|---|---|---|
| MAP-001 | Parent map uses MapLibre. | §75 | BUILT_SOURCE | P7/P9 | browser test |
| MAP-002 | Map assets are private/self-hosted OSM-derived via Brick/Cloudflare where configured; avoid sending viewed child coordinates to Google Maps. | §75 | BUILT_SOURCE/PARTIAL | P8/P9 | browser Network audit |
| GEOREV-001 | Singapore-centric place/address resolution uses Brick-owned/OSM-derived infrastructure rather than external per-coordinate Google lookup. | §76 | BUILT_SOURCE | P7/P9 | map/place test |
| PRIV-001 | No Firebase Analytics, Google Analytics, Meta SDK, ad SDK or marketing tracker. | §77 | BUILT_SOURCE | P8/P9 | dependency/network audit |
| PRIV-002 | Brick observability is system/service telemetry under Brick infrastructure. | §77 | BUILT_SOURCE | P8 | telemetry audit |
| PRIV-003 | Coordinates are excluded from ordinary debug logs. | §77 | BUILT_SOURCE/PARTIAL | P8 | static/runtime log audit |
| CRASH-001 | No third-party crash service gets location dumps. | §78 | BUILT_SOURCE | P8 | dependency/network audit |
| CRASH-002 | Minimal crash report includes version/module/exception signature/timestamp/device identity as needed. | §78 | BUILT_SOURCE | P8 | crash test |
| CRASH-003 | Location payload is included only if explicitly required and stored within Brick infrastructure. | §78 | RULE | P8 | crash schema audit |
| UPDATE-001 | Parent shows installed app version, current release and update state. | §79 | BUILT_SOURCE | P7/P9 | browser test |
| UPDATE-002 | Silent managed updating is not claimed until experimentally validated on OPPO. | §79 | RULE/DEVICE_VERIFY | P9 | update test |

---

# U. Acceptance and failure targets

| ID | Contract requirement | Source | Baseline | Owner | Acceptance evidence |
|---|---|---|---|---|---|
| TST-001 | 72h untouched. | §80 | NOT_ACCEPTED | P9 | physical run log |
| TST-002 | 7 days untouched. | §80 | NOT_ACCEPTED | P9 | physical run log |
| TST-003 | screen off overnight. | §80 | NOT_ACCEPTED | P9 | physical run log |
| TST-004 | Doze. | §80 | NOT_ACCEPTED | P9 | physical run log |
| TST-005 | Wi-Fi↔cellular transitions. | §80 | NOT_ACCEPTED | P9 | physical run log |
| TST-006 | two-hour Internet outage. | §80 | NOT_ACCEPTED | P9 | physical run log |
| TST-007 | degraded indoor location. | §80 | NOT_ACCEPTED | P9 | physical run log |
| TST-008 | GNSS loss/recovery. | §80 | NOT_ACCEPTED | P9 | physical run log |
| TST-009 | battery saver. | §80 | NOT_ACCEPTED | P9 | physical run log |
| TST-010 | low battery. | §80 | NOT_ACCEPTED | P9 | physical run log |
| TST-011 | charging behavior. | §80 | NOT_ACCEPTED | P9 | physical run log |
| TST-012 | app process killed. | §80 | NOT_ACCEPTED | P9 | physical run log |
| TST-013 | network connection killed. | §80 | NOT_ACCEPTED | P9 | physical run log |
| TST-014 | Cloudflare temporarily unreachable. | §80 | NOT_ACCEPTED | P9 | physical/integration run log |
| TST-015 | out-of-order packets. | §80 | SOURCE_TESTED/NOT_DEVICE_ACCEPTED | P8/P9 | integration run log |
| TST-016 | duplicate packets. | §80 | SOURCE_TESTED/NOT_DEVICE_ACCEPTED | P8/P9 | integration run log |
| TST-017 | corrupted payload. | §80 | SOURCE_TESTED/NOT_DEVICE_ACCEPTED | P8/P9 | integration run log |
| TST-018 | thousands queued. | §80 | NOT_ACCEPTED | P8/P9 | backlog run log |
| TST-019 | ColorOS memory pressure. | §80 | NOT_ACCEPTED | P9 | physical run log |
| TST-020 | phone reboot. | §80 | NOT_ACCEPTED | P9 | physical run log |
| TST-021 | app update. | §80 | NOT_ACCEPTED | P9 | physical run log |
| TST-022 | Cloudflare Worker deployment during operation. | §80 | NOT_ACCEPTED | P9 | live run log |
| TST-023 | repeated Atlas place learning/matching with precise location degraded. | §80 | MISSING | P9 | real-place test |
| TST-024 | common SSID down-weighting including Wireless@SGx/guest@swn. | §80 | MISSING | P9 | multi-location test |
| TST-025 | spoofed/copied SSID cannot anchor when independent evidence disagrees. | §80 | MISSING | P9 | adversarial test |
| TST-026 | BLE static/mobile classification and transient rejection. | §80 | MISSING | P9 | moving-device test |
| TST-027 | screen-off/background BLE fingerprint collection at intended adaptive cadence. | §80 | MISSING | P9 | device battery/cadence test |
| TST-028 | router/AP/TV/beacon replacement triggers decay/relearning. | §80 | MISSING | P9 | replacement test |
| TST-029 | LAN discovery available/denied/changed without breaking Core. | §80 | MISSING | P9 | permission/network test |
| TST-030 | Location OFF + Shizuku BLE succeeds or fails cleanly. | §80 | MISSING | P9 | device capability test |
| TST-031 | Location OFF + Shizuku Wi-Fi succeeds or fails cleanly. | §80 | MISSING | P9 | device capability test |
| TST-032 | LTE/5G transitions + Timing Advance supported/unsupported handling. | §80 | MISSING | P9 | device route test |
| TST-033 | GNSS→indoor transition/building-entry matching. | §80 | MISSING | P9 | physical route test |
| TST-034 | zone/floor inference only where validated and never presented as precise when weak. | §80 | MISSING | P9 | ground-truth test |
| TST-035 | 24h and 72h Atlas battery-impact tests across stationary/walking/vehicle/degraded modes. | §80 | MISSING | P9 | measured battery report |
| TST-036 | environmental raw-scan/identifier retention expiry according to policy. | §80 | MISSING | P9 | retention test |
| TST-037 | Every recoverable event requires zero manual intervention. | §80/§81 | NOT_ACCEPTED | P8/P9 | intervention log must remain 0 |
| FAIL-001 | Network disappears → automatic recovery/backlog. | §81 | PARTIAL | P8/P9 | outage test |
| FAIL-002 | Cloudflare unavailable → automatic local continuation/retry. | §81 | PARTIAL | P8/P9 | outage test |
| FAIL-003 | WebSocket disconnect → automatic parent reconnection/state refresh. | §81 | BUILT_SOURCE/PARTIAL | P7/P9 | browser test |
| FAIL-004 | App network engine crash → automatic recovery. | §81 | PARTIAL | P8/P9 | injected crash test |
| FAIL-005 | Location subscription stall → automatic recreation. | §81 | BUILT_SOURCE | P8/P9 | injected stall test |
| FAIL-006 | Process death → persistent state restored via supported Android mechanisms. | §81 | BUILT_SOURCE/DEVICE_VERIFY | P8/P9 | kill test |
| FAIL-007 | Phone reboot → tracking re-establishes under validated managed/lifecycle strategy. | §81 | BUILT_SOURCE/DEVICE_VERIFY | P9 | reboot test |
| FAIL-008 | Backlog → automatic reconciliation. | §81 | BUILT_SOURCE/DEVICE_VERIFY | P8/P9 | outage/drain test |
| FAIL-009 | Duplicate data → safe. | §81 | BUILT_SOURCE | P8/P9 | duplicate test |
| FAIL-010 | Out-of-order data → safe. | §81 | BUILT_SOURCE/PARTIAL | P8/P9 | ordering test |
| FAIL-011 | Bad GPS does not poison trusted route. | §81 | PARTIAL | P8/P9 | bad-fix injection |
| FAIL-012 | Actually unavailable location is shown with honest uncertainty. | §81 | PARTIAL | P5/P7/P9 | Location OFF/weak evidence test |

---

# V. Explicit V1 non-goals

| ID | Non-goal | Source | State |
|---|---|---|---|
| NG-001 | Camera visual localisation. | §82/§23O | EXCLUDED |
| NG-002 | Microphone/ultrasonic localisation. | §82/§23O | EXCLUDED |
| NG-003 | Photo-library EXIF scraping. | §23O | EXCLUDED |
| NG-004 | Custom raw-GNSS pseudorange position solver. | §11/§82 | EXCLUDED |
| NG-005 | Constant max-rate Wi-Fi scanning. | §82 | EXCLUDED |
| NG-006 | DIY carrier-grade tower triangulation. | §82/§23O | EXCLUDED |
| NG-007 | Fake bus/train identification from activity alone. | §8/§82 | EXCLUDED |
| NG-008 | Long-duration pure inertial `exact` position. | §20/§82/§23O | EXCLUDED |
| NG-009 | Barometer positioning on target hardware where not present. | intro/§82/§23O | EXCLUDED |
| NG-010 | Permanent 1-second GPS outside bounded SOS/special need. | §82 | EXCLUDED |
| NG-011 | Blindly duplicate every network packet. | §36/§82 | EXCLUDED |
| NG-012 | Root/custom-ROM dependency. | §82 | EXCLUDED |
| NG-013 | Family car tracking/anchor. | §21/§82 | EXCLUDED |
| NG-014 | Public crowdsourced device tracking network. | §23B/§23O | EXCLUDED |
| NG-015 | Generic remote shell endpoint through Shizuku. | §23N | EXCLUDED |

---

# W. Final feature-list coverage check

The final §83 V1 feature list is covered by the IDs above as follows:

- reliable OPPO background tracking → `OBJ-*`, `SUP-*`, `AND-*`, `OPPO-*`, `FAIL-*`, `TST-*`
- Device Owner → `MGT-*`, `LOCCTL-*`
- adaptive/live cadence → `ACT-*`, `CAD-*`
- MapLibre/current readable location/accuracy/speed/mode/battery/network → `PUI-*`, `MAP-*`, `SPD-*`, `ACT-*`, `BAT-*`, `CONN-*`
- history/playback/speed/mode/stops/trips/geofences/arrival-departure → `HIST-*`, `PLAY-*`, `TRIP-*`, `STOP-*`, `GEO-*`, `ARR-*`
- SOS/I'M SAFE → `SOS-*`, `SAFE-*`, `SOS-PRIV-*`
- bad-GPS/GNSS/fallback → `GNSS-*`, `FILT-*`, `FB-*`, `DR-*`, `ROUTE-*`, `ANCH-*`, `NET-*`, `IP-*`
- Parallel Evidence / Witness / learned places / particle / radio / RTT / degraded areas → `EVD-*`, `WIT-*`, `PLACE-*`, `PF-*`, `RADIO-*`, `RTT-*`, `DEG-*`
- raw/trusted + journal/backlog/ACK/idempotency/priority → `RAW-*`, `DUR-*`
- Cloudflare DO/WS/Queue/DLQ/D1/R2/retention/Access/WAF → `DO-*`, `WS-*`, `Q-*`, `STORE-*`, `RET-*`, `SEC-*`, `WAF-*`
- keys/Keystore/mTLS/audit/no analytics → `SEC-*`, `PAIR-*`, `PRIV-*`
- Device Health/recovery/reliability/minimal child/richer parent → `HEALTH-*`, `SUP-*`, `REL-*`, `CUI-*`, `PUI-*`
- Environmental Atlas and Signal Trust → `ATL-*`, `TRUST-*`, `IND-*`, `NEG-*`, `RELEARN-*`
- Wi-Fi/BLE/LAN/cellular/GNSS-sky/network/zone fingerprints → `WIFI-*`, `BLE-ENV-*`, `LAN-*`, `CELL-*`, `GNSS-ATL-*`, `NET-ATL-*`, `ZONE-*`
- optional Shizuku, parent Location desired state, Device Owner primary repair, silent notification, Location-OFF evidence, privileged diagnostics, allowlisted commands, SOS experiment and graceful Shizuku failure → `SHZ-*`, `LOCCTL-*`, `NOTIF-*`, `CMD-*`, `SOS-PRIV-*`

## Phase 1 ledger rule

If later code inspection reveals a baseline status above is too optimistic, downgrade it explicitly and record why in `PROGRESS.md`. Never silently preserve a stronger status for appearance.
