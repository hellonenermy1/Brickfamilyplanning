# Brick V1 Phase 5 Requirement Matrix

Date: 2026-11-01
Status: **SOURCE CLOSURE CANDIDATE / FINAL 5B EXACT-PAIR CI IN PROGRESS / NOT ACCEPTED**

Current Phase 5B closure candidate:
- Android `v1-p5b-closure-android`: `a09a273bf19e37e70d37077e3ac0ede6a69b2332`
- Cloud `v1-p5b-closure-cloud`: `507b17c262e9eb2c135b79b7b5cdf6ffc317b634`
- Draft PR #14
- Exact-pair CI run `41295112045`

This matrix supersedes the old initial-Phase-5 matrix. `IMPLEMENTED SOURCE` does not mean `DEVICE VERIFIED` or `ACCEPTED`.

| Requirement | Current source evidence | Remaining gate |
|---|---|---|
| EVD-001 parallel degraded evidence | `ParallelEvidenceEngine` + central `Phase5PositionFusion` | final 5B instrumentation + device |
| EVD-002 last trusted position | aged `Phase5LastKnownInput` with growing uncertainty | final 5B instrumentation + device |
| EVD-003 motion/steps/heading/activity | Phase 3 particle/motion estimate feeds Phase 5 | final 5B instrumentation + device |
| EVD-004 route/path geometry | route candidate IDs + corridor metadata; radio-route reranking | final 5B instrumentation + real route |
| EVD-005 known-place evidence | encrypted learned-place registry/runtime + conservative named-place fusion | final 5B instrumentation + device |
| EVD-006 network/cellular transitions | Phase 4 Atlas/network/cell transitions feed environmental hypotheses | device behavior |
| EVD-007 authorised witnesses | private Witness runtime with rotating IDs/authorisation/freshness rules | real multi-device BLE verify |
| EVD-008 Wi-Fi RTT | Phase 4 RTT + conservative Atlas/range integration | target hardware capability verify |
| EVD-009 position or area | `FusionResult` shape + uncertainty | Phase 7 UI rendering |
| EVD-010 official state | PRECISE/ASSISTED retained from trusted Android fixes; degraded fusion bounded to honest lower states | final 5B instrumentation + device |
| EVD-011 uncertainty shape | `FusionShapeKind` | Phase 7 display |
| EVD-012 evidence used + age | `FusionEvidenceUse` | Phase 7 explanation UI |
| EVD-013 conflicts | `FusionConflict`; conflicts expand/retain uncertainty | final 5B instrumentation |
| EVD-014 weak evidence cannot create precision | fusion state/strength floors + adversarial tests | final 5B instrumentation |
| FB-004 hierarchy retained | central fusion with conservative fail-safe path | device |
| FB-005 multiple evidence sources together | central independence-aware fusion | final 5B instrumentation |
| DR-003 unsupported prediction becomes area/unknown | Phase 3 expiry/growing uncertainty + Phase 5 state floors | long-outage device test |
| ROUTE-001 plausible corridor | Phase 3 route candidates + Phase 5 radio-route metadata rerank | real route verify / Phase 7 render |
| ROUTE-002 no hidden road snap | reranking cannot move numerical position truth | final 5B instrumentation |
| ANCH-003 BLE RSSI never exact range | Witness/Ground and Atlas retain proximity/area semantics | real BLE verify |
| NET-002 network context not exact coordinate | weak environmental evidence only | final 5B instrumentation |
| IP-001 coarse IP last resort | short-lived `Phase5CoarseNetworkRuntime`; 50 km-class COARSE floor; excluded when better current evidence exists | final 5B instrumentation + live Cloudflare context |
| IP-002 IP never building precision | weak 0.12 weight / COARSE upper state / 50 km device floor | final 5B instrumentation |
| WIT-001 rotating child BLE ID | rotating privacy-preserving Witness advertisement | real BLE verify |
| WIT-002 authorised witness detection/report | paired/authorised Witness report path | real multi-device verify |
| WIT-003 witness uncertainty composition | witness position uncertainty + conservative proximity allowance | final hosted tests + real BLE |
| WIT-004 RSSI proximity only | no RSSI-to-exact-metres claim | real BLE verify |
| WIT-005 no permanent public BLE ID | rotating alias design | real BLE/privacy verify |
| WIT-006 cryptographic rotating resolution | keyed alias derivation/slot rotation | final hosted tests |
| WIT-007 only paired/authorised witness useful | authorisation/revocation checks | final hosted tests + live integration |
| WIT-008 no public crowdsourced network | private relationship-only architecture | rule |
| WIT-009 bounded raw BLE-ID retention | bounded Witness evidence/semantic storage | live retention verify |
| GROUND-001 authorised fixed receiver | signed Ground receiver sighting route | live receiver integration |
| GROUND-002 one receiver = verified area | receiver site radius + conservative BLE allowance; no exact range | final hosted tests + real receiver |
| GROUND-003 multiple receivers narrow conservatively | independent receiver-area constraints | multi-receiver integration |
| GROUND-004 AoA only with calibrated hardware | AoA disabled absent specialised calibrated evidence | rule/device capability |
| GROUND-005 rotating child ID protocol | shares private rotating child-ID model | real receiver/BLE verify |
| PLACE-001 named learned places | `LearnedPlaceRegistry`/runtime/store + owner binding | final instrumentation + real place learning |
| PLACE-002 composite place signature | Atlas environmental signals map conservatively to configured learned-place areas | device |
| PLACE-003 no ordinary Location-OFF Wi-Fi trick | preserved; Phase 6 owns privileged experiment | Phase 6 device experiment |
| PLACE-004 strong place match may ANCHORED, not room | named learned-place semantic replacement uses conservative area | final instrumentation |
| PLACE-005 decay/relearn | inherited Phase 4 trust/replacement behavior | device replacement tests |
| PF-004 corridor/possible-area | fusion shape model | Phase 7 display |
| PF-005 growing uncertainty | Phase 3/last-known growth + conflict expansion | long-outage device test |
| PF-006 no fake probabilities | internal weights only; public qualitative confidence | rule |
| RADIO-001 route radio patterns | current Atlas context reranks only existing Phase 3 route IDs | final instrumentation + real route |
| RADIO-003 radio patterns not exact | rerank is metadata-only; position/uncertainty unchanged by matcher itself | final instrumentation |
| RADIO-004 mainly reweight/eliminate routes | `Phase5RadioRouteMatcher` | final instrumentation |
| RTT-001 opportunistic RTT | Phase 4 provider | target capability verify |
| RTT-003 RTT feeds fusion | RTT measurement may rerank existing Atlas/range hypotheses; no direction invention | final instrumentation + target capability |
| RTT-004 unsupported cleanly | provider/capability status | target capability verify |
| DEG-004 possible-area output | `POSSIBLE_AREA` | Phase 7 display |
| DEG-006 witness area | `WITNESS_AREA` runtime path | real witness verify |
| DEG-007 expanding last-known | age-growing last-known uncertainty | device |
| FUS-001 one persistent fusion path | `PositionEngine` invokes Phase 5 before conservative legacy fail-safe | final instrumentation + device |
| FUS-002 motion likelihood | Phase 3 constraint | final instrumentation |
| FUS-003 map likelihood | route-constrained particle estimate + route IDs | final instrumentation + device |
| FUS-004 magnetic likelihood | inherited inside Phase 3 particle/path estimate | device |
| FUS-005 landmark likelihood | inherited inside Phase 3 particle/path estimate | device |
| FUS-006 place-signature likelihood | Atlas/learned-place constraint | final instrumentation |
| FUS-008 witness/receiver likelihood | Witness/Ground constraints | final hosted + real integration |
| FUS-009 historical route weak prior | historical/current route evidence only reranks already-plausible routes; history alone cannot become truth | final instrumentation |
| FUS-010 strength hierarchy | `FusionStrength` + state floors | final instrumentation |
| FUS-012 receiver collapses only to validated area | authoritative receiver area floor | live receiver verify |
| SMOOTH-001 backward smoothing | `phase5-smoothing.ts` + durable hypothesis frames + endpoint-triggered processing | Cloud test PASS / live integration later |
| SMOOTH-002 endpoint reranking | precise endpoints before/after degraded frames rerank stored alternatives | Cloud test PASS / live integration later |
| SMOOTH-003 never rewrite raw | hypothesis/refined namespaces are separate; raw evidence/history untouched | Cloud test PASS / live storage verify |
| SMOOTH-004 refined history separate | `history/refined/...`, deterministic run ID, model version, D1 interval index | Cloud test PASS / Phase 7 history presentation |
| ATL-FUS-001 Atlas feeds central engine | read-only `Phase4AtlasRuntime.snapshot()` | final instrumentation + device |
| RANGE-001 authenticated range abstraction | annulus/likelihood model; source uncertainty included | final instrumentation |
| RANGE-002 range does not invent direction | symmetric distance likelihood; direction absent unless separately authenticated/supported | final instrumentation |
| RANGE-003 future ranging capability honesty | UWB/Bluetooth Channel Sounding/Wi-Fi NAN RTT abstraction with runtime `UNSUPPORTED` path | target capability verify |

## Deliberate Phase 4 partials carried honestly

These are not bugs to "fix" by adding wasteful or unsupported behavior:

- LAN discovery is the useful authorised Android NSD subset; Brick does not broadly probe raw SSDP/UPnP/NAS services without a justified permission/power/privacy case.
- Network transport/validated/captive/IPv4/IPv6/privacy-reduced DNS/loss-recovery transitions are implemented passively. Brick does not run constant pings merely to fabricate a latency/packet-loss metric.
- No specific stairs/lift/corridor/floor truth is claimed without validated target-device ground truth.
- No time-of-day-only schedule is allowed to become location truth.

## Current automated proof

Run `41295112045` on the exact pair above:
- cumulative Phase 2-5 Cloud regressions: **PASS**;
- Android exact checkout + dependency lock + app build + instrumentation APK build + lint + cumulative source guards: **PASS**;
- cumulative Android instrumentation: **IN PROGRESS at this matrix revision**.

A prior real Android run executed 117 tests: 113 passed and four failures were repaired without weakening uncertainty/trust semantics. Only the final exact-pair run may close the hosted gate.

## Acceptance truth

Phase 5 remains **NOT ACCEPTED** until the final 5B instrumentation passes and applicable dependency, real OPPO/ColorOS, radio/multi-device and controlled deployed-cloud gates are verified. Phase 7 owns final rich area/history/explanation rendering.
