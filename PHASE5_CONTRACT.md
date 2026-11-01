# Brick V1 Phase 5 Contract — Unified Fusion, Learned Places, Witness Mesh & Ground Network

Date: 2026-11-01
Source of truth: live `Yes` Google Doc / retained `Yes.docx`, `V1_PHASES.md`, `V1_REQUIREMENTS.md`, `V1_ARCHITECTURE_FREEZE.md`.
Status: **STAGING CONTRACT — PHASE 5 NOT ACCEPTED**

## Dependency truth

Phase 5 staging/source work may proceed so development time is not wasted, but formal Phase 5 acceptance remains blocked until required Phase 2/3/4 acceptance dependencies close. Real OPPO/ColorOS verification cannot be performed until Monday, 2 November 2026 and must not be fabricated or substituted with emulator evidence.

## Purpose

Combine all safely available degraded-position evidence into one conflict-aware persistent hypothesis/fusion system and add private authorised external observations without weakening the earlier durability, privacy, uncertainty or safety invariants.

## Required Phase 5 outcomes

1. **Parallel Evidence Engine**
   - evaluate safely available evidence together rather than selecting isolated fallbacks;
   - include last trusted position, Phase 3 motion/particle/path state, Phase 4 Atlas/place/environment matches, known anchors, network/cellular transition evidence, RTT where supported, authorised witnesses, ground receivers and future authenticated ranging constraints;
   - collapse correlated evidence by independence group before numerical confidence can accumulate;
   - stale evidence expires using monotonic age;
   - conflicts expand uncertainty rather than silently selecting the convenient answer;
   - weak evidence alone can never manufacture PRECISE/ASSISTED or a tiny exact point.

2. **Honest fusion output**
   - produce one of the seven official states: PRECISE, ASSISTED, ANCHORED, ESTIMATED, COARSE, LAST_KNOWN, UNKNOWN;
   - degraded Phase 5 evidence itself may only produce ANCHORED/ESTIMATED/COARSE/LAST_KNOWN/UNKNOWN;
   - output position **or area**, measurable uncertainty, shape type, evidence used, evidence age, conflicts, route candidates and qualitative confidence band;
   - internal weights are not calibrated probabilities and must never be presented as such.

3. **Learned places**
   - learn conservative Home/School/Grandparents/custom-place signatures only from trusted-position periods;
   - place evidence may combine Atlas/network/cellular/route/activity/dwell/companion/charging/arrival-departure signals when actually available;
   - a strong learned-place match may produce ANCHORED place/zone state, never a fake room-level coordinate;
   - place models must decay/relearn as the environment changes.

4. **Radio-route matching**
   - route radio/environment patterns are supporting/elimination evidence for route hypotheses;
   - historical route is a weak prior only;
   - radio patterns never create exact coordinates independently;
   - changing networks must relearn automatically.

5. **Wi-Fi Semantic Landmark / RTT integration**
   - common/copied SSIDs remain near-zero location value;
   - distinctive semantic Wi-Fi evidence remains correlated with its underlying Wi-Fi observation;
   - Wi-Fi RTT range + uncertainty feeds fusion only when Android/AP capability and permission requirements are satisfied;
   - unsupported RTT is `UNSUPPORTED`, not a device failure and not a release blocker by itself unless contractually required on target hardware.

6. **Private Witness Mesh**
   - child advertises rotating privacy-preserving Brick BLE identifiers; no permanent public child identifier;
   - only paired/authorised Brick relationships may resolve/report useful sightings;
   - witness report includes witness identity, fresh trusted witness position + uncertainty, sighting time and bounded BLE proximity metadata;
   - witness uncertainty includes witness position uncertainty plus a conservative proximity allowance;
   - RSSI is supporting proximity/pattern evidence only, never exact metres;
   - sightings are authenticated/signed, fresh, replay-protected, revocation-aware and auditable;
   - no public crowdsourced tracking network.

7. **Fixed Brick Ground Network**
   - fixed authorised receivers use the same rotating-child-ID/authenticated-sighting model;
   - one receiver constrains to its verified site/zone area, not fake exact range;
   - several independent receivers may conservatively narrow a zone;
   - AoA/direction is disabled unless specialised calibrated hardware and real evidence exist.

8. **Future ranging abstraction**
   - define a generic authenticated range/direction constraint interface for future UWB, Bluetooth Channel Sounding and Wi-Fi NAN RTT;
   - runtime capability detection is mandatory;
   - unsupported hardware remains `UNSUPPORTED`; Android API existence alone is not proof target hardware supports it.

9. **Backward smoothing / history separation**
   - when a new trustworthy precise endpoint returns, rerank the degraded interval using both endpoints and stored evidence;
   - never modify raw observations;
   - never overwrite the original realtime estimate shown at the time;
   - refined estimates are stored separately with their model/run identity.

## Frozen cross-phase invariants

- Android Fused Location remains the primary normal position source.
- No custom raw-GNSS solver.
- Persist before transmit; exact ACK before deletion; idempotent server handling.
- SOS/live safety traffic retains priority over bulk evidence/history.
- Phase 5 may not silently weaken Phase 2 durability, Phase 3 growing-uncertainty rules or Phase 4 trust/independence rules.
- A failed optional provider must not crash Brick Core.
- Raw truth remains separate from trusted/realtime/refined interpretations.
- No public fingerprint/witness database, no permanent car tracker, no root/custom-ROM dependency.

## Exit gate

Phase 5 may be marked accepted only when:

- every official position state is exercised honestly at the appropriate evidence layer;
- independent agreement can shrink uncertainty but weak/correlated evidence cannot create false precision;
- conflicts expand/retain uncertainty rather than being hidden;
- learned places and radio-route evidence behave conservatively and relearn automatically;
- Witness/Ground rotating-ID authorization, replay, revocation and uncertainty rules pass adversarial tests;
- RTT/future-ranging capability handling is correct for supported and unsupported cases;
- backward smoothing leaves raw and original realtime history immutable;
- retained Phase 2/3/4 regressions pass on the exact pair;
- physical OPPO/ColorOS gates required by the contract are completed later and recorded honestly.
