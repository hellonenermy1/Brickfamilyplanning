# Brick V1 — Phase 8A Latest Nine-Phase Plan Coverage V2

Baseline: 469-point Final Product AI Acceptance Checklist (`SRC-002`).

Overlay: latest approved nine-phase master plan (`SRC-001`).

Goal: prove every numbered latest-plan subsection/exit gate has a current requirement or acceptance mapping without duplicating requirements already present in the final checklist.

Legend:

- `CHECKLIST` — materially present in the 469-point checklist.
- `AMEND` — checklist contains older wording; latest plan replaces/changes semantics.
- `ADD` — genuinely absent from checklist; latest amendment must remain a current requirement.
- `CRITERIA` — latest-plan text is an acceptance scenario/exit criterion attached to mapped requirements rather than a separate product feature.
- `SOURCE GAP` — required value/text still not recovered from an authoritative source.

---

# Phase 1 — Contract, Baseline & Architecture Freeze

| Subsection | Status | Current mapping |
|---|---|---|
| 1.1 Freeze baseline | CHECKLIST / audit procedure | `GOV-006/007`, `COV-*`; current Phase 8A baseline refreezes exact heads. |
| 1.2 Requirement ledger | CHECKLIST / audit procedure | `GOV-001..005`, `COV-001..003/011`. |
| 1.3 Map every requirement to code | CHECKLIST / Phase 8B | `GOV-001/002`, `COV-004..006/011`; implementation mapping intentionally belongs to current 8B. |
| 1.4 Architecture boundaries | CHECKLIST | `BE-*`, `FUS-*`, `ATL-*`, `WIT-*`, `SHZ-*`, `PORT-*`, reliability/security families. |
| 1.5 Non-negotiable invariants | CHECKLIST | `GOV-010..014`, `DAT-*`, `LOC-*`, forbidden/non-goal rows. |
| Phase 1 exit gate | CRITERIA | No unmapped requirement; enforced by `COV-*` and Phase 8A closure. |

# Phase 2 — Evidence Platform, Protocol & Durable Data Foundation

| Subsection | Status | Current mapping |
|---|---|---|
| 2.1 EvidenceObservation | CHECKLIST | `BE-013`. |
| 2.2 Independence groups | CHECKLIST | `BE-013`, `FUS-007`, Atlas correlation requirements. |
| 2.3 Evidence provider interface | CHECKLIST | `BE-014/015`. |
| 2.4 Sampling coordinator | CHECKLIST | `BE-016`, activity/Atlas adaptive sampling rows. |
| 2.5 Durable Evidence Journal | CHECKLIST | `BE-017`, `DAT-*`. |
| 2.6 Evidence protocol | CHECKLIST | `BE-012/018`, security/protocol rows. |
| 2.7 Backend schema foundation | CHECKLIST | `BE-009/010/013/019`, Atlas/Witness/command/history data rows. |
| Phase 2 dummy-provider exit gate | CRITERIA | Evidence end-to-end durability/integration proof under `BE-012..018`, `DAT-*`, `COV-006`. |

# Phase 3 — Motion Intelligence, Learned Odometry & Particle Positioning

| Subsection | Status | Current mapping |
|---|---|---|
| 3.1 Sensor engine | CHECKLIST | `MOT-*`, motion/activity inputs. |
| 3.2 Sensor health | CHECKLIST | motion/provider health requirements. |
| 3.3 Learned inertial odometry | CHECKLIST | `MOT-*` learned odometry. |
| 3.4 Dynamic stride | CHECKLIST | odometry requirement. |
| 3.5 Zero velocity | CHECKLIST | zero-velocity correction requirement. |
| 3.6 Particle state | CHECKLIST | particle/hypothesis requirements. |
| 3.7 Motion propagation | CHECKLIST | particle propagation requirements. |
| 3.8 Map constraints | CHECKLIST | route/map constraint requirements. |
| 3.9 Local route graph | CHECKLIST | local route geometry requirement. |
| 3.10 Physical landmarks | CHECKLIST | physical landmark sequence requirements. |
| 3.11 Geomagnetic sequence | CHECKLIST | geomagnetic requirements. |
| 3.12 Honest particle output | CHECKLIST | area/uncertainty/no-fake-point requirements. |
| Phase 3 exit gate | CRITERIA | Walking outage/turn/stationary/reconvergence acceptance under motion/QA rows. |

# Phase 4 — Environmental Fingerprint Atlas & Signal Trust

Every subsection is present in the checklist:

| Subsection | Status | Mapping |
|---|---|---|
| 4.1 Wi-Fi fingerprint | CHECKLIST | `ATL-*` Wi-Fi. |
| 4.2 Common SSID | CHECKLIST | common/copied SSID rows. |
| 4.3 BLE fingerprinting | CHECKLIST | BLE Atlas rows. |
| 4.4 LAN place signature | CHECKLIST | LAN rows. |
| 4.5 Cellular fingerprint | CHECKLIST | cellular rows; Timing Advance optional. |
| 4.6 GNSS-sky fingerprint | CHECKLIST | GNSS-sky rows. |
| 4.7 Network-context fingerprint | CHECKLIST | network context rows. |
| 4.8 Companion context | CHECKLIST | companion weak-evidence rows. |
| 4.9 Arrival/departure sequence | CHECKLIST | arrival/departure rows. |
| 4.10 Place/zone/floor | CHECKLIST | place/zone/floor rows; no invented barometer. |
| 4.11 Signal Trust | CHECKLIST | trust/reputation/correlation rows. |
| 4.12 Negative evidence | CHECKLIST | weak-negative-evidence row. |
| 4.13 Decay/relearning | CHECKLIST | replacement/decay/relearning rows. |
| 4.14 Privacy | CHECKLIST | privacy-reduced IDs/raw-retention rules. |
| Phase 4 exit gate | CRITERIA | common/copied SSID, moving BLE, replacement and changing-cell tests in Atlas/QA rows. |

# Phase 5 — Unified Fusion, Places, Routes, Witness & Ground Network

| Subsection | Status | Current mapping |
|---|---|---|
| 5.1 Parallel Evidence Engine | CHECKLIST | `FUS-*`, provider/fusion rows. |
| 5.2 Conflict handling | CHECKLIST | conflict/uncertainty rows. |
| 5.3 Learned Place Signatures | CHECKLIST | place/Atlas/fusion rows. |
| 5.4 Radio Route Fingerprinting | CHECKLIST | radio-route rows. |
| 5.5 Wi-Fi Semantic Landmarks | CHECKLIST | semantic Wi-Fi rows. |
| 5.6 Wi-Fi RTT | CHECKLIST | optional-if-supported RTT row. |
| 5.7 Witness Mesh | CHECKLIST | `WIT-*`. |
| 5.8 Fixed Ground Network | CHECKLIST | `WIT-*` receiver rows. |
| 5.9 Future ranging | CHECKLIST | 2 future-interface rows. |
| 5.10 Backward smoothing | CHECKLIST | raw/realtime/refined separation. |
| 5.11 Measured continuity + active reacquisition | **ADD** | `REACQ-001..009`; absent from checklist as a defined state machine. |
| Phase 5 exit gate | CHECKLIST/CRITERIA | official position states and no weak-evidence precision. |

# Phase 6 — Device Owner, Parent Location Control & Shizuku

| Subsection | Status | Current mapping |
|---|---|---|
| 6.1 Device Owner one-shot Location | **AMEND** | replaces stale `DPM-002/003`, `SHZ-007/008`; current `LOC1S-*`. |
| 6.2 Command completion + child override | **AMEND** | `LOC1S-*`, `PLOCUI-*`; completed command is history, user later state wins. |
| 6.2A Scheduled Wi-Fi one-shot | **ADD** | `WIFICTL-001..008`; no equivalent in checklist. |
| 6.3 Command protocol | CHECKLIST | `SHZ-006/009/010`, command audit/security rows. |
| 6.4 Shizuku typed bridge | CHECKLIST | `SHZ-001..006`, optional capability rows. |
| 6.5 Location-OFF Wi-Fi test | CHECKLIST | `SHZ-012`. |
| 6.6 Location-OFF BLE test | CHECKLIST | `SHZ-013`. |
| 6.7 Privileged cellular | CHECKLIST | `SHZ-014`. |
| 6.8 Privileged diagnostics | CHECKLIST | `SHZ-015`. |
| 6.9 Approved repair | CHECKLIST | `SHZ-016`. |
| 6.10 Shizuku lifecycle loss | CHECKLIST | `SHZ-003`, `SHZ-017/018`, QA provider isolation. |
| 6.11 Notification/disclosure | **AMEND** | replaces `SHZ-020` second-status semantics; amends `CUI-004/011/012`, `DPM-007`, `SHZ-021`; current `NOTIFY2-*`. |
| 6.12 SOS emergency privileged enhancement | CHECKLIST | optional `SHZ-019`, durable SOS remains primary. |
| 6.13 Maintenance/Deep Off/deprovision | **ADD** | `MAINT-*`, `DEEPOFF-*`, `DEPROV-*`; absent from checklist. |
| Phase 6 exit gate | CRITERIA | existing Shizuku security/lifecycle/command/SOS tests plus new child-override/maintenance criteria. |

# Phase 7 — Cloud Intelligence, History, Parent Dashboard & Child UX

| Subsection | Status | Current mapping |
|---|---|---|
| 7.1 backend responsibilities | CHECKLIST | `BE-*`, current state/D1/R2/Queue/Witness/command/history rows. |
| 7.1A Fast Live Path | **ADD + AMEND** | current `LIVE-*`; strengthens `BE-005/006/019/020`, `PORT-029/030`; instrumentation/coalescing/P95 specifics are new. |
| 7.1B detailed Singapore map | **ADD + AMEND** | current `MAPSG-*`; amends old private-OSM provider wording in `PORT-004/007/031`. |
| 7.1C OneMap auth boundary | **ADD** | current `ONEMAP-*`; no OneMap-specific checklist requirements. |
| 7.2 history | CHECKLIST | history/raw/refined/evidence fields. |
| 7.3 playback | CHECKLIST | playback controls/state. |
| 7.4 route simplification | CHECKLIST | display simplification with raw history retained. |
| 7.5 trips/geofences | CHECKLIST | stop/geofence/trip rows including source-quality protection. |
| 7.6 degraded UI | CHECKLIST | position geometry/source truth rows. |
| 7.7 evidence explanation | CHECKLIST | Explain This Location/no fake percentage rows. |
| 7.8 parent Location controls | **AMEND** | replaces stale `PORT-014`; current `PLOCUI-*`. |
| 7.9 Device/Position/provider health | CHECKLIST | health/provider rows; unsupported optional provider neutral. |
| 7.10 Child UI | CHECKLIST | `CUI-*`. |
| Phase 7 screen-state exit matrix | **CRITERIA** | attach full precise/no/poor/estimated/witness/anchor/offline/stale/revoked/Shizuku-unavailable/Atlas-unsupported/SOS/I'M SAFE matrix to parent/child UI acceptance; must not disappear. |

# Phase 8 — Reliability, Security, Privacy & Operational Hardening

| Subsection | Status | Current mapping |
|---|---|---|
| 8.1 reliability regression | CHECKLIST | `DAT-*`, `REL-*`, `BE-*`, QA. |
| 8.2 evidence backlog priority | CHECKLIST + AMEND | existing critical-safety priority; latest exact order `SOS > Critical safety > Location > Health > Evidence learning > Diagnostics` is retained as acceptance/policy detail. |
| 8.3 storage pressure | CHECKLIST/CRITERIA | 1/7/14-day, huge evidence, low-storage, write-death/no-corruption under storage/backlog QA. |
| 8.4 provider crash isolation | CHECKLIST | QA provider crash row covers Wi-Fi/BLE/magnetometer/Atlas/particle/Shizuku. |
| 8.5 security | CHECKLIST | security/command/key/Access/rate/revocation/audit/no-secret rows. |
| 8.6 privacy | CHECKLIST | analytics prohibition, private fingerprint DB, retention, privacy-reduced IDs, revoked history, crash privacy. |
| 8.7 backup/restore | CHECKLIST | destructive restore requirement. |
| 8.8 battery optimisation | CHECKLIST | advanced features must earn measured value; Live Track/Atlas battery tests. |
| 8.9 performance | CHECKLIST | CPU/RAM/wakeups/sensors/scans/DB/data/Worker/D1/Queue/R2 metrics. |
| Phase 8 exit gate | CHECKLIST | no critical open issue; optional target capability cannot remain UNKNOWN. |

# Phase 9 — Real OPPO Qualification, Production Release & Acceptance

| Subsection | Status | Current mapping |
|---|---|---|
| 9.1 production APK/signing | CHECKLIST | `OPS-*`, `GOV-*`. |
| 9.2 final APK inspection | CHECKLIST | `OPS-007` + security/artifact checks. |
| 9.3 matching backend/release identity | CHECKLIST | `GOV-007`, deployment/version/compatibility rows. |
| 9.4 full authenticated browser test | **CRITERIA** | attach explicit real-Access login/logout/live/WebSocket/history/playback/trips/places/geofence/SOS/I'M SAFE/health/crash/reliability/retention/map/Atlas/degraded/control/Witness/receiver matrix to portal/coverage/ops acceptance. |
| 9.5 original endurance | CHECKLIST | `QA-001..021` and related rows. |
| 9.6 Atlas qualification | CHECKLIST | Atlas QA/relearning/battery/raw-retention rows. |
| 9.7 Location-OFF qualification | CHECKLIST | Location-OFF matrix, Witness/Ground/Shizuku optional capability rows. |
| 9.7A reversible/latency/notification qualification | **CRITERIA for AMEND/ADD requirements** | `QUALREV-001..014` retained as explicit evidence matrix on both target OPPO profiles. |
| 9.8 Witness qualification | CHECKLIST | Witness QA matrix. |
| 9.9 Ground Network qualification | CHECKLIST | Ground receiver QA matrix. |
| 9.10 zero intervention | CHECKLIST | `GOV-010`, `COV-010`, endurance/recovery rows. |
| 9.11 release classification | CHECKLIST | production verdict rule; Phase 8 may at most yield RELEASE CANDIDATE. |

---

# Coverage result

Every numbered Phase 1–9 subsection and exit gate in the latest master plan is now assigned to:

- an existing 469-checklist requirement;
- a current higher-precedence amendment;
- or explicit acceptance criteria attached to those requirements.

No latest-plan subsection is currently unmapped.

The only unresolved **source-value** issue remains `P8A-GAP-002`: the authoritative numeric value(s) for the referenced 23R P95 Fast Live Path latency budget have not been recovered. The requirement to measure/meet that budget is preserved; no number will be invented.

This document closes the *subsection coverage* pass, not Phase 8A itself. Final unique-ID normalization, supersession marking and dependency/acceptance ownership still have to be frozen before Phase 8A can PASS.
