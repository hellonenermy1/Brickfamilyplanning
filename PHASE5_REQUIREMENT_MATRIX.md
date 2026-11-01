# Brick V1 Phase 5 Requirement Matrix

Date: 2026-11-01
Current staging pair at matrix creation:
- Android `v1-p5-unified-fusion-android`: `5f5c8bab9187348ce6ad3cf1d701f337098098b8`
- Cloud `v1-p5-unified-fusion-cloud`: `66bcca5902cc32ed61b610156f895db4fc5b62b0`
- Phase 5 CI run: `41272444067`

Status vocabulary: `IMPLEMENTED SOURCE`, `PARTIAL`, `NOT STARTED`, `CI IN PROGRESS`, `DEVICE VERIFY`, `RULE`, `P7 UI`.

| Requirement | Current Phase 5 evidence | State / remaining gate |
|---|---|---|
| EVD-001 parallel degraded evidence | `ParallelEvidenceEngine`; Phase 3 + Atlas + BLE anchor + last-known adapter | IMPLEMENTED SOURCE / CI IN PROGRESS; more providers pending |
| EVD-002 last trusted position | `Phase5LastKnownInput` + age-growing uncertainty | IMPLEMENTED SOURCE |
| EVD-003 motion/steps/heading/activity | Phase 3 fallback constraint + speed/bearing/step carry-through | IMPLEMENTED SOURCE via Phase 3; richer particle-shape handoff pending |
| EVD-004 route/path geometry | Phase 3 route-constrained estimate + route candidate IDs | IMPLEMENTED SOURCE / richer hypothesis API pending |
| EVD-005 known-place evidence | trusted BLE anchor + strong Atlas learned-place classification | PARTIAL; named Home/School/Grandparents/custom place layer pending |
| EVD-006 network/cellular transitions | Phase 4 Atlas may include them inside environmental candidate | PARTIAL; direct transition/route constraint interface pending |
| EVD-007 authorised witnesses | provider IDs/schema foundations only | NOT STARTED runtime |
| EVD-008 Wi-Fi RTT | Phase 4 RTT participates in Atlas; no direct range constraint in Phase 5 yet | PARTIAL |
| EVD-009 position or area | `FusionResult` + shape/uncertainty; current wire still point+radius | IMPLEMENTED SOURCE core / richer area transport P7 pending |
| EVD-010 official state | fusion emits ANCHORED/ESTIMATED/COARSE/LAST_KNOWN/UNKNOWN; fused path retains PRECISE/ASSISTED | IMPLEMENTED SOURCE |
| EVD-011 uncertainty shape | `FusionShapeKind` | IMPLEMENTED SOURCE core / P7 rendering pending |
| EVD-012 evidence used + age | `FusionEvidenceUse` | IMPLEMENTED SOURCE core / P7 explanation pending |
| EVD-013 evidence conflicts | `FusionConflict` | IMPLEMENTED SOURCE core / P7 explanation pending |
| EVD-014 weak evidence cannot create precision | constructor/state guards + tests | IMPLEMENTED SOURCE / CI IN PROGRESS |
| FB-004 hierarchy retained | central fusion + conservative pre-Phase-5 fallback retained underneath | IMPLEMENTED SOURCE transitional design |
| FB-005 multiple evidence sources together | central fusion | IMPLEMENTED SOURCE / CI IN PROGRESS |
| DR-003 unsupported prediction becomes area/unknown | Phase 3 expiry + fusion area/UNKNOWN | PARTIAL; long-outage integration test pending |
| ROUTE-001 plausible corridor | Phase 3 route candidates feed Phase 5 | IMPLEMENTED SOURCE / P7 geometry pending |
| ROUTE-002 no hidden road snap | fusion preserves corridor/possible-area shape | IMPLEMENTED SOURCE core |
| ANCH-003 BLE RSSI never exact range | existing rule retained | RULE / Witness/Ground implementation must preserve |
| NET-002 network context not exact coordinate | Phase 4 weak environmental evidence only | RULE / direct Phase 5 transition tests pending |
| IP-001 coarse IP last resort | not yet represented as direct Phase 5 constraint | NOT STARTED |
| IP-002 IP never building precision | contract guard | RULE |
| WIT-001 rotating child BLE ID | none yet | NOT STARTED |
| WIT-002 authorised witness detection/report | Phase 2 provider/schema foundation only | NOT STARTED |
| WIT-003 witness uncertainty composition | fusion supports witness-area constraint type; report model pending | PARTIAL |
| WIT-004 RSSI proximity only | fusion model never accepts RSSI as exact distance | RULE; implementation pending |
| WIT-005 no permanent public BLE ID | contract frozen | RULE / implementation pending |
| WIT-006 cryptographic rotating resolution | none yet | NOT STARTED |
| WIT-007 only paired/authorised witness useful | D1 `witness_authorizations` foundation | PARTIAL; route/auth enforcement pending |
| WIT-008 no public crowdsourced network | architecture rule | RULE |
| WIT-009 bounded raw BLE-ID retention | no Witness runtime yet | NOT STARTED |
| GROUND-001 authorised fixed receiver | D1 `ground_receivers` foundation | PARTIAL; authenticated sighting route pending |
| GROUND-002 one receiver = place/zone area | fusion supports `GROUND_RECEIVER` receiver-area shape | PARTIAL; ingestion/verification pending |
| GROUND-003 multiple receivers conservatively narrow zone | fusion can combine independent receiver constraints | PARTIAL; receiver grouping/adversarial tests pending |
| GROUND-004 AoA only calibrated specialised hardware | no AoA source added | RULE satisfied so far |
| GROUND-005 rotating child ID protocol | same Witness protocol not implemented yet | NOT STARTED |
| PLACE-001 named learned places | Atlas labels exist but no conservative named-place model | NOT STARTED Phase 5 layer |
| PLACE-002 composite place signature | Phase 4 Atlas carries many signals | PARTIAL; named-place aggregation/validation pending |
| PLACE-003 no ordinary Location-OFF Wi-Fi trick | preserved | RULE |
| PLACE-004 strong place match may ANCHORED, not room | strong Atlas mapping can ANCHORED area | IMPLEMENTED SOURCE core; named-place layer/P7 pending |
| PLACE-005 decay/relearn | Phase 4 replacement/relearning | IMPLEMENTED upstream / device verify pending |
| PF-004 corridor/possible-area representation | `FusionShapeKind.CORRIDOR/POSSIBLE_AREA` | IMPLEMENTED SOURCE core / P7 pending |
| PF-005 growing uncertainty | Phase 3 + last-known growth; fusion conflict expansion | IMPLEMENTED/PARTIAL; long-outage test pending |
| PF-006 no fake probabilities | `supportWeight` explicitly internal; qualitative band | IMPLEMENTED SOURCE rule |
| RADIO-001 route radio patterns | Phase 4 gradients/transitions exist | PARTIAL |
| RADIO-003 radio patterns not exact | Atlas lower-bound/independence rules + fusion guards | IMPLEMENTED SOURCE rule |
| RADIO-004 mainly reweight/eliminate routes | not yet direct route-likelihood adapter | NOT STARTED |
| RTT-001 opportunistic RTT | Phase 4 provider exists | IMPLEMENTED upstream / DEVICE VERIFY |
| RTT-003 RTT feeds fusion | only indirectly through Atlas currently | PARTIAL; direct range constraint pending |
| RTT-004 unsupported cleanly | Phase 4 provider status model | IMPLEMENTED upstream / DEVICE VERIFY |
| DEG-004 possible-area output | `FusionShapeKind.POSSIBLE_AREA` | IMPLEMENTED SOURCE / P7 render pending |
| DEG-006 witness area | `FusionShapeKind.WITNESS_AREA` | PARTIAL; witness runtime pending |
| DEG-007 expanding last-known | age-growing last-known uncertainty | IMPLEMENTED SOURCE core / P7 pending |
| FUS-001 one persistent hypothesis/fusion path | `PositionEngine` now invokes central Phase 5 selection before legacy fail-safe | IMPLEMENTED SOURCE transitional; more inputs pending |
| FUS-002 motion likelihood | Phase 3 constraint weight | IMPLEMENTED SOURCE coarse adapter |
| FUS-003 map likelihood | Phase 3 route-constrained estimate | PARTIAL; particle/hypothesis shape API pending |
| FUS-004 magnetic likelihood | inside Phase 3 estimate, not separately auditable in Phase 5 | PARTIAL |
| FUS-005 landmark likelihood | inside Phase 3 estimate, not separately auditable in Phase 5 | PARTIAL |
| FUS-006 place-signature likelihood | Atlas constraint | IMPLEMENTED SOURCE core / named places pending |
| FUS-008 witness/receiver likelihood | constraint kinds exist only | PARTIAL |
| FUS-009 historical route weak prior | no direct Phase 5 historical-route input yet | NOT STARTED |
| FUS-010 strong/medium/weak hierarchy | `FusionStrength` + support weight, no public percentage | IMPLEMENTED SOURCE / CI IN PROGRESS |
| FUS-012 trusted receiver collapses only to validated area | `AUTHORITATIVE_AREA` honesty floor | PARTIAL; receiver auth/site validation pending |
| SMOOTH-001 backward smoothing | D1 metadata foundation only | NOT STARTED algorithm |
| SMOOTH-002 endpoint reranking | none yet | NOT STARTED |
| SMOOTH-003 never rewrite raw | frozen architecture + separate schema | RULE; tests pending |
| SMOOTH-004 refined history separate | `refined_history_runs` D1 foundation | PARTIAL; storage/algorithm pending |
| ATL-FUS-001 Atlas feeds central engine | read-only `Phase4AtlasRuntime.snapshot()` + adapter | IMPLEMENTED SOURCE / CI IN PROGRESS |

## Current Phase 5 source checkpoint

The initial Phase 5 source correctly establishes a single conservative fusion boundary without deleting the pre-existing fallback path. It is intentionally incomplete. No Witness/Ground runtime, named-place layer, direct RTT constraint, future-ranging adapter or smoothing algorithm is claimed complete by this matrix.

## Acceptance blockers

- final Phase 5 exact-pair CI for each frozen candidate;
- Phase 2/3/4 formal dependency closure;
- physical OPPO/ColorOS verification where required;
- Witness/Ground security/replay/privacy tests;
- learned-place/radio-route/adversarial fusion tests;
- backward-smoothing immutability proof;
- later Phase 7 UI/history rendering for area/explanation features.
