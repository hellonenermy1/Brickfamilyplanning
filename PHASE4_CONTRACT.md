# Brick V1 Phase 4 Contract

Date: 2026-11-01
Phase: 4 of 9 — Environmental Fingerprint Atlas & Signal Trust Engine
Contract source: project Google Doc `Yes`, all three tabs; `V1_REQUIREMENTS.md`; `V1_PHASES.md`.

## Purpose

Phase 4 learns compact, privacy-reduced environmental fingerprints from observations that Android legitimately exposes, and assigns conservative trust to those signals. It improves degraded-position evidence without becoming a second location engine.

## Hard boundary

Phase 4 providers and the Environmental Atlas **never decide the child's final location**. They may produce learned candidates, signal classes, uncertainty and supporting evidence. Phase 5 owns central multi-source fusion, final position state/area, conflict resolution, learned semantic places, Witness Mesh and higher-level route/semantic fusion.

A source existing is not acceptance. Evidence states remain separate: implemented source, CI/emulator verified, real-device verified and accepted.

## In scope

1. Wi-Fi environment learning:
   - privacy-reduced stable BSSID identity;
   - SSID as semantic/common hint only;
   - RSSI distributions and relative AP ordering;
   - band/frequency/channel/channel-width/security metadata;
   - cluster co-occurrence, material environment transitions and route RSSI gradients;
   - opportunistic Wi-Fi RTT distance/uncertainty when genuinely supported.
2. Common/copied Wi-Fi signal down-weighting by semantic-common classification and learned geographic spread.
3. BLE environment learning from advertisements Android legitimately exposes:
   - privacy-reduced identity;
   - RSSI distribution, Tx power, manufacturer/service fingerprint, service UUID/SID/PHY where exposed;
   - cluster co-occurrence;
   - TRUSTED_ANCHOR / DISTINCTIVE_STATIC / LOCAL_COMMON / GLOBAL_COMMON / MOBILE / UNSTABLE / STALE / UNKNOWN trust semantics as applicable.
4. Authorised LAN context using Android-supported discovery paths, with scoped absence evidence and no direct-coordinate claim.
5. LTE/NR environmental evidence including legitimately exposed signal/identity/band/channel/Timing Advance data and material serving-environment transitions. No DIY tower triangulation.
6. Aggregate GNSS-sky quality/fingerprint evidence using constellation mix/count, C/N0 distribution, azimuth/elevation, used-in-fix and carrier bands. No permanent satellite identity and no claim that an aggregate degradation pattern proves multipath.
7. Network context including transport, IPv4/IPv6, DNS context, captive/validated state, loss/recovery and interface-state transitions without adding active polling merely to create evidence.
8. Trusted companion/device context as **weak evidence only**:
   - charger state/type/pattern;
   - presence only for devices explicitly associated through Android Companion Device Manager;
   - privacy-reduced identifiers only;
   - no arbitrary nearby/bonded Bluetooth device promoted to a trusted companion;
   - companion and charger observations remain correlated weak context, never independent location proof.
9. Short, privacy-reduced environmental/activity transition sequences and coarse environmental zones. These remain low-trust evidence, not semantic named places or floor truth.
10. Signal Trust rules for geographic spread, repeated trusted visits, freshness, quality/repeatability, spoofability, correlation/independence, source health, observation count and replacement history.
11. Cautious negative evidence: one miss is weak; only repeated trusted disappearance inside the correct provider/observation scope may retire a signal.
12. Automatic decay/relearning so ordinary router/beacon/LAN/cellular changes do not require manual Atlas maintenance.
13. Privacy-reduced identifiers, encrypted local Atlas state, bounded model size and inherited bounded raw-evidence retention.

## Explicitly not claimed complete by Phase 4 source alone

- Final degraded-position fusion or final PRECISE/ASSISTED/ANCHORED/ESTIMATED/COARSE decision — Phase 5.
- A single BSSID, SSID, beacon, LAN device, companion, cell or GNSS pattern proving a place.
- Exact BLE RSSI ranging.
- DIY cellular triangulation.
- Custom raw-GNSS pseudorange solving.
- Permanent satellite identity.
- Generic building-wall or floor truth without validated geometry/ground truth.
- Active latency/packet-loss probing when it would add avoidable network/power cost; current network context stays passive unless a later measured need justifies more.
- Broad raw SSDP/UPnP socket scanning merely to tick a requirement box; current Android local-network permissions/privacy/power constraints must be respected.
- Silent companion trust enrollment. Phase 4 may observe an existing explicitly authorised Android companion association; setup/enrollment UX and real target-device presence behavior still require later integration/device verification.
- Phase 5 semantic place labels such as Home/School/Grandparents.

## Phase 4 exit evidence

The source/CI gate must include the retained Phase 2/3 regressions plus Phase 4 tests showing that these cases do not incorrectly relocate the phone:

- common SSID;
- copied SSID;
- moving BLE device;
- replaced router/AP;
- replaced BLE beacon;
- replaced LAN device;
- changing cellular environment;
- one correlated radio family cannot manufacture precise truth;
- provider/cache replay cannot manufacture repeated observations;
- negative evidence is scoped to the provider observation domain;
- derived transition/route-gradient evidence cannot masquerade as a new independent sensor;
- trusted companion + charging context cannot manufacture multiple independent confirmations;
- stale companion presence is discarded across reboot/update and must be re-confirmed by Android.

Real OPPO/ColorOS behavior, screen-off collection, Wi-Fi/BLE throttling, hardware RTT capability, companion association/presence callbacks, real cellular/GNSS patterns and power/resource cost remain device-verification gates.

## Acceptance rule

Phase 4 cannot be marked `ACCEPTED` merely because source and emulator CI are green. Formal Phase 2 and Phase 3 dependencies must close first, required real OPPO/ColorOS Phase 4 tests must pass, any supported/unsupported capability claims must be observed on target hardware, and unresolved Phase 4 contract items must be either completed or explicitly `VERIFIED UNSUPPORTED`/reassigned by the canonical plan rather than silently dropped.
