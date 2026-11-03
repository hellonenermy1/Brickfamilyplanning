# Brick V1 — Phase 8A Latest Nine-Phase Plan Coverage — FINAL

Baseline: 469-point Final Product AI Acceptance Checklist (`SRC-002`).

Overlay: latest approved nine-phase master plan (`SRC-001`) plus the explicit Phase 8A 23R engineering amendment (`SRC-009`).

Status: **PASS — every numbered subsection and exit gate is mapped; open source gaps = 0.**

Legend:

- `CHECKLIST` — materially present in the 469-point checklist.
- `AMEND` — baseline wording remains but later current semantics replace/modify it.
- `ADD` — genuinely absent from checklist and represented by a new current ID.
- `CRITERIA` — acceptance scenario/exit gate attached to mapped requirements.

## Phase 1 — Contract, Baseline & Architecture Freeze

- 1.1 Freeze baseline — CHECKLIST/audit procedure: `GOV-006/007`, `COV-*`.
- 1.2 Requirement ledger — CHECKLIST: `GOV-001..005`, `COV-001..003/011`.
- 1.3 Requirement-to-code mapping — CHECKLIST, implementation execution deferred to current Phase 8B.
- 1.4 Architecture boundaries — CHECKLIST across `BE/FUS/ATL/WIT/SHZ/PORT/REL/SEC` families.
- 1.5 Non-negotiable invariants — CHECKLIST: `GOV-010..014`, `DAT-*`, `LOC-*`, forbidden/non-goal rows.
- Exit gate — CRITERIA: no unmapped current requirement. PASS at 8A closure.

## Phase 2 — Evidence Platform, Protocol & Durable Data

2.1 EvidenceObservation, 2.2 independence groups, 2.3 provider interface, 2.4 sampling coordinator, 2.5 durable Evidence Journal, 2.6 evidence protocol and 2.7 backend schema are all CHECKLIST-mapped through `BE-*`, `DAT-*`, `FUS-*`, Atlas/security/protocol families.

Dummy-provider end-to-end durability exit gate remains mandatory integration evidence.

## Phase 3 — Motion Intelligence / Particle Positioning

3.1–3.12 are CHECKLIST-mapped through `MOT-*`, activity, particle, route/map constraint, physical landmark, geomagnetic and uncertainty rows.

Walking outage/turn/stationary/reconvergence exit gate remains mandatory.

## Phase 4 — Environmental Atlas / Signal Trust

4.1–4.14 are CHECKLIST-mapped: Wi-Fi, common SSID, BLE, LAN, cellular, GNSS-sky, network context, companion context, arrival/departure, place/zone/floor, Signal Trust, negative evidence, decay/relearning and privacy.

Atlas replacement/copied/moving/stale-signal and battery qualification remain mandatory.

## Phase 5 — Fusion / Places / Routes / Witness / Ground

- 5.1–5.10 — CHECKLIST: fusion, conflict, places, radio route, Wi-Fi semantics, RTT optional capability, Witness, Ground Network, future ranging and backward smoothing.
- 5.11 measured continuity / active reacquisition — ADD/STRENGTHEN: current `REACQ-*` plus amended `LOC-008` and `FUS-001`.
- Exit gate — CHECKLIST/CRITERIA: official position states, honest uncertainty and no weak-evidence fake precision.

## Phase 6 — Device Owner / Parent Location / Shizuku

- 6.1 one-shot Location — AMEND: `DPM-002`, superseded `DPM-003/SHZ-007`, current `LOC1S-003/004`, `SHZ-008/009` amended.
- 6.2 command completion + child override — AMEND: current actual state wins after completed command.
- 6.2A scheduled Wi-Fi — ADD: `WIFICTL-001..008`.
- 6.3–6.10 command protocol/Shizuku/privileged evidence/diagnostics/repair/lifecycle — CHECKLIST.
- 6.11 notification/disclosure — AMEND: superseded standalone `SHZ-020`; current `NOTIFY2-*`, amended `SHZ-021` and related CUI/DPM rules.
- 6.12 SOS privileged enhancement — CHECKLIST optional capability; durable normal SOS remains primary.
- 6.13 Maintenance/Deep Off/deprovision — ADD: `MAINT-*`, `DEEPOFF-*`, `DEPROV-*`.
- Exit gate — CRITERIA: command security/lifecycle/SOS plus reversible-control and maintenance qualification.

## Phase 7 — Cloud Intelligence / History / Parent / Child UX

- 7.1 backend responsibilities — CHECKLIST `BE-*` and related data/security rows.
- 7.1A Fast Live Path — ADD + AMEND: `LIVE-001/003/004/005`, amended `BE-006`, background isolation.
- 7.1B detailed Singapore map — ADD + AMEND: `MAPSG-*`, amended `PORT-004/007/031`.
- 7.1C OneMap auth boundary — ADD: `ONEMAP-001..007`.
- 7.2–7.7 history/playback/simplification/trips/geofences/degraded UI/evidence explanation — CHECKLIST.
- 7.8 parent Location presentation — AMEND: current `PORT-014` wording; actual current state separated from historical one-shot command.
- 7.9 Device/Position/provider health — CHECKLIST.
- 7.10 Child UI — CHECKLIST.
- Screen-state exit matrix — CRITERIA frozen in `PHASE8A_ACCEPTANCE_MATRICES.md`.

## Phase 8 — Reliability / Security / Privacy / Operations

- 8.1 reliability regression — CHECKLIST.
- 8.2 backlog priority — ADD/STRENGTHEN: `PRIO-001` exact order `SOS > Critical safety > Location > Health > Evidence learning > Diagnostics`.
- 8.3 storage pressure — CHECKLIST/CRITERIA.
- 8.4 provider crash isolation — CHECKLIST.
- 8.5 security — CHECKLIST.
- 8.6 privacy — CHECKLIST.
- 8.7 backup/restore — CHECKLIST.
- 8.8 battery optimisation — CHECKLIST.
- 8.9 performance — CHECKLIST.
- Exit gate — no unresolved Critical/High release-blocking hardening issue; optional device capability cannot remain UNKNOWN.

## Phase 9 — Real OPPO Qualification / Production Acceptance

- 9.1 APK/signing — CHECKLIST `OPS/GOV`.
- 9.2 final APK inspection — CHECKLIST.
- 9.3 matching backend/release identity — CHECKLIST.
- 9.4 full authenticated browser — CRITERIA frozen in `PHASE8A_ACCEPTANCE_MATRICES.md`.
- 9.5 endurance — CHECKLIST QA family.
- 9.6 Atlas qualification — CHECKLIST.
- 9.7 Location-OFF qualification — CHECKLIST.
- 9.7A reversible control / latency / notification — CRITERIA frozen; 23R numeric values resolved below.
- 9.8 Witness qualification — CHECKLIST.
- 9.9 Ground Network qualification — CHECKLIST.
- 9.10 zero manual intervention — CHECKLIST.
- 9.11 release classification — CHECKLIST: Phase 8 can produce RELEASE CANDIDATE, not PRODUCTION QUALIFIED.

## 23R final values

Resolved by `PHASE8A_23R_LATENCY_AMENDMENT.md`:

- accepted current fix -> visible parent marker: **P95 <= 1.5 s** under healthy validated connectivity;
- authoritative backend current state -> visible parent marker: **P95 <= 500 ms**;
- parent Live Track activation -> phone fast-mode confirmation/explicit failure: **P95 <= 2.0 s** while online/reachable.

## Final coverage result

- Latest-plan numbered subsections/exit gates unmapped: **0**.
- Source-value gaps: **0**.
- Contract conflicts unresolved: **0**.
- Current requirements without owner/dependency/evidence mapping: **0**.

**LATEST NINE-PHASE PLAN COVERAGE: PASS**
