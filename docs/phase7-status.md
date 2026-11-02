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

## Latest cloud qualification checkpoint

Phase 7 cloud CI run `41397317932` passed after the safety-quality split and full parent UX integration.

Passed gates:

- retained qualified Phase 6C base ancestry
- locked dependency install
- parent asset build + TypeScript checks
- Phase 7 position-presentation fixtures
- separate Device Health / Position Health / provider-status fixtures
- trusted-position-only geofence/arrival/stop fixtures
- time-based trip-overdue independence from GPS quality
- retained Phase 2–6 cloud regression and privacy gates
- rendered Phase 7 parent browser contract + JavaScript syntax check
- honest geometry/refined-history/health/Location-control UI contract
- card-free development isolation
- production worker/config isolation
- dependency audit

This proves the current Phase 7 cloud implementation in CI. It does not replace live-browser or real-OPPO qualification and is not a production-readiness claim.

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

## Work packets

| Packet | Scope | Status |
|---|---|---|
| P7.0 | Requirement matrix + stable parent read model | CLOUD CONTRACT PASS |
| P7.1 | Position Presentation Engine + honest geometry | CLOUD IMPLEMENTATION + CI PASS; LIVE BROWSER PENDING |
| P7.2 | Human-readable evidence/conflict explanation | CLOUD IMPLEMENTATION + CI PASS; LIVE EVIDENCE PENDING |
| P7.3 | Trusted/refined history integration and playback | CLOUD IMPLEMENTATION + CI PASS; LIVE DATA PENDING |
| P7.4 | Device / position / provider health + Location control UX | CLOUD IMPLEMENTATION + CI PASS; LIVE PHONE ACK PENDING |
| P7.5 | Trips, Places and minimal child UX revalidation | CLOUD SAFETY GUARD PASS; ANDROID/OPPO PENDING |
| P7.6 | Full Phase 7 CI + real OPPO integration qualification | CLOUD PASS; ANDROID CI + REAL OPPO PENDING |

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

The source-fix basis prevents a REST refinement for an older point from being silently applied to a newer WebSocket fix. When the live fix advances first, the browser temporarily presents only the new phone state until the server read model catches up.

### Honest map geometry

`src/parent-v7.ts` now owns the live position geometry after the retained Phase 6 renderer runs:

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

The card-free development path remains append-once D1 location history with indexed time/segment lookup and virtual 15-minute history objects on read. No second history store was added.

### Health model

`src/phase7-health-presentation.ts` separates:

- Device Health
- Position Health
- Evidence Providers

Provider normalization covers Wi-Fi environment, Wi-Fi RTT, BLE, cellular context, LAN discovery, GNSS sky, network context, device context and the optional privileged fallback. `UNSUPPORTED` is neutral rather than a device failure. A healthy phone can therefore remain Device Healthy while its Position Health is degraded indoors or during stale evidence.

### Location control acknowledgement

The Phase 7 parent now displays independently:

- requested Location state
- actual phone-reported Location state
- whether the current command ID was acknowledged
- age of the latest phone observation

The UI does not call a command confirmed merely because the parent tapped ON/OFF or because an old actual-state observation happens to match.

### Trips and Places safety boundary

`src/phase4.ts` now explicitly separates map presentation from safety transitions:

- PRECISE / ASSISTED / ANCHORED, uncertainty <= 250 m: eligible for geofence and coordinate-dependent trip transitions
- ESTIMATED / COARSE / LAST_KNOWN / UNKNOWN: cannot manufacture geofence enter/exit, arrival or prolonged-stop transitions from a guessed centre
- degraded observations do not advance geofence candidate state
- time-based trip overdue remains active even without a trustworthy coordinate
- overdue events under degraded positioning carry no guessed coordinate/distance
- last trustworthy trip distance/location is preserved instead of being overwritten by degraded data

### Android preservation branch

The Phase 7 Android branch intentionally starts with qualification rather than unnecessary app rewrites. Its CI checks:

- minimal child UX remains intact
- Device Owner receiver and managed-policy path remain intact
- provider capability/health fields required by Phase 7 remain emitted
- diagnostic privacy/retention contract remains intact
- build, unit tests, lint and R8
- full retained Phase 2–6C emulator instrumentation

Real OPPO verification is still mandatory.

## Requirement matrix

| Requirement | P7 state |
|---|---|
| Current trusted location | CLOUD CONTRACT PASS |
| Current refined location | CLOUD CONTRACT PASS |
| Uncertainty | CLOUD CONTRACT PASS |
| Precise/assisted circle | RENDER CONTRACT PASS; LIVE PENDING |
| Estimated route corridor | RENDER CONTRACT PASS; LIVE PENDING |
| Anchored region | RENDER CONTRACT PASS; LIVE PENDING |
| Coarse / possible area | RENDER CONTRACT PASS; LIVE PENDING |
| Last-known area | RENDER CONTRACT PASS; LIVE PENDING |
| Unknown/no trustworthy coordinate | RENDER CONTRACT PASS; LIVE PENDING |
| Evidence explanations | CLOUD + RENDER CI PASS; LIVE PENDING |
| Evidence conflicts | CLOUD + RENDER CI PASS; LIVE PENDING |
| Today/Yesterday/7/30/custom history | RETAINED; LIVE REVALIDATION PENDING |
| Distance/duration/avg/max/modes/stops | RETAINED; LIVE REVALIDATION PENDING |
| 0.5x/1x/2x/5x/10x playback | RETAINED; LIVE REVALIDATION PENDING |
| Refined history separate from trusted | CLOUD + RENDER CI PASS; LIVE DATA PENDING |
| Provider capability/health | CLOUD MODEL + RENDER CI PASS; LIVE PHONE DATA PENDING |
| Device vs Position Health | CLOUD MODEL + CI PASS; LIVE PENDING |
| Measured reliability/no fake manual score | RETAINED; LIVE REVALIDATION PENDING |
| Desired vs actual vs acknowledged Location | RENDER CONTRACT PASS; LIVE PHONE ACK PENDING |
| Degraded geofence/trip safety | CLOUD LOGIC + FIXTURES PASS; LIVE PENDING |
| Minimal child UI | ANDROID CI IN PROGRESS |
| Device Owner path | ANDROID CI IN PROGRESS / REAL OPPO OWNER ALREADY PROVISIONED |
| Card-free beta isolation | PASS |
| Production isolation | PASS |
| Real OPPO Phase 7 proof | PENDING |

## Phase 7 acceptance

Phase 7 may be marked ACCEPTED only after all of these pass:

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
- refined history is visibly distinct
- all five playback speeds
- trip/geofence behavior under degraded states
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
