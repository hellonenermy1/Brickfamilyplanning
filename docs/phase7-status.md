# Brick V1 Phase 7 — Cloud Intelligence, History & Trustworthy UX

Phase 7 converts the already-built Phase 2–6 tracking, evidence, reliability and safety systems into one stable parent-facing contract and an honest dashboard. It does not replace the positioning algorithms.

## Frozen starting points

- Cloud / Parent Phase 6C base: `1a4e9c6c19ba372b49a500e0b227dbefe7bdac73`
- Android / OPPO Phase 6C base: `0c2c7e58279fd0faeca7f3e4dcf461111bdbb33b`
- Phase 7 cloud branch: `v1-p7-cloud-ux`
- Phase 7 Android branch: `v1-p7-android-ux`
- Phase 7 cloud PR: #23
- Phase 7 Android PR: #24
- Development remains card-free: no mandatory R2, Queue, Access/Zero Trust or Cron binding.
- Production worker/config/deployment remain frozen until Phase 7 acceptance.

## Qualification checkpoints

### Cloud / parent

Cloud CI run `41399295630` passed on head `86d888104cc07498d822adf17044cf6840539fd7` after the final safety dwell-gap lock and temporary-deploy cleanup.

Passed gates include:

- retained qualified Phase 6C base ancestry
- locked dependency install
- parent asset build + TypeScript checks
- Phase 7 position-presentation fixtures
- separate Device Health / Position Health / provider-status fixtures
- live WebSocket/REST synchronization fixtures
- trusted-position-only geofence/arrival/stop fixtures
- degraded-position gap resets coordinate-dependent dwell candidates
- time-based trip-overdue independence from GPS quality
- retained Phase 2–6 cloud regression and privacy gates
- rendered actual served Phase 7 parent contract + JavaScript syntax check
- honest geometry/refined-history/health/Location-control UI contract
- Today / Yesterday / 7 / 30 / custom history controls
- all five playback speeds and retained summary metrics
- responsive desktop/mobile CSS contract
- map-failure isolation and revoke UI retention
- card-free development isolation
- production worker/config isolation
- absence of temporary Phase 7 deploy workflows
- dependency audit

The exact final patched runtime was deployed to `brick-family-v1-dev` from SHA `279e26e589dc687a336e2a45ec5de8f8385ea97d`. Deployment/live-verification run `41399072204` passed pre-deploy qualification, card-free resource checks, deployment, authenticated live Phase 7 contract verification, and unauthenticated-boundary verification. Later branch commits are CI/docs cleanup and do not change the deployed Worker runtime.

### Android

Android qualification run `41397097200` passed on Phase 7 Android head `f0c18e373d83c9a192ab55abd6dbc22d8932413c`.

Both jobs passed:

- build / unit tests / lint / R8 / minimal-child-UI / Device Owner / provider-health / diagnostics-privacy contract
- full retained Phase 2–6C emulator instrumentation

This qualifies the Android integration in CI. It does not replace real OPPO behavior testing.

## Phase 7 rules

1. Never make stale evidence look fresh because a server computation just ran.
2. Never convert a degraded/estimated state into a precise-looking point without evidence that supports it.
3. Raw/trusted history remains immutable evidence. Refined history is a separate presentation layer.
4. Device health and position confidence are separate concepts.
5. Unsupported evidence providers are neutral, not failures.
6. Requested Location state and phone-observed Location state remain separate until acknowledgement.
7. Phase 7 must preserve Phase 2–6 security, privacy, safety and reliability behavior.
8. Child UI remains deliberately minimal; development diagnostics stay separate.
9. Coordinate-dependent safety transitions require PRECISE / ASSISTED / ANCHORED evidence with bounded uncertainty.
10. Purely time-based safety alerts must continue when position is degraded and must omit guessed coordinates.
11. Any degraded/unqualified positioning interval breaks pending coordinate-dependent geofence, arrival and prolonged-stop dwell; later trusted evidence must start new dwell rather than inheriting old elapsed time.

## Work packets

| Packet | Scope | Status |
|---|---|---|
| P7.0 | Requirement matrix + stable parent read model | CLOUD CONTRACT PASS |
| P7.1 | Position Presentation Engine + honest geometry | CLOUD IMPLEMENTATION + CI + LIVE API PASS; REAL BROWSER INTERACTION PENDING |
| P7.2 | Human-readable evidence/conflict explanation | CLOUD IMPLEMENTATION + CI PASS; REAL BROWSER/OPPO EVIDENCE PENDING |
| P7.3 | Trusted/refined history integration and playback | TRUSTED LIVE HISTORY + CONTRACT PASS; REAL PLAYBACK/REFINED VISUAL PROOF PENDING |
| P7.4 | Device / position / provider health + Location control UX | CLOUD MODEL + LIVE CONTRACT PASS; REAL PHONE COMMAND/UI ACK SMOKE PENDING |
| P7.5 | Trips, Places and minimal child UX revalidation | CLOUD SAFETY + ANDROID CI PASS; REAL OPPO SAFETY SMOKE PENDING |
| P7.6 | Full Phase 7 CI + real OPPO integration qualification | CLOUD + ANDROID CI PASS; REAL BROWSER + OPPO ACCEPTANCE PENDING |

## Current implementation

### Stable parent position presentation

`src/phase7-parent-presentation.ts` provides one parent-facing read model:

- position class: precise / assisted / anchored / estimated / coarse / last_known / unknown
- geometry: CIRCLE / CORRIDOR / AREA / ANCHORED_AREA / LAST_KNOWN_AREA / NONE
- qualitative confidence: high / medium / low / very_low
- evidence freshness derived from observation/evidence age, not server recomputation time
- explicit source-fix basis: epoch / sequence / received time / wall time
- display source
- conservative explanation
- contributing evidence list
- explicit conflict list
- offline/historical marker

The source-fix basis prevents a REST refinement for an older point from being silently applied to a newer WebSocket fix. When the live fix advances first, the browser temporarily presents only the new phone state and requests a fresh normalized server state instead of attaching stale Phase 7 presentation to the new fix.

### Honest map geometry

`src/parent-v7.ts` owns the Phase 7 live position geometry after the retained Phase 6 renderer runs:

- PRECISE / ASSISTED: point + uncertainty circle
- ESTIMATED route: corridor, not exact marker
- ANCHORED: area, not exact marker
- possible/refined and COARSE: area, not exact marker
- LAST KNOWN: last-known area, not exact current marker
- UNKNOWN: no position marker
- degraded-area centres are not labelled as an exact current place
- old Phase 6 accuracy/corridor sources are cleared before Phase 7 geometry is shown
- map failure still leaves controls and device data usable

### Evidence explanation

The `Why this position` panel shows:

- confidence
- evidence freshness
- geometry and uncertainty
- presentation source
- human-readable explanation
- contributing evidence with age and region size
- explicit conflict warning when evidence disagrees

A new server computation never resets evidence freshness.

### Trusted + refined history

The existing trusted history remains the base route and evidence source. Existing `refinedHistory` from the Phase 5 smoothing pipeline is consumed as a separate optional overlay:

- trusted history is never overwritten
- refined runs are shown as separate dashed lines/points
- the parent reports refined-frame/run counts and how many frames changed from the realtime hypothesis
- failure to load refined history does not make trusted history unreadable
- Today / Yesterday / 7 / 30 / custom and all existing playback controls are retained
- 0.5x / 1x / 2x / 5x / 10x playback remains retained

The card-free development path remains append-once D1 location history with indexed time/segment lookup and bounded reads. No second evidence history store was added.

### Health model

`src/phase7-health-presentation.ts` separates:

- Device Health
- Position Health
- Evidence Providers

Provider normalization covers Wi-Fi environment, Wi-Fi RTT, BLE, cellular context, LAN discovery, GNSS sky, network context, device context and the optional privileged fallback. `UNSUPPORTED` is neutral rather than a device failure. Provider unsupported state may be established from either capability or explicit provider-health evidence. A healthy phone can therefore remain Device Healthy while its Position Health is degraded indoors or during stale evidence.

### Location control acknowledgement

The Phase 7 parent displays independently:

- requested Location state
- actual phone-reported Location state
- whether the current command ID was acknowledged
- age of the latest phone observation

The UI does not call a command confirmed merely because the parent tapped ON/OFF or because an old actual-state observation happens to match.

### Trips and Places safety boundary

`src/phase4.ts` explicitly separates map presentation from safety transitions:

- PRECISE / ASSISTED / ANCHORED, uncertainty <= 250 m: eligible for geofence and coordinate-dependent trip transitions
- ESTIMATED / COARSE / LAST_KNOWN / UNKNOWN: cannot manufacture geofence enter/exit, arrival or prolonged-stop transitions from a guessed centre
- degraded observations cannot advance coordinate-dependent dwell
- a degraded/unqualified interval clears pending geofence, arrival and prolonged-stop dwell candidates while preserving stable geofence state and last trustworthy trip location/distance
- evaluation watermarks still advance so an older delayed trusted packet cannot resurrect pre-gap dwell
- time-based trip overdue remains active even without a trustworthy coordinate
- overdue events under degraded positioning carry no guessed coordinate/distance

### Android preservation branch

The Phase 7 Android branch intentionally qualifies integration rather than rewriting working tracking code. CI proves:

- minimal child UX remains intact
- Device Owner receiver and managed-policy path remain intact
- provider capability/health fields required by Phase 7 remain emitted
- diagnostic privacy/retention contract remains intact
- build, unit tests, lint and R8 pass
- full retained Phase 2–6C emulator instrumentation passes

Real OPPO verification is still mandatory.

## Requirement matrix

| Requirement | P7 state |
|---|---|
| Current trusted location | CLOUD CONTRACT + LIVE API PASS |
| Current refined location | CLOUD CONTRACT + LIVE API CONTRACT PASS |
| Uncertainty | CLOUD CONTRACT + LIVE API PASS |
| Precise/assisted circle | RENDER CONTRACT PASS; REAL BROWSER STATE PENDING |
| Estimated route corridor | RENDER CONTRACT PASS; REAL BROWSER STATE PENDING |
| Anchored region | RENDER CONTRACT PASS; REAL BROWSER STATE PENDING |
| Coarse / possible area | RENDER CONTRACT PASS; REAL BROWSER STATE PENDING |
| Last-known area | RENDER CONTRACT PASS; REAL BROWSER STATE PENDING |
| Unknown/no trustworthy coordinate | RENDER CONTRACT PASS; REAL BROWSER STATE PENDING |
| Evidence explanations | CLOUD + RENDER CI PASS; REAL BROWSER PENDING |
| Evidence conflicts | CLOUD + RENDER CI PASS; NATURAL REAL-WORLD OBSERVATION OPTIONAL |
| Today/Yesterday/7/30/custom history | RETAINED + CONTRACT PASS; BROWSER INTERACTION PENDING |
| Distance/duration/avg/max/modes/stops | RETAINED + CONTRACT PASS; BROWSER INTERACTION PENDING |
| 0.5x/1x/2x/5x/10x playback | RETAINED + CONTRACT PASS; BROWSER INTERACTION PENDING |
| Refined history separate from trusted | CLOUD + RENDER + LIVE API CONTRACT PASS; REAL REFINED VISUAL DATA PENDING IF PRODUCED |
| Provider capability/health | CLOUD MODEL + RENDER + LIVE API PASS; REAL BROWSER/PHONE SMOKE PENDING |
| Device vs Position Health | CLOUD MODEL + CI + LIVE API PASS; REAL BROWSER SMOKE PENDING |
| Measured reliability/no fake manual score | RETAINED + CONTRACT PASS; REAL BROWSER SMOKE PENDING |
| Desired vs actual vs acknowledged Location | LIVE API CONTRACT PASS; REAL COMMAND/UI ACK SMOKE PENDING |
| Degraded geofence/trip safety | CLOUD LOGIC + FIXTURES + DWELL-GAP GUARD PASS; REAL OPPO SMOKE PENDING |
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

Rare states that cannot safely or naturally be produced are recorded as fixture-verified or not naturally observed; they are never falsely marked as real-device PASS.

## Phase 7 acceptance

Phase 7 may be marked ACCEPTED only after all of these pass or are explicitly classified by the real-world acceptance rules:

- retained Phase 2–6 cloud and Android regression
- precise display
- assisted display
- anchored area
- estimated corridor
- possible-area/refined display
- coarse display
- last-known display
- unknown/no-coordinate display
- conflicting evidence widens uncertainty and is explained
- trusted history remains unchanged by refined history
- refined history is visibly distinct when real refined frames exist
- all five playback speeds
- trip/geofence behavior under degraded states, including dwell interruption
- Device Health vs Position Health separation
- unsupported provider is neutral
- requested vs actual Location acknowledgement
- revoked history remains readable
- SOS and I'M SAFE regression
- map failure leaves controls/data usable
- desktop and mobile parent layout smoke
- card-free development isolation
- real OPPO integration smoke

Until then, Phase 7 is development beta and must not be called production-ready.
