# Brick V1 — Phase 8A Contract Conflict Ledger

Contract conflicts are resolved from approved source precedence, not from current implementation convenience.

Status meanings:

- `RESOLVED — SUPERSEDED`: older wording is historical and must not be audited as current behavior.
- `RESOLVED — AMENDED`: the older requirement remains materially relevant but later wording changes its exact semantics.
- `RESOLVED CONTRACT / IMPLEMENTATION CHECK PENDING`: current contract is clear; Phase 8B must determine whether implementation matches it.
- `OPEN`: contract truth is still genuinely unresolved.

---

## P8A-C001 — Persistent desired Location state vs one-shot control

**Older requirement:** Phase 1 ledger `LOCCTL-001..005` describes persistent desired Location ON/OFF and repair behavior; `MGT-003` allows restricting Location configuration while desired policy is ON.

**Later approved requirement:** parent Location control is one-shot. Device Owner applies ON/OFF, verifies actual Android state, reports the result, then stops enforcing. `parentDesiredLocationState` must not be created. `DISALLOW_CONFIG_LOCATION` must not be applied during normal V1 operation. A later child/user toggle wins.

**Resolution:** `RESOLVED — SUPERSEDED`.

Phase 8B must verify there is no surviving enforcement/repair loop that reverses a legitimate later child toggle.

---

## P8A-C002 — Separate Brick `GPS on` notification vs consolidated quiet FGS notification

**Older requirement:** Phase 1/checklist material includes a distinct Brick GPS-on status concept.

**Later approved requirement:** an ordinary one-shot Location command should not create a separate Brick GPS-on notification. When continuous background location legally requires foreground-service visibility, use one consolidated minimum-compliant notification: low importance, silent, no vibration, no heads-up and no per-position repost. Required Android/ColorOS/device-policy disclosures must not be hidden.

**Resolution:** `RESOLVED — SUPERSEDED` where older wording requires a second standalone GPS-status notification.

The current requirement is one minimum-compliant consolidated Brick foreground-service notification where Android requires it, not a layered second GPS-status notification.

---

## P8A-C003 — Legacy three-stage beta retirement vs current Maintenance/Deep Off/five-phase deprovisioner

**Older requirement/implementation contract:** legacy Phase 8 hardening defines:

`DISARMED -> MANAGEMENT_RELEASED -> UNINSTALL_REQUESTED`.

**Later approved requirement:** V1 includes a local Maintenance & Recovery Console, durable Deep Off snapshot/provenance semantics, Policy Ledger, restoration rules, and a five-phase deprovisioner:

`AUTHORISE/FREEZE -> QUIESCE -> UNDO DEVICE MANAGEMENT -> PURGE BRICK -> UNINSTALL`.

**Resolution:** `RESOLVED CONTRACT / IMPLEMENTATION CHECK PENDING`.

The older state machine may still be useful as a lower-level implementation/test escape path, but it is not assumed equivalent. Phase 8B must prove all current Deep Off/deprovision requirements or report gaps.

---

## P8A-C004 — OSM/self-hosted primary map wording vs current OneMap-first Singapore map architecture

**Older requirement:** Phase 1 and checklist rows such as older `PORT-007/031` wording describe OSM-derived/private map/address infrastructure as the primary V1 direction.

**Later approved requirement:** MapLibre remains the renderer, OneMap high-detail/current supported Singapore mapping is the primary basemap/enrichment architecture, and an approved OSM/Protomaps-style fallback preserves Brick overlays if OneMap fails. Authenticated OneMap enrichment is backend-owned; credentials/tokens must not ship in the APK/browser bundle; enrichment is asynchronous and cannot block live positioning.

**Resolution:** `RESOLVED — AMENDED`.

Retained privacy principles remain current: no unnecessary child/family telemetry to map providers, provider attribution preserved, live position must not depend on reverse geocoding, and fallback must preserve tracking state.

---

## P8A-C005 — Card-free development backend vs full V1 Cloudflare architecture

**Implementation evidence:** Phase 7 status explicitly records a card-free development runtime with no mandatory R2, Queue, Access/Zero Trust or Cron binding.

**Current V1 contract:** the master plan and final acceptance checklist still explicitly require the intended production responsibilities for Durable Objects, WebSockets, Queue/DLQ, D1/R2 and parent Access/authentication.

**Resolution:** `RESOLVED CONTRACT / IMPLEMENTATION CHECK PENDING`.

The card-free Phase 7 runtime is an implementation/development state, not an approved product-contract rewrite. Phase 8B must report missing/alternate production services rather than changing the contract to fit deployed code.

---

## P8A-C006 — Legacy Phase 8A/8B naming vs current six-part audit

**Older documents:** legacy Phase 8 hardening uses "Phase 8A" for Android acceptance and "Phase 8B" for cloud acceptance.

**Current audit program:**

- 8A Contract & Feature Completeness
- 8B Implementation Reality & Functional Coverage
- 8C Android Deep Audit
- 8D Cloudflare/Backend Deep Audit
- 8E Parent Portal/Browser/UX Deep Audit
- 8F End-to-End/Adversarial/Compliance

**Resolution:** `RESOLVED — SUPERSEDED NOMENCLATURE`.

Historical document headings remain historical evidence; all new audit artifacts use the current meanings.

---

## P8A-C007 — "Desired vs actual" parent wording vs one-shot command history

**Older wording:** historical Phase 7/checklist wording includes `desired/requested vs actual vs acknowledged` and in some cases `repair-pending mismatch` as if the last requested state remains enforced.

**Later approved requirement:** parent UI shows current actual Android Location, the last one-shot command, its result and confirmation time. A completed command is historical context. A later deliberate child/user toggle becomes current truth and is not a repair failure.

**Resolution:** `RESOLVED — AMENDED`.

`repair pending` is valid only for a genuinely pending/failed current command or broken subsystem, not simply because the current child-selected state differs from the historical last command.

---

## P8A-C008 — Checklist `PORT-014` stale requested/actual semantics

**Checklist wording:** `PORT-014` says portal shows requested parent Location state, actual phone state, confirmation age and repair-pending mismatch.

**Later master-plan wording:** completed one-shot command does not create persistent desired state; current actual state is authoritative after a later user toggle.

**Resolution:** `RESOLVED — AMENDED`.

Current interpretation of `PORT-014`:

- while a command is pending, requested target + actual state + age/result may be shown;
- after command completion, the command becomes history/context;
- later user state is shown as actual without automatic repair-pending status.

This is preserved explicitly because the final checklist itself contains stale wording.

---

## P8A-C009 — Checklist `SHZ-020` separate GPS-on timing vs later consolidated notification rule

**Checklist wording:** `SHZ-020` permits a separate quiet `Brick / GPS on` status if managed Location remains ON about 20 minutes or more.

**Later master-plan wording:** do not layer a second GPS-status notification on top of the one minimum-compliant foreground-service notification; ordinary one-shot commands should normally be silent.

**Resolution:** `RESOLVED — SUPERSEDED` for the separate second-notification interpretation.

Current contract does not require a standalone GPS-on notification at the 20-minute mark. If the existing consolidated foreground-service notification needs to truthfully reflect ongoing tracking/Location state, its content may do so while remaining one notification and complying with Android requirements.

---

## P8A-C010 — Checklist `REL-010` persistent `desired/internal Location` wording

**Checklist wording:** System Truth Location cross-check references Brick `desired/internal` state against Android master state and callbacks.

**Later master-plan rule:** there is no persistent desired Location state after a one-shot command completes.

**Resolution:** `RESOLVED — AMENDED`.

Current interpretation:

- during a live pending command, compare requested target to actual state;
- after completion, compare actual Android state to tracker permissions/subscription/callback/position health;
- do not manufacture a permanent desired-state mismatch from historical command data.

---

## P8A-C011 — Checklist/private OSM wording vs OneMap provider boundary

**Checklist wording:** older portal rows refer generally to a private MapLibre/OSM-derived strategy.

**Later approved rule:** OneMap is the primary supported high-detail Singapore basemap/enrichment provider, with provider-independent Brick overlays and approved OSM/Protomaps-style fallback. Authenticated OneMap credentials stay backend-side.

**Resolution:** `RESOLVED — AMENDED`.

Security/privacy intent survives; only provider priority and exact enrichment boundary change.

---

## Current conflict totals

- Identified: **11**
- Resolved at contract level: **11**
- Open contract conflicts: **0**
- Implementation-equivalence checks deferred to Phase 8B: especially P8A-C003 and P8A-C005, plus all amended rows that must be traced to production implementation.

This count remains provisional until the 469 checklist IDs and latest amendment set have been fully reconciled one-by-one.
