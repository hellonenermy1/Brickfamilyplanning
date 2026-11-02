# Brick V1 Phase 7 — Cloud Intelligence, History & Trustworthy UX

Phase 7 converts the qualified Phase 2–6 tracking, evidence, reliability and safety systems into one stable parent-facing contract and an honest dashboard. It does not replace the positioning algorithms.

## Frozen starting points

- Cloud / Parent Phase 6C base: `1a4e9c6c19ba372b49a500e0b227dbefe7bdac73`
- Android / OPPO Phase 6C base: `0c2c7e58279fd0faeca7f3e4dcf461111bdbb33b`
- Phase 7 cloud branch: `v1-p7-cloud-ux`
- Phase 7 Android branch: `v1-p7-android-ux`
- Phase 7 cloud PR: #23
- Phase 7 Android PR: #24
- Development remains card-free: no mandatory R2, Queue, Access/Zero Trust or Cron binding.
- Production worker/config/deployment remain frozen until Phase 7 acceptance.

## Current qualification checkpoints

### Cloud / parent

The combined Phase 7 code was fully qualified before deployment on branch head `b3d575afc426d5b2c3c03e81eea1a5784d651989`. Cloud CI run `41404946036` passed all permanent gates.

The exact combined development runtime was then deployed from source commit `53c040c0cb14047cd9200edadd3c9f67b4ab25b5`. One-shot deployment/live-verification run `41405075601` passed:

- exact Phase 6C ancestry preflight
- locked dependencies
- TypeScript/build gates
- Phase 7 position, health, live-sync and actual V6 safety runtime fixtures
- retained Phase 2–6 cloud regression and privacy gates
- dependency audit
- card-free development resource/config verification
- exact development Worker deployment
- authenticated Phase 7 parent HTML
- live class/geometry semantic validation
- live state + health presentation headers/contracts
- live trusted/refined history contract
- live requested/actual/acknowledged Location contract
- live WebSocket upgrade
- unauthenticated parent boundary
- forged internal-auth-header boundary

The temporary deployment workflow was removed immediately after proof. Production was not deployed or modified.

Permanent Phase 7 cloud CI includes:

- retained qualified Phase 6C base ancestry
- parent asset build + TypeScript checks
- honest position-presentation fixtures
- Device Health / Position Health / provider-status fixtures
- WebSocket/REST source-fix synchronization fixtures
- unknown/future quality fail-safe fixtures
- missing-coordinate fail-safe fixtures
- actual runtime `location-ingest-v6 -> evaluateSafetyBatchV6` safety fixture
- degraded-position dwell reset
- time-based trip-overdue independence from GPS quality
- retained Phase 2–6 cloud regression/privacy gates
- rendered actual served Phase 7 parent + JavaScript syntax check
- Today / Yesterday / 7 / 30 / custom history controls
- 0.5x / 1x / 2x / 5x / 10x playback
- summary metrics and refined-history overlay contract
- responsive desktop/mobile CSS contract
- map-failure isolation and revoke UI retention
- card-free development isolation
- production worker/config isolation
- absence of temporary Phase 7 deploy workflows
- dependency audit

### Android

Android qualification run `41397097200` passed on Phase 7 Android head `f0c18e373d83c9a192ab55abd6dbc22d8932413c`.

Both Android jobs passed:

- build / unit tests / lint / R8
- minimal child UI contract
- Device Owner receiver + managed-policy path
- provider capability/health fields
- diagnostics privacy/retention contract
- full retained Phase 2–6C emulator instrumentation

This qualifies Android integration in CI. It does not replace real OPPO behavior testing.

## Phase 7 trust rules

1. Never make stale evidence look fresh because a server computation just ran.
2. Never convert degraded/estimated evidence into a precise-looking point without supporting evidence.
3. A quality label without a trustworthy coordinate is `UNKNOWN / NONE`, never `Precise position` with no point.
4. Unknown/future quality tokens fail safe to no exact current point.
5. An unknown-quality refinement cannot replace base coordinates while borrowing the base quality label.
6. Raw/trusted history is immutable evidence. Refined history is a separate presentation layer.
7. Device Health and Position Health are separate concepts.
8. Unsupported evidence providers are neutral, not whole-device failures.
9. Requested Location state and phone-observed Location state remain separate until the exact current command is acknowledged.
10. Coordinate-dependent safety transitions require PRECISE / ASSISTED / ANCHORED evidence with <=250 m uncertainty.
11. ESTIMATED / COARSE / LAST_KNOWN / UNKNOWN cannot manufacture geofence, arrival or prolonged-stop transitions from their displayed centre.
12. Any degraded/unqualified positioning interval breaks pending geofence, arrival and prolonged-stop dwell. Later qualified evidence must start dwell again.
13. Purely time-based trip overdue remains active with degraded positioning and omits guessed coordinates/distance.
14. Phase 7 must preserve Phase 2–6 security, privacy, safety and reliability behavior.
15. Child UI remains deliberately minimal; development diagnostics stay separate.

## Work packets

| Packet | Scope | Status |
|---|---|---|
| P7.0 | Requirement matrix + stable parent read model | CLOUD CONTRACT PASS |
| P7.1 | Position Presentation Engine + honest geometry | CLOUD CI + LIVE API PASS; REAL BROWSER INTERACTION PENDING |
| P7.2 | Human-readable evidence/conflict explanation | CLOUD CI PASS; REAL BROWSER/OPPO EVIDENCE PENDING |
| P7.3 | Trusted/refined history integration and playback | LIVE HISTORY CONTRACT PASS; REAL PLAYBACK/REFINED VISUAL PROOF PENDING |
| P7.4 | Device / position / provider health + Location control UX | LIVE CONTRACT PASS; REAL PHONE COMMAND/UI ACK SMOKE PENDING |
| P7.5 | Trips, Places and minimal child UX revalidation | ACTUAL V6 SAFETY RUNTIME + ANDROID CI PASS; REAL OPPO SAFETY SMOKE PENDING |
| P7.6 | Full Phase 7 qualification | CLOUD + ANDROID CI + LIVE API PASS; REAL BROWSER + OPPO ACCEPTANCE PENDING |

## Current implementation

### Stable parent position presentation

`src/phase7-parent-presentation.ts`, hardened by the served `src/phase7-state-v2.ts` boundary, provides:

- position class: precise / assisted / anchored / estimated / coarse / last_known / unknown
- geometry: CIRCLE / CORRIDOR / AREA / ANCHORED_AREA / LAST_KNOWN_AREA / NONE
- qualitative confidence: high / medium / low / very_low
- evidence freshness derived from observation/evidence age, not server recomputation time
- explicit source-fix basis: epoch / sequence / received time / wall time
- display source
- conservative explanation
- contributing evidence list
- conflict list
- offline/historical marker

The V2 boundary additionally guarantees:

- unknown/future quality -> no exact current geometry
- missing trustworthy coordinate -> `unknown / NONE`
- unknown-quality external refinement cannot replace the base location
- Health presentation is recomputed after conservative normalization

### WebSocket / REST synchronization

The source-fix basis prevents a REST refinement for an older point from being silently attached to a newer WebSocket fix. If the live fix advances first, the parent temporarily presents only the newer phone state and requests a fresh normalized server state.

A newer WebSocket health heartbeat also invalidates an older normalized Health presentation until a fresh state response arrives.

The temporary browser fallback is conservative:

- PRECISE / ASSISTED -> CIRCLE
- ESTIMATED with route evidence -> CORRIDOR
- ANCHORED -> ANCHORED_AREA
- ESTIMATED / COARSE -> AREA
- LAST_KNOWN -> LAST_KNOWN_AREA
- unknown/unrecognized -> NONE
- no coordinate -> `unknown / NONE` regardless of stale quality label

### Honest map geometry

`src/parent-v7.ts` owns Phase 7 live geometry after the retained Phase 6 renderer:

- precise/assisted point + uncertainty circle only when supported
- estimated route shown as corridor rather than exact marker
- anchored/coarse/refined shown as areas
- last-known shown as historical area
- unknown has no current position marker
- old Phase 6 accuracy/corridor sources are cleared first
- map failure leaves controls and device data usable

### Trusted + refined history

Trusted history remains the evidence route. Refined history is a separate optional overlay:

- trusted points are never overwritten
- refined runs are visually separate
- refined frame/run/change counts are reported
- refined-load failure cannot make trusted history unreadable
- Today / Yesterday / 7 / 30 / custom retained
- 0.5x / 1x / 2x / 5x / 10x retained
- distance / duration / average moving / max trusted / modes / stops retained

The card-free development history path remains append-once D1 data exposed through the bounded virtual history layer. No second authoritative history store was introduced.

### Health model

`src/phase7-health-presentation.ts` separates:

- Device Health
- Position Health
- Evidence Providers

Provider normalization covers Wi-Fi environment, Wi-Fi RTT, BLE, cellular context, LAN discovery, GNSS sky, network context, device context and optional privileged fallback. `UNSUPPORTED` is neutral and may be established from capability or explicit provider-health evidence.

### Location control acknowledgement

The parent shows independently:

- requested state
- actual phone-reported state
- current command ID acknowledgement
- age/time of the phone observation

`src/phase6-location-control.ts` only acknowledges the command ID currently stored for the device. A matching old actual state does not confirm a newer command.

### Actual runtime Trips / Places safety boundary

The Phase 7 runtime location path is:

`worker-v10 -> worker-v9 -> worker-v8 -> worker-v7 -> worker-v6/worker-v5b -> location-ingest-v6 -> evaluateSafetyBatchV6`

The actual evaluator is `src/safety-batch-v6.ts`. Phase 7 now enforces there—not only in the retained legacy evaluator:

- only PRECISE / ASSISTED / ANCHORED with <=250 m uncertainty may drive coordinate-dependent safety
- ESTIMATED / COARSE / LAST_KNOWN / UNKNOWN cannot create geofence enter/exit, arrival or prolonged-stop events from their coordinates
- degraded/unqualified packets clear pending geofence candidates while preserving stable inside/outside state and last trustworthy distance
- degraded/unqualified packets clear trip arrival and prolonged-stop dwell while preserving last trustworthy trip distance/location
- geofence/trip ordering watermarks advance across degraded gaps, preventing older delayed trusted packets from resurrecting prior dwell
- the durable safety-evaluation high-water also advances
- first later qualified fix starts dwell again from count 1/time-now
- trip overdue is evaluated from time even when position is unqualified
- degraded overdue events contain no guessed latitude/longitude/accuracy/distance and explicitly mark `positionQualified: false`
- D1 remains the durable safety-event source; realtime broadcast failure does not invalidate a persisted transition

`scripts/check-phase7-safety-quality.mjs` now behaviorally exercises this actual V6 batch path with a fake D1/Durable-Object harness, including an ESTIMATED packet with plausible coordinates, dwell reset, overdue under degraded position, preserved trustworthy trip state, ordering advancement and fresh dwell after recovery.

The older `phase4.ts` safety path remains aligned for retained compatibility, but it is not the Phase 6/7 location-ingest source of truth.

### Android preservation branch

Phase 7 intentionally qualified the existing Android tracking stack rather than rewriting it unnecessarily. CI proves:

- minimal child UX remains intact
- Device Owner receiver and managed policy path remain intact
- provider capability/health fields remain emitted
- diagnostic privacy/retention contract remains intact
- build/unit/lint/R8 pass
- full retained Phase 2–6C emulator instrumentation passes

Real OPPO verification remains mandatory.

## Requirement matrix

| Requirement | P7 state |
|---|---|
| Current trusted location | CLOUD CONTRACT + LIVE API PASS |
| Current refined location | CLOUD CONTRACT + LIVE API CONTRACT PASS |
| Uncertainty | CLOUD CONTRACT + LIVE API PASS |
| Precise/assisted circle | RENDER + LIVE SEMANTIC CONTRACT PASS; REAL BROWSER STATE PENDING |
| Estimated route corridor | RENDER + LIVE SEMANTIC CONTRACT PASS; REAL BROWSER STATE PENDING |
| Anchored region | RENDER + LIVE SEMANTIC CONTRACT PASS; REAL BROWSER STATE PENDING |
| Coarse / possible area | RENDER + LIVE SEMANTIC CONTRACT PASS; REAL BROWSER STATE PENDING |
| Last-known area | RENDER + LIVE SEMANTIC CONTRACT PASS; REAL BROWSER STATE PENDING |
| Unknown/no trustworthy coordinate | FAIL-SAFE FIXTURES + LIVE SEMANTIC CONTRACT PASS; REAL BROWSER STATE PENDING |
| Unknown/future quality | FAIL-SAFE FIXTURES PASS |
| Evidence explanations/conflicts | CLOUD + RENDER CI PASS; REAL BROWSER PENDING |
| Today/Yesterday/7/30/custom history | RETAINED + LIVE CONTRACT PASS; BROWSER INTERACTION PENDING |
| Distance/duration/avg/max/modes/stops | RETAINED + CONTRACT PASS; BROWSER INTERACTION PENDING |
| 0.5x/1x/2x/5x/10x playback | RETAINED + CONTRACT PASS; BROWSER INTERACTION PENDING |
| Refined history separate from trusted | CLOUD + LIVE API CONTRACT PASS; REAL REFINED VISUAL DATA PENDING IF PRODUCED |
| Provider capability/health | CLOUD MODEL + LIVE API PASS; REAL BROWSER/PHONE SMOKE PENDING |
| Device vs Position Health | CLOUD MODEL + LIVE API PASS; REAL BROWSER SMOKE PENDING |
| Measured reliability/no fake manual score | RETAINED + CONTRACT PASS; REAL BROWSER SMOKE PENDING |
| Desired vs actual vs acknowledged Location | LIVE API CONTRACT PASS; REAL COMMAND/UI ACK SMOKE PENDING |
| Degraded geofence/trip safety | ACTUAL V6 RUNTIME BEHAVIOR FIXTURE PASS; REAL OPPO SMOKE PENDING |
| Time-based overdue under degraded position | ACTUAL V6 RUNTIME BEHAVIOR FIXTURE PASS |
| Minimal child UI | ANDROID CI PASS |
| Device Owner path | ANDROID CI PASS; REAL OPPO MANAGED-MODE SMOKE PENDING |
| Retained Android instrumentation | PASS — run `41397097200` |
| Card-free beta isolation | PASS |
| Production isolation | PASS |
| Real OPPO Phase 7 proof | PENDING |

## Real-world acceptance source of truth

Use `docs/phase7-oppo-browser-acceptance.md`. It explicitly covers:

- desktop and mobile browser interaction
- WebSocket/REST cross-fix synchronization
- precise/assisted/degraded/unknown presentation
- requested/actual/acknowledged Location control
- history/playback/refined overlay
- geofence/trip dwell interruption by degraded positioning
- health/provider semantics
- I’M SAFE / SOS online and offline/reconnect regression
- restart/network/reboot recovery
- revocation/read-only-history proof strategy

Rare states that cannot safely or naturally be produced are recorded as `VERIFIED BY FIXTURE / NOT NATURALLY OBSERVED`, never falsely marked as real-device PASS.

## Phase 7 acceptance

Phase 7 may be marked ACCEPTED only after all remaining real-world items pass or are explicitly classified by the acceptance rules:

- precise/assisted and naturally observed degraded presentation
- trusted/refined history browser behavior
- all five playback speeds in-browser
- Device Health vs Position Health UI behavior
- requested vs actual Location acknowledgement on the phone
- Trips/Places real OPPO smoke without degraded-position false transitions
- SOS and I'M SAFE online/offline/reconnect regression
- map failure leaves controls/data usable
- desktop parent layout smoke
- mobile-width/phone-browser layout smoke
- real OPPO integration/recovery smoke

Until those real-world checks are complete, Phase 7 is development beta and must not be called production-ready.
