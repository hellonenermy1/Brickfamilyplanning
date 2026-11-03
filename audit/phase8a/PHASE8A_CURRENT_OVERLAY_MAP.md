# Brick V1 — Phase 8A Final Amendment Overlay Map

Status: **FINAL / PASS**

Purpose: show exactly how the latest approved master-plan deltas modify the 469-point acceptance-checklist baseline without double-counting stale requirements.

## Normalization result

- Baseline checklist IDs: 469
- Fully superseded historical rows: 3
- Current baseline rows after supersession: 466
- Existing baseline IDs with amended current wording: 14
- Genuinely additive new requirements: 59
- Final current unique requirements: **525**

## Fully superseded baseline rows

- `DPM-003` — persistent prevention of child Location changes.
- `SHZ-007` — persistent `parentDesiredLocationState` contract.
- `SHZ-020` — separate standalone GPS-on status timing contract.

## Amended existing IDs

Current wording is frozen in `PHASE8A_AMENDED_EXISTING_REQUIREMENTS.md` for:

`DPM-002`, `LOC-008`, `FUS-001`, `SHZ-002`, `SHZ-008`, `SHZ-009`, `SHZ-021`, `REL-010`, `REL-018`, `PORT-004`, `PORT-007`, `PORT-014`, `PORT-031`, `BE-006`.

## Genuinely additive families

### Location one-shot control

- `LOC1S-003` — no persistent parent desired Location state.
- `LOC1S-004` — no normal `DISALLOW_CONFIG_LOCATION` lock.

One-shot actuator, actual-state confirmation and later child override semantics are also carried by amended `DPM-002`, `SHZ-008`, `SHZ-009`, `PORT-014`, `REL-010/018`.

### Scheduled Wi-Fi

`WIFICTL-001..008` — one-shot schedule, capability-gated actuation, no persistent Wi-Fi lock, child override, offline/reboot/time-zone durability, stale-trigger suppression, SOS/HIGH-fall deferral, phone-confirmed result.

### Active reacquisition

`REACQ-003..009` — old fallback cannot overwrite newer measurement, active callback-gap reacquisition, health checks, fresh-fix/subscription repair, bounded retry, immediate wake from stationary cadence, zero-false-degraded qualification.

Sampling-aware freshness and measured-over-fallback priority are carried by amended `LOC-008` and `FUS-001`.

### Notification/disclosure

- `NOTIFY2-001` — no separate Brick GPS-on notification for ordinary one-shot control.
- `NOTIFY2-005` — remove needless repeated Brick writes that trigger repeated platform disclosure rather than suppressing required disclosures.

Consolidated silent notification semantics are also carried by amended `SHZ-021` and existing CUI/DPM requirements.

### Maintenance / Deep Off / deprovisioning

- `MAINT-001..007`
- `DEEPOFF-001..005`
- `DEPROV-001..005`

These add the hidden local Maintenance & Recovery Console, truthful state timeline, privacy-reduced export, durable provenance-aware Deep Off and the five-stage final deprovisioner/Policy Ledger.

### Fast Live Path

- `LIVE-001` — exact end-to-end Fast Live path.
- `LIVE-003` — stage instrumentation.
- `LIVE-004` — live-render coalescing without durable-history loss.
- `LIVE-005` — numeric P95 qualification.

Background-work isolation is also carried by amended `BE-006` and existing backend/live requirements.

Current 23R budgets from `PHASE8A_23R_LATENCY_AMENDMENT.md`:

- accepted current fix -> visible parent marker P95 <= **1.5 s**;
- backend current state -> visible parent marker P95 <= **500 ms**;
- Live Track activation -> phone fast-mode confirmation/explicit failure P95 <= **2.0 s**.

### Singapore map

`MAPSG-002..010`, `MAPSG-012`, `MAPSG-013` add OneMap-first Singapore basemap behavior, progressive real provider detail, provider-independent Brick overlays, fallback map continuity, pan/zoom/recenter/follow behavior, asynchronous/stale-safe address enrichment, style policy, responsive workspace and reliable Singapore address fields.

MapLibre renderer/privacy/readable-place semantics are carried by amended `PORT-004`, `PORT-007`, `PORT-031`.

### OneMap provider boundary

`ONEMAP-001..007` — separate token-free/authenticated paths, backend-owned credentials, three-day token lifecycle, bounded retry, central rate limiting below 300 calls/min, enrichment coalescing/cache and outage isolation.

### Explicit work priority

`PRIO-001` — `SOS > Critical safety > Location > Health > Evidence learning > Diagnostics`.

## Acceptance-only matrices

Several latest-plan clauses are test scenarios rather than separate product requirements. They are frozen in `PHASE8A_ACCEPTANCE_MATRICES.md`, including:

- all-screen state matrix;
- Singapore map matrix;
- backlog/storage priority matrix;
- full authenticated parent-browser matrix;
- reversible control / latency / notification matrix;
- Witness matrix;
- Ground Network matrix;
- zero-manual-intervention closure rule.

## Final result

- Duplicate current IDs: 0
- Exact duplicate current texts: 0
- Unmapped latest-plan subsections: 0
- Open contract conflicts: 0
- Open source gaps: 0
- Current unique V1 requirements: **525**

**OVERLAY RECONCILIATION: PASS**
