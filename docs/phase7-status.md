# Brick V1 Phase 7 — Cloud Intelligence, History & Trustworthy UX

Phase 7 converts the already-built Phase 2–6 tracking, evidence, reliability and safety systems into one stable parent-facing contract and an honest dashboard. It does not replace the positioning algorithms.

## Frozen starting points

- Cloud / Parent Phase 6C base: `1a4e9c6c19ba372b49a500e0b227dbefe7bdac73`
- Android / OPPO Phase 6C base: `0c2c7e58279fd0faeca7f3e4dcf461111bdbb33b`
- Phase 7 cloud branch: `v1-p7-cloud-ux`
- Phase 7 Android branch: `v1-p7-android-ux`
- Development remains card-free: no mandatory R2, Queue, Access/Zero Trust or Cron binding.
- Production worker/config/deployment remain frozen until Phase 7 acceptance.

## First qualification checkpoint

Phase 7 cloud CI run `41394922335` passed on head `90b1dc49b9406f922e8c140f6d3941d58c1f22c6`.

Passed gates:

- retained Phase 6C base ancestry
- locked dependency install
- parent asset build + TypeScript checks
- Phase 7 precise / corridor / anchored / stale-refinement / conflict / last-known / unknown fixtures
- retained Phase 2–6 cloud regression and privacy gates
- rendered Phase 7 parent browser contract + JavaScript syntax check
- card-free development isolation
- production worker/config isolation
- dependency audit

This proves the first Phase 7 cloud slice only. It is not Phase 7 acceptance and is not a production-readiness claim.

## Phase 7 rules

1. Never make stale evidence look fresh because a server computation just ran.
2. Never convert a degraded/estimated state into a precise-looking point without evidence that supports it.
3. Raw/trusted history remains immutable evidence. Refined history is a separate presentation layer.
4. Device health and position confidence are separate concepts.
5. Unsupported evidence providers are neutral, not failures.
6. Requested Location state and phone-observed Location state remain separate until acknowledgement.
7. Phase 7 must preserve Phase 2–6 security, privacy, safety and reliability behavior.
8. Child UI remains deliberately minimal; development diagnostics stay separate.

## Work packets

| Packet | Scope | Status |
|---|---|---|
| P7.0 | Requirement matrix + stable parent read model | BASELINE PASS |
| P7.1 | Position Presentation Engine + honest geometry | PARTIAL PASS — contract done, full map geometry pending |
| P7.2 | Human-readable evidence/conflict explanation | PARTIAL PASS |
| P7.3 | Trusted/refined history integration and playback | NOT STARTED |
| P7.4 | Device / position / provider health + Location control UX | NOT STARTED |
| P7.5 | Trips, Places and minimal child UX revalidation | NOT STARTED |
| P7.6 | Full Phase 7 CI + real OPPO integration qualification | CLOUD BASELINE PASS — full/OPPO pending |

## Current implementation

### Parent presentation contract

`src/phase7-parent-presentation.ts` defines the first stable Phase 7 position read model:

- position class: precise / assisted / anchored / estimated / coarse / last_known / unknown
- geometry: CIRCLE / CORRIDOR / AREA / ANCHORED_AREA / LAST_KNOWN_AREA / NONE
- qualitative confidence: high / medium / low / very_low
- evidence freshness derived from observation/evidence age, not server recomputation time
- display source
- conservative explanation
- contributing evidence list
- explicit conflict list
- offline/historical marker

Authenticated parent state responses are augmented with this contract only after the retained Phase 6 state/refinement pipeline succeeds.

### Parent UX

`src/parent-v7.ts` extends the retained Phase 6C beta UI with a `Why this position` panel showing:

- confidence
- evidence freshness
- geometry type and uncertainty
- presentation source
- human-readable explanation
- contributing evidence
- explicit conflict warning

Existing live tracking, safety controls, history, trips, Places, health, diagnostics and map-failure isolation remain retained.

### Regression gate

`.github/workflows/v1-phase7-cloud-ci.yml` retains Phase 2–6 cloud regression/privacy checks and adds:

- Phase 7 presentation fixture checks
- actual Phase 7 parent rendering
- inline browser-module syntax check
- Phase 7 state/header integration checks
- card-free beta isolation checks
- production entrypoint isolation checks
- dependency audit

## Requirement matrix

| Requirement | Existing before P7 | P7 action | Current status |
|---|---|---|---|
| Current trusted location | Yes | Normalize into presentation contract | CONTRACT PASS |
| Current refined location | Yes | Normalize without upgrading precision | CONTRACT PASS |
| Uncertainty | Yes | Always surface honestly | CONTRACT PASS |
| Route corridor | Yes | Expose as explicit CORRIDOR geometry | CONTRACT PASS / MAP REVALIDATION PENDING |
| Anchored region | Partial UI | Expose as ANCHORED_AREA | CONTRACT PASS / MAP REVALIDATION PENDING |
| Coarse region | Partial UI | Expose as AREA | CONTRACT PASS / MAP REVALIDATION PENDING |
| Last-known area | Partial UI | Expose as LAST_KNOWN_AREA | CONTRACT PASS / MAP REVALIDATION PENDING |
| Unknown/no trustworthy coordinate | Yes internally | Expose as NONE, never fake marker | CONTRACT PASS |
| Evidence explanations | Backend data exists | Human-readable parent display | FIRST UI PASS |
| Evidence conflicts | Backend data exists | Explicit warning + widened uncertainty | FIRST UI PASS |
| Today/Yesterday/7/30/custom history | Yes | Revalidate | PENDING |
| Distance/duration/avg/max/modes/stops | Yes | Revalidate and preserve | PENDING |
| 0.5x/1x/2x/5x/10x playback | Yes | Revalidate | PENDING |
| Refined history | Backend exists | Integrate as separate layer | MISSING |
| Provider capability/health | Android reports many providers | Normalize + parent UI | MISSING |
| Measured reliability | Yes | Preserve; do not invent manual intervention | PENDING |
| Desired vs actual Location | Yes | Improve acknowledgement UX | PENDING |
| Trips / Places | Yes foundation | Revalidate degraded-position safety | PENDING |
| Minimal child UI | Yes | Preserve | PENDING |
| Real OPPO Phase 7 proof | No | Required before acceptance | BLOCKED ON IMPLEMENTATION |

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
