# Brick V1 — Phase 8A Latest Master-Plan Coverage Map

Purpose: walk every named subsection of the latest approved nine-phase plan and prove it is either covered by the canonical base ledger, mapped to a later amendment ID, or explicitly recorded as a requirement/source gap.

Legend:

- `BASE` — exact/material requirement already exists in `V1_REQUIREMENTS.md`.
- `AMEND` — later current requirement is captured by `PHASE8A_REQUIREMENT_AMENDMENTS.md`.
- `ADD-R2` — needs an additional atomic requirement in Phase 8A reconciliation round 2.
- `AUDIT-PROCESS` — controls how the program/audit is run; not a runtime product feature.
- `SOURCE-GAP` — authoritative text is insufficient; do not invent.

## Phase 1 — Contract, baseline, architecture freeze

| Section | Coverage | Mapping / decision |
|---|---|---|
| 1.1 Freeze baseline | AUDIT-PROCESS | Phase 8A baseline file re-freezes current heads. |
| 1.2 Requirement ledger | AUDIT-PROCESS | Canonical base ledger + current amendment/reconciliation ledgers. |
| 1.3 Map requirements to code | AUDIT-PROCESS | Deferred to Phase 8B by current six-part audit design. |
| 1.4 Architecture boundaries | BASE | `ARCH-*`, `EVD-*`, Atlas/fusion/Shizuku/cloud/UI/health families + architecture invariants. |
| 1.5 Non-negotiable invariants | BASE | `DUR-*`, `RAW-*`, `CONF-*`, `SHZ-*`, `CMD-*`, `PRIV-*`, `PAIR-*`, `CUI-*` and non-goals. |

## Phase 2 — Evidence/data platform

| Section | Coverage | Mapping / decision |
|---|---|---|
| 2.1 Canonical `EvidenceObservation` | ADD-R2 | Base ledger covers evidence semantics but not the full canonical observation-schema contract. |
| 2.2 Independence groups | BASE + ADD-R2 | `IND-001` covers anti-double-counting; schema-level `independenceGroup` belongs in new platform requirement. |
| 2.3 Evidence provider interface/capability states | ADD-R2 | Base health requirements do not fully define the provider interface/state vocabulary. |
| 2.4 Central sampling coordinator | BASE + ADD-R2 | `ACT-*`, `CAD-*`, `BLE-ENV-011`; add the central no-provider-max-rate-forever rule explicitly. |
| 2.5 Separate durable Evidence Journal | BASE + ADD-R2 | `DUR-*` covers durability, but separate encrypted evidence journal/priorities need explicit current IDs. |
| 2.6 Evidence protocol | BASE + ADD-R2 | `PKT-*`, `SEC-*`, `DUR-*`; add separate versioned/length-bounded/signed/replay-safe/fuzzed evidence-batch protocol contract. |
| 2.7 Backend evidence schema foundation | BASE + ADD-R2 | `STORE-*`, Atlas/Witness/command/smoothing families cover semantics; add explicit required evidence/model/index storage foundation. |

## Phase 3 — Motion / odometry / particles

| Section | Coverage | Mapping / decision |
|---|---|---|
| 3.1 Sensor engine expansion | BASE | `DR-*`, `ODO-*`, `MAG-*`, `ACT-*`. |
| 3.2 Per-sensor health | BASE + ADD-R2 | `HEALTH-*` generic; add explicit missing/stale/impossible/starvation/timestamp-regression sensor-health requirements. |
| 3.3 Learned inertial odometry | BASE | `ODO-001..007`. |
| 3.4 Dynamic stride | BASE | `ODO-004`. |
| 3.5 Zero velocity | BASE | `ODO-005`. |
| 3.6 Particle state | BASE + ADD-R2 | `PF-*` covers behavior; add canonical internal particle-state fields if retained as architecture contract. |
| 3.7 Motion propagation | BASE | `PF-002`, `ODO-*`. |
| 3.8 Map constraints | BASE | `PF-003`, `ODO-006`. |
| 3.9 Local route graph | BASE + ADD-R2 | Route constraints exist, but local/offline route graph and 'do not require Cloudflare for every particle' need explicit mapping. |
| 3.10 Physical landmarks | BASE | `LAND-*`. |
| 3.11 Geomagnetic sequences | BASE | `MAG-*`. |
| 3.12 Honest particle output | BASE | `PF-004..006`, `EVD-009..016`, `DEG-*`. |

## Phase 4 — Environmental Atlas / Signal Trust

All named Phase 4 subsections are materially represented in the base ledger:

- 4.1 Wi-Fi → `WIFI-*`
- 4.2 common SSID → `WIFI-009`, `TRUST-*`
- 4.3 BLE → `BLE-ENV-*`
- 4.4 LAN → `LAN-*`
- 4.5 cellular → `CELL-*`
- 4.6 GNSS-sky → `GNSS-ATL-*`
- 4.7 network context → `NET-ATL-*`
- 4.8 companions → `COMP-*`
- 4.9 arrival/departure sequences → `ARR-*`
- 4.10 place/zone/floor → `ZONE-*`, `PLACE-*`
- 4.11 Signal Trust → `TRUST-*`, `IND-*`
- 4.12 negative evidence → `NEG-001`
- 4.13 decay/relearning → `RELEARN-001`, `PLACE-005`, `RADIO-005`
- 4.14 privacy → `PRIV-ATL-*`

Coverage: `BASE`.

## Phase 5 — Unified fusion / external observations

Sections 5.1–5.10 are materially covered by existing `EVD-*`, `FUS-*`, `PLACE-*`, `RADIO-*`, `WIFI-SEM-*`, `RTT-*`, `WIT-*`, `GROUND-*`, `RNG-*`, and `SMOOTH-*` families.

5.11 Measured Position Continuity + Active Reacquisition is `AMEND` via `REACQ-001..009`.

## Phase 6 — Privileged control

| Section | Coverage | Mapping / decision |
|---|---|---|
| 6.1 one-shot Device Owner Location | AMEND | `LOC1S-*`; old persistent-state rows superseded. |
| 6.2 command completion/child override | AMEND | `LOC1S-*`, `PLOCUI-*`. |
| 6.2A scheduled one-shot Wi-Fi | AMEND | `WIFICTL-*`. |
| 6.3 command protocol | BASE + ADD-R2 | `CMD-*` covers security properties; add exact command/result field and duplicate/expiry/wrong-device semantics. |
| 6.4 Shizuku bridge allowlist | BASE + ADD-R2 | `SHZ-*`, `CMD-*`; explicitly capture complete allowed capability set including BLE evidence. |
| 6.5 Location-OFF Wi-Fi experiment | BASE | `SHZ-003..006`, `TST-031`. |
| 6.6 Location-OFF BLE experiment | ADD-R2 | Qualification exists in `TST-030`; add source capability requirement rather than test-only coverage. |
| 6.7 privileged cellular | BASE | `SHZ-007`, `CELL-*`. |
| 6.8 diagnostics | BASE | `SHZ-008`. |
| 6.9 approved repairs | BASE | `SHZ-009`, `CMD-*`. |
| 6.10 Shizuku lifecycle failure | BASE | `SHZ-001`, `SHZ-006`, `SHZ-010..014`. |
| 6.11 quiet notification/disclosure | AMEND | `NOTIFY2-*`. |
| 6.12 SOS emergency mode | BASE | `SOS-PRIV-*`. |
| 6.13 Maintenance / Deep Off / deprovision | AMEND | `MAINT-*`, `DEEPOFF-*`, `DEPROV-*`. |

## Phase 7 — Cloud / history / UI

| Section | Coverage | Mapping / decision |
|---|---|---|
| 7.1 backend responsibilities | BASE | `DO-*`, `STORE-*`, `Q-*`, `WS-*`, Atlas/Witness/command/history families. |
| 7.1A Fast Live Path | AMEND | `LIVE-*`. |
| 7.1B detailed Singapore map | AMEND + ADD-R2 | `MAPSG-*`; add explicit responsive/zoom-focus/map-acceptance details not yet atomic. |
| 7.1C OneMap auth boundary | AMEND + ADD-R2 | `ONEMAP-*`; add explicit authenticated service list and exact three-day/300-per-minute constraints where not yet fully atomic. |
| 7.2 history | BASE | `HIST-*`, `RAW-*`, `SMOOTH-*`, `EVD-*`. |
| 7.3 playback | BASE | `PLAY-*`. |
| 7.4 route simplification | BASE | `ROUTE-DISP-*`. |
| 7.5 trip/geofence systems | BASE + ADD-R2 | `TRIP-*`, `STOP-*`, `GEO-*`; add source-quality protection against degraded estimated points creating false geofence events. |
| 7.6 degraded-position UI | BASE | `DEG-*`. |
| 7.7 evidence explanation | BASE | `EVD-012/013`, `DEG-008`, `CONF-*`. |
| 7.8 parent Location presentation | AMEND | `PLOCUI-*`, `LOC1S-*`. |
| 7.9 Device/Position/provider health | BASE | `HEALTH-*`, `ATL-HLTH-001`, `SHZ-010`, `RTT-004`. |
| 7.10 child UI | BASE | `CUI-*`. |

## Phase 8 — Hardening

| Section | Coverage | Mapping / decision |
|---|---|---|
| 8.1 reliability regression | BASE | `DUR-*`, `Q-*`, `SUP-*`, `FAIL-*`. |
| 8.2 evidence backlog priority | BASE + ADD-R2 | Existing safety-priority rules; add exact SOS > critical safety > location > health > evidence > diagnostics order. |
| 8.3 storage-pressure stress | BASE + ADD-R2 | `DUR-003`, `TST-018`; add 1/7/14-day + very-large-evidence + low-storage + abrupt-write-death/no-corruption acceptance. |
| 8.4 provider crash isolation | BASE + ADD-R2 | Architecture invariant exists; add named provider/worker crash matrix. |
| 8.5 security | BASE | `SEC-*`, `CMD-*`, `PAIR-*`, `WAF-*`, privacy/non-goals. |
| 8.6 privacy | BASE | `PRIV-*`, `PRIV-ATL-*`, revocation/crash requirements. |
| 8.7 destructive backup restore | BASE | `BAK-002`. |
| 8.8 battery optimization/removal | BASE + ADD-R2 | Product objective covers value-over-feature-count; add measured keep/tune/remove decision rule. |
| 8.9 performance measurement | ADD-R2 | Add exact CPU/RAM/wakeups/sensors/Wi-Fi/BLE/DB/data/Worker/D1/Queue/R2 metric set. |

## Phase 9 — Release / physical qualification

| Section | Coverage | Mapping / decision |
|---|---|---|
| 9.1 production APK/signing | ADD-R2 | Stable signing/release-build identity requirements are not fully represented in base ledger. |
| 9.2 final APK inspection | ADD-R2 | Add packaged manifest/permissions/export/package/version/cert/network/dependency/service/receiver verification. |
| 9.3 exact matching backend | ADD-R2 | Add Android/backend/schema/protocol/map/Atlas/dashboard release identity linkage. |
| 9.4 full authenticated browser test | BASE + ADD-R2 | Functional families exist; add explicit production-browser acceptance matrix. |
| 9.5 original endurance | BASE | `TST-001..022`, `TST-037`, `FAIL-*`. |
| 9.6 Atlas qualification | BASE | `TST-023..036` materially covers it. |
| 9.7 Location-OFF qualification | BASE + ADD-R2 | Core component tests exist; add exact known/unknown route/indoor/Home/School and with/without evidence matrix. |
| 9.7A reversible control/latency/notifications | AMEND | `QUALREV-*`; exact 'both target OPPO profiles' needs atomic addition. |
| 9.8 Witness qualification | BASE + ADD-R2 | `WIT-*` gives behavior; add explicit acceptance scenario matrix if not represented one-for-one. |
| 9.9 Ground Network qualification | BASE + ADD-R2 | `GROUND-*` gives behavior; add explicit receiver failure/replay/duplicate/connectivity scenario matrix. |
| 9.10 zero manual intervention | BASE | `TST-037`, `OBJ-002`, `FAIL-*`. |
| 9.11 release classification | ADD-R2 | Before completion = RELEASE CANDIDATE; only after Phase 9 = PRODUCTION QUALIFIED. |

## Source gaps discovered while mapping

- `P8A-GAP-001`: later references to `HIGH-fall` / `fall events` lack a recovered atomic feature definition.
- `P8A-GAP-002`: exact numeric 23R P95 latency threshold has not been recovered; do not invent it.

## Current conclusion

The canonical base ledger is broad and substantially covers the original/expanded V1 design, but the latest master plan contains additional architecture, operations, map/control and release details that must become atomic requirements before Phase 8A can pass. Those `ADD-R2` items are being converted into a second amendment ledger rather than being hand-waved as 'covered enough'.
