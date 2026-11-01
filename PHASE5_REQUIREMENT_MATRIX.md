# Brick V1 Phase 5 Requirement Matrix

Date: 2026-11-01
Status: **SOURCE + HOSTED AUTOMATED CLOSURE PASS / DEVICE + DEPLOYED INTEGRATION PENDING / NOT ACCEPTED**

Final Phase 5B closure candidate:
- Android `v1-p5b-closure-android`: `a09a273bf19e37e70d37077e3ac0ede6a69b2332`
- Cloud `v1-p5b-closure-cloud`: `507b17c262e9eb2c135b79b7b5cdf6ffc317b634`
- Draft PRs #14 and #15
- Exact-pair CI run `41295112045`

This matrix supersedes the old initial-Phase-5 matrix. Source/hosted PASS does not mean `DEVICE VERIFIED` or `ACCEPTED`.

| Requirement | Current source / automated evidence | Remaining gate |
|---|---|---|
| EVD-001 parallel degraded evidence | `ParallelEvidenceEngine` + central `Phase5PositionFusion`; final instrumentation PASS | real-device fusion behavior |
| EVD-002 last trusted position | aged `Phase5LastKnownInput` with growing uncertainty; PASS | long-outage device behavior |
| EVD-003 motion/steps/heading/activity | Phase 3 particle/motion estimate feeds Phase 5; PASS | physical sensors/motion |
| EVD-004 route/path geometry | route candidate IDs + corridor metadata + radio-route reranking; PASS | real route behavior |
| EVD-005 known-place evidence | encrypted learned-place registry/runtime + conservative named-place fusion; PASS | real place learning |
| EVD-006 network/cellular transitions | Phase 4 Atlas/network/cell transitions feed environmental hypotheses | device behavior |
| EVD-007 authorised witnesses | private Witness runtime with rotating IDs/authorisation/freshness rules; hosted tests PASS | real multi-device BLE |
| EVD-008 Wi-Fi RTT | Phase 4 RTT + conservative Atlas/range integration; hosted tests PASS | target hardware capability |
| EVD-009 position or area | `FusionResult` shape + uncertainty; PASS | Phase 7 UI rendering |
| EVD-010 official state | degraded fusion bounded to honest lower states; PASS | real degraded transitions |
| EVD-011 uncertainty shape | `FusionShapeKind`; PASS | Phase 7 display |
| EVD-012 evidence used + age | `FusionEvidenceUse`; PASS | Phase 7 explanation UI |
| EVD-013 conflicts | conflicts expand/retain uncertainty; PASS | real conflict scenarios |
| EVD-014 weak evidence cannot create precision | state/strength floors + adversarial tests PASS | device confirmation |
| FB-004 hierarchy retained | central fusion + conservative fail-safe; PASS | device |
| FB-005 multiple evidence sources together | independence-aware fusion; PASS | real mixed evidence |
| DR-003 unsupported prediction becomes area/unknown | Phase 3 expiry/growing uncertainty + Phase 5 state floors; PASS | long-outage device test |
| ROUTE-001 plausible corridor | Phase 3 candidates + Phase 5 environmental rerank; PASS | real route / Phase 7 render |
| ROUTE-002 no hidden road snap | reranking cannot move numerical position truth; PASS | device |
| ANCH-003 BLE RSSI never exact range | Witness/Ground/Atlas retain proximity-area semantics; PASS | real BLE |
| NET-002 network context not exact coordinate | weak environmental evidence only; PASS | device |
| IP-001 coarse IP last resort | short-lived 50 km-class COARSE area excluded when better current evidence exists; PASS | live Cloudflare integration |
| IP-002 IP never building precision | 0.12 weak weight, COARSE cap, 50 km device floor; PASS | live integration |
| WIT-001 rotating child BLE ID | rotating privacy-preserving Witness advertisement; PASS | real BLE |
| WIT-002 authorised witness detection/report | paired/authorised report path; hosted PASS | real multi-device |
| WIT-003 witness uncertainty composition | witness uncertainty + conservative proximity allowance; hosted PASS | real BLE |
| WIT-004 RSSI proximity only | no RSSI-to-exact-metres claim; PASS | real BLE |
| WIT-005 no permanent public BLE ID | rotating alias design; PASS | real BLE/privacy |
| WIT-006 cryptographic rotating resolution | keyed alias derivation/slot rotation; PASS | none hosted |
| WIT-007 only paired/authorised witness useful | authorisation/revocation checks; PASS | live integration |
| WIT-008 no public crowdsourced network | private relationship-only architecture | rule |
| WIT-009 bounded raw BLE-ID retention | bounded Witness evidence/semantic storage | live retention |
| GROUND-001 authorised fixed receiver | signed Ground receiver sighting route; hosted PASS | live receiver integration |
| GROUND-002 one receiver = verified area | receiver site radius + conservative BLE allowance; PASS | real receiver |
| GROUND-003 multiple receivers narrow conservatively | independent receiver-area constraints; PASS | multi-receiver integration |
| GROUND-004 AoA only with calibrated hardware | disabled absent specialised calibrated evidence | device capability |
| GROUND-005 rotating child ID protocol | same private rotating child-ID model; PASS | real receiver/BLE |
| PLACE-001 named learned places | owner-bound encrypted registry/runtime/store; PASS | real place learning |
| PLACE-002 composite place signature | Atlas environmental signals map conservatively to configured learned-place areas; PASS | device |
| PLACE-003 no ordinary Location-OFF Wi-Fi trick | preserved; Phase 6 owns privileged experiment | Phase 6 device experiment |
| PLACE-004 strong place match may ANCHORED, not room | conservative named-place semantic replacement; PASS | device |
| PLACE-005 decay/relearn | inherited Phase 4 trust/replacement behavior | device replacement tests |
| PF-004 corridor/possible-area | fusion shape model; PASS | Phase 7 display |
| PF-005 growing uncertainty | Phase 3/last-known growth + conflict expansion; PASS | long-outage device test |
| PF-006 no fake probabilities | internal weights only; qualitative public confidence | rule |
| RADIO-001 route radio patterns | current Atlas context reranks only existing Phase 3 route IDs; PASS | real route |
| RADIO-003 radio patterns not exact | metadata-only rerank; numerical position/uncertainty unchanged; PASS | device |
| RADIO-004 mainly reweight/eliminate routes | `Phase5RadioRouteMatcher`; PASS | device |
| RTT-001 opportunistic RTT | Phase 4 provider | target capability |
| RTT-003 RTT feeds fusion | RTT reranks existing hypotheses without inventing direction; PASS | target capability |
| RTT-004 unsupported cleanly | capability status handling; PASS | target capability |
| DEG-004 possible-area output | `POSSIBLE_AREA`; PASS | Phase 7 display |
| DEG-006 witness area | `WITNESS_AREA`; hosted PASS | real witness |
| DEG-007 expanding last-known | age-growing uncertainty; PASS | device |
| FUS-001 one persistent fusion path | `PositionEngine` invokes Phase 5 before conservative legacy fail-safe; PASS | device |
| FUS-002 motion likelihood | Phase 3 constraint; PASS | device |
| FUS-003 map likelihood | route-constrained particle estimate + route IDs; PASS | device |
| FUS-004 magnetic likelihood | inherited inside Phase 3 particle/path estimate; PASS | device |
| FUS-005 landmark likelihood | inherited inside Phase 3 particle/path estimate; PASS | device |
| FUS-006 place-signature likelihood | Atlas/learned-place constraint; PASS | device |
| FUS-008 witness/receiver likelihood | Witness/Ground constraints; hosted PASS | real integration |
| FUS-009 historical route weak prior | history/current environment rerank only already-plausible routes; PASS | real route |
| FUS-010 strength hierarchy | `FusionStrength` + state floors; PASS | device |
| FUS-012 receiver collapses only to validated area | authoritative receiver area floor; PASS | live receiver |
| SMOOTH-001 backward smoothing | durable hypothesis frames + endpoint-triggered processing; Cloud PASS | deployed integration |
| SMOOTH-002 endpoint reranking | precise endpoints before/after degraded frames rerank stored alternatives; Cloud PASS | deployed integration |
| SMOOTH-003 never rewrite raw | hypothesis/refined namespaces separate; raw/realtime untouched; Cloud PASS | live storage verify |
| SMOOTH-004 refined history separate | `history/refined/...`, deterministic run/model identity, D1 index; Cloud PASS | Phase 7 presentation + deployed integration |
| ATL-FUS-001 Atlas feeds central engine | read-only `Phase4AtlasRuntime.snapshot()`; PASS | device |
| RANGE-001 authenticated range abstraction | annulus/likelihood model includes source uncertainty; PASS | target capability |
| RANGE-002 range does not invent direction | symmetric distance likelihood; direction requires separate authenticated support; PASS | target capability |
| RANGE-003 future ranging capability honesty | runtime supported/permission/temp/failed/unsupported model; PASS | target capability |

## Deliberate Phase 4 partials carried honestly

These are not bugs to "fix" by adding wasteful or unsupported behavior:

- LAN discovery is the useful authorised Android NSD subset; no broad SSDP/UPnP/NAS probing without a justified permission/power/privacy case.
- Network transport/validated/captive/IPv4/IPv6/privacy-reduced DNS/loss-recovery transitions are passive. Brick does not run constant pings merely to fabricate latency/packet-loss metrics.
- No specific stairs/lift/corridor/floor truth without validated target-device ground truth.
- No time-of-day-only schedule is allowed to become location truth.

## Final automated proof

Run `41295112045` on the exact pair above:
- cumulative Phase 2-5 Cloud regressions: **PASS**;
- Android exact checkout + dependency lock + app build + instrumentation APK build + lint + cumulative source guards: **PASS**;
- cumulative Android instrumentation: **PASS — 123/123 tests**;
- final Gradle result: **BUILD SUCCESSFUL**.

A prior 117-test run exposed four failures; all were repaired without weakening uncertainty/trust semantics and are green in the final 123-test run.

## Acceptance truth

Phase 5 assistant-side source + hosted automated closure is complete. Phase 5 remains **NOT FORMALLY ACCEPTED** until applicable dependency, real OPPO/ColorOS, real-radio/multi-device and controlled deployed-cloud/integration gates are verified. Phase 7 still owns final rich area/history/explanation rendering.
