# Brick V1 — Phase 8A Current Amendment Overlay Map

Purpose: map the latest approved master-plan deltas over the 469-point final acceptance checklist without double-counting old/stale requirements.

Legend:

- `REPLACE` — older checklist wording is no longer current.
- `AMEND` — existing checklist requirement remains but its exact semantics are updated.
- `ADD` — latest approved requirement is not materially present in the 469 checklist and needs a current amendment ID.
- `TEST-ADD` — new mandatory acceptance test for the amended/new behavior.

This map is contract reconciliation only. It does not claim implementation exists.

---

# 1. Parent Location / Device Owner semantics

| Latest requirement | Action | Checklist rows affected |
|---|---|---|
| Parent Location ON/OFF is one-shot, not persistent desired state | REPLACE | `SHZ-007`, `SHZ-008`; AMEND `DPM-002` |
| Device Owner applies target, verifies actual state, then stops enforcing | AMEND | `DPM-002`, `SHZ-009` |
| No `parentDesiredLocationState` normal V1 enforcement | REPLACE | `SHZ-007` |
| No normal `DISALLOW_CONFIG_LOCATION` lock | REPLACE/AMEND | `DPM-003` |
| Child OFF after completed parent ON is legitimate | AMEND | `SHZ-008`, `PORT-014`, `REL-010` |
| Child ON after completed parent OFF is legitimate | AMEND | `SHZ-008`, `PORT-014`, `REL-010` |
| Repair only while command is genuinely pending/failed or Brick subsystem broken | AMEND | `SHZ-008`, `REL-017` |
| Parent shows actual state + last command/result/time, not persistent desired state | REPLACE/AMEND | `PORT-014`, `SHZ-009`, `PORT-033` |

Current canonical amendment family: `LOC1S-001..008` / `PLOCUI-001..003` until final merged-ID normalization.

---

# 2. Scheduled Wi-Fi one-shot control

The 469 checklist has no scheduled-Wi-Fi requirement family.

All are `ADD`:

- `WIFICTL-001` local bedtime/morning one-shot actions;
- `WIFICTL-002` capability-gated Device Owner actuator + actual-state verification;
- `WIFICTL-003` no normal `DISALLOW_CHANGE_WIFI_STATE`;
- `WIFICTL-004` child/user later toggle wins;
- `WIFICTL-005` schedules survive offline/reboot/time-zone change;
- `WIFICTL-006` stale missed triggers outside grace window skipped;
- `WIFICTL-007` Wi-Fi OFF deferred during SOS/HIGH-fall critical handling;
- `WIFICTL-008` parent result changes only after phone confirms actual state.

---

# 3. Measured-position continuity / active reacquisition

The 469 checklist contains measured-position trust and failure tests, but does not define the later bounded active-reacquisition state machine.

All are `ADD` or explicit strengthening:

- `REACQ-001` sampling-profile-aware freshness;
- `REACQ-002` fresh measured position outranks fallback;
- `REACQ-003` stale asynchronous fallback cannot overwrite newer measured fix;
- `REACQ-004` callback gap enters REFRESHING/reacquisition before fallback;
- `REACQ-005` verify Location/permissions/service/subscription health;
- `REACQ-006` request fresh current/fused fix + recreate stalled subscription;
- `REACQ-007` reacquisition bounded before fallback takeover;
- `REACQ-008` motion leaving stationary slow profile requests fresh positioning;
- `REACQ-009` zero false degraded transitions while acceptable measured positioning remains available.

Related existing rows retained/amended: `LOC-008`, `LOC-021/022`, `REL-017`, `QA-008`.

---

# 4. Child notification/disclosure policy

| Current requirement | Action | Checklist rows affected |
|---|---|---|
| Routine one-shot Location command creates no separate Brick GPS-on notification | REPLACE | `SHZ-020` |
| One consolidated minimum-compliant FGS notification where Android requires it | AMEND | `DPM-007`, `CUI-011`, `SHZ-021` |
| Brick-created routine FGS notification remains silent/no vibration/no heads-up/no per-fix repost | AMEND | `CUI-004`, `CUI-012`, `SHZ-021` |
| Android/ColorOS/device-policy disclosures not hidden/dismissed | RETAIN/AMEND | `CUI-011` |
| If repeated Brick policy/permission writes trigger repeated system disclosure, remove needless writes | ADD/AMEND | `CUI-011`, `REL-030/031` |

Current amendment family: `NOTIFY2-001..005`.

---

# 5. Maintenance & Recovery Console

No equivalent complete feature exists in the 469 checklist. All are `ADD`:

- `MAINT-001` local-only Maintenance & Recovery Console;
- `MAINT-002` 7 logo taps -> wait >=10 s -> one further tap in armed window;
- `MAINT-003` no PIN/key/backend dependency; invalid sequences reset silently;
- `MAINT-004` truthful subsystem/device-policy state + System State Timeline;
- `MAINT-005` maintenance one-shot controls preserve later child/user override;
- `MAINT-006` mobile-data/SIM/radio actuators capability-gated until proven per OPPO;
- `MAINT-007` privacy-reduced diagnostic export.

---

# 6. Deep Off and deprovisioning

No equivalent complete requirements exist in the 469 checklist. All are `ADD`:

`DEEPOFF-001..005`:

- durable state snapshot + provenance ledger;
- stop active Brick work;
- survive reboot/day-long power-off;
- never auto-reactivate;
- restore only Brick-caused temporary changes not superseded later by child/user/system.

`DEPROV-001..005`:

- five phases `AUTHORISE/FREEZE -> QUIESCE -> UNDO DEVICE MANAGEMENT -> PURGE BRICK -> UNINSTALL`;
- Policy Ledger;
- reverse Brick-created policies before relinquishing Device Owner;
- preserve tested test-build/Device Owner escape path;
- real-device qualification of entry, Deep Off, persistence, provenance, child override, policy reversal, Device Owner release and uninstall handoff.

Legacy three-stage Phase 8 retirement remains historical implementation evidence only.

---

# 7. Fast Live Path

Existing checklist rows `BE-005`, `BE-006`, `BE-019`, `BE-020`, `PORT-029/030`, `ACT-010`, `QA-029` already require push/live separation and live cadence, but the latest master plan adds stricter pipeline semantics.

Current overlay:

- `LIVE-001` — `ADD/STRENGTHEN`: accepted fix -> local persistence -> realtime packet -> Durable Object current state -> WebSocket -> map render;
- `LIVE-002` — `AMEND`: history/Atlas/reverse-geocode/R2/route simplification/backlog cannot head-of-line block live path (`BE-006/019/020`);
- `LIVE-003` — `ADD`: instrument source age, persist time, phone send delay, backend delay, WebSocket delay and render delay;
- `LIVE-004` — `ADD`: durable history keeps required points while obsolete intermediate live renders may be coalesced when newer current state exists;
- `LIVE-005` — `TEST-ADD`: measure against approved 23R P95 budget on real devices; numeric budget remains `P8A-GAP-002` until authoritative value is recovered;
- `LIVE-006` — `AMEND`: map/enrichment failure/work cannot turn tracking into a live outage (`BE-020`).

---

# 8. Singapore map / OneMap architecture

Existing `PORT-004`, `PORT-007`, `PORT-031` establish MapLibre, readable place and map privacy, but the latest provider/design contract is materially newer.

Current overlay:

- `MAPSG-001` `AMEND PORT-004`: MapLibre remains renderer;
- `MAPSG-002` `ADD`: supported high-detail OneMap is primary Singapore basemap;
- `MAPSG-003` `ADD`: progressive zoom detail from estate/planning context through roads/transit/schools/parks to buildings/HDB/block/street detail only where supplied;
- `MAPSG-004` `ADD/STRENGTHEN`: Brick overlays remain provider-independent;
- `MAPSG-005` `ADD`: OneMap failure -> approved OSM/Protomaps-style fallback without loss of Brick state;
- `MAPSG-006` `ADD`: normal mouse/trackpad/touch pan/zoom plus +/- and Recenter/Follow;
- `MAPSG-007` `ADD`: manual pan/zoom disables forced follow until explicit recenter/follow;
- `MAPSG-008` `ADD`: live coordinate renders before asynchronous address enrichment;
- `MAPSG-009` `ADD`: stale reverse-geocode result cannot overwrite newer coordinate/address;
- `MAPSG-010` `ADD`: Detailed default; Clean optional secondary; Satellite optional licensed/tested and not V1 dependency;
- `MAPSG-011` `AMEND PORT-031/security`: provider attribution preserved; unrelated history/evidence/family telemetry not sent to provider.

Additional latest layout/acceptance details to preserve:

- selected child may focus around zoom 17-18 where appropriate;
- desktop gives map most tracking workspace plus detail/event rail; narrow screens stack/collapse;
- acceptance covers representative Singapore HDB/building labels, label density at several zooms, responsive layout, pan/zoom/recenter/follow, style switching, fallback-basemap failure, stale geocode rejection and live-path performance.

These acceptance details require current map QA IDs during final normalization; they are not allowed to disappear merely because UI implementation 'looks okay'.

---

# 9. OneMap authentication/provider boundary

No OneMap-specific requirements exist in the 469 checklist. Current `ONEMAP-*` requirements are `ADD` and are interpreted strictly from the latest master plan:

- `ONEMAP-001` token-free Basemap/Mini Map/Advanced Mini Map/Static Map path must not depend on authenticated enrichment;
- `ONEMAP-002` authenticated Search, Coordinate Converters, Reverse Geocode, Themes, Routing, Planning Area and Population Query credentials/tokens are backend-owned and never shipped to APK/parent JS;
- `ONEMAP-003` secure secret storage + approved **three-day token lifecycle** with refresh-before-expiry;
- `ONEMAP-004` bounded token refresh/retry;
- `ONEMAP-005` centralized rate limiting **below the published 300 calls/min ceiling**;
- `ONEMAP-006` coalescing/cache: 2-second Live Track must not generate 2-second reverse-geocode calls;
- `ONEMAP-007` token expiry/rate limit/enrichment outage cannot take down tracking overlays/current state and must leave token-free basemap capability independent where supported.

---

# 10. Parent Location presentation

Checklist `PORT-014` is stale and is `REPLACE/AMEND`:

- `PLOCUI-001` current actual Android Location is separate from command history;
- `PLOCUI-002` last one-shot target/result/confirmation time is historical context, not persistent desired state;
- `PLOCUI-003` later child/user state immediately becomes current truth without `repair pending` solely because it differs from historical command.

---

# 11. New reversible-control / latency / notification acceptance

The latest Phase 9.7A matrix is mandatory `TEST-ADD` and must be retained explicitly:

- `QUALREV-001` parent ON -> verified ON -> child OFF accepted;
- `QUALREV-002` parent OFF -> verified OFF -> child ON accepted;
- `QUALREV-003` no normal `DISALLOW_CONFIG_LOCATION`;
- `QUALREV-004` scheduled Wi-Fi OFF -> child enables -> remains ON;
- `QUALREV-005` scheduled Wi-Fi ON -> child disables -> remains OFF;
- `QUALREV-006` no normal `DISALLOW_CHANGE_WIFI_STATE`;
- `QUALREV-007` healthy measured Location does not falsely become ESTIMATED/COARSE/LAST_KNOWN;
- `QUALREV-008` stationary slow cadence does not falsely degrade;
- `QUALREV-009` callback/subscription stall triggers reacquisition before fallback;
- `QUALREV-010` old fallback cannot overwrite newer measured fix;
- `QUALREV-011` measured Fast Live Path P95 satisfies approved 23R budget and is not blocked by background work;
- `QUALREV-012` no separate/repeated Brick GPS-on noise;
- `QUALREV-013` remaining Location notices classified by owner: Brick vs Android/ColorOS/device policy;
- `QUALREV-014` required system disclosure remains; needless repeated Brick policy/permission writes are removed if they trigger repeat notice.

These tests are required on both target OPPO profiles under the master plan, consistent with checklist `QA-001` real-device requirement.

---

# 12. Current reconciliation result

### Checklist rows known to require replacement/amended current wording

At minimum:

- `DPM-002`
- `DPM-003`
- `SHZ-002` (remove implication that Location itself is persistently enforced)
- `SHZ-007`
- `SHZ-008`
- `SHZ-009`
- `SHZ-020`
- `SHZ-021`
- `PORT-004`
- `PORT-007`
- `PORT-014`
- `PORT-031`
- `REL-010`
- `REL-018` (Location desired/actual check interpreted only for a pending command; otherwise actual/health truth)
- relevant notification/security/map acceptance rows described above.

### Latest master-plan areas absent from the old checklist and therefore genuinely additive

- scheduled one-shot Wi-Fi;
- active measured-position reacquisition state machine;
- Maintenance & Recovery Console;
- Deep Off;
- five-phase deprovisioner/Policy Ledger;
- exact Fast Live Path pipeline/instrumentation/P95 acceptance;
- OneMap-first Singapore map/provider architecture and exact OneMap auth/rate/cache boundary;
- new reversible-control/latency/notification acceptance matrix.

## Important

This overlay map proves the latest amendments are not lost, but Phase 8A has **not yet published the final unique current requirement count**. Final normalization must assign one stable current ID to every amended/additive clause and ensure no duplicate semantic requirement is counted twice.
