# Brick V1 — Phase 8A Contract Conflict Ledger

Contract conflicts are resolved from approved source precedence, not from current implementation convenience.

Status meanings:

- `RESOLVED — SUPERSEDED`: older wording is historical and must not be audited as current behavior.
- `RESOLVED CONTRACT / IMPLEMENTATION CHECK PENDING`: current contract is clear; Phase 8B must determine whether implementation matches it.
- `OPEN`: contract truth is still genuinely unresolved.

---

## P8A-C001 — Persistent desired Location state vs one-shot control

**Older requirement:** Phase 1 ledger `LOCCTL-001..005` describes persistent desired Location ON/OFF and repair behavior; `MGT-003` allows restricting Location configuration while desired policy is ON.

**Later approved requirement:** parent Location control is one-shot. Device Owner applies ON/OFF, verifies actual Android state, reports the result, then stops enforcing. `parentDesiredLocationState` must not be created. `DISALLOW_CONFIG_LOCATION` must not be applied during normal V1 operation. A later child/user toggle wins.

**Resolution:** `RESOLVED — SUPERSEDED`.

The old persistent-desired-state semantics are historical. New current requirements must be represented by new canonical amendment IDs while the old IDs remain marked superseded for traceability.

Phase 8B must verify there is no surviving enforcement/repair loop that reverses a legitimate later child toggle.

---

## P8A-C002 — Separate Brick `GPS on` notification vs consolidated quiet FGS notification

**Older requirement:** Phase 1 ledger `NOTIF-001` requires a Brick notification with text `GPS on`; related entries define it as silent/low importance.

**Later approved requirement:** an ordinary one-shot Location command should not create a separate Brick GPS-on notification. When continuous background location legally requires foreground-service visibility, use one consolidated minimum-compliant notification: low importance, silent, no vibration, no heads-up and no per-position repost. Required Android/ColorOS/device-policy disclosures must not be hidden.

**Resolution:** `RESOLVED — SUPERSEDED`.

`NOTIF-001` is historical and must not be used as a current acceptance requirement. The consolidated notification/disclosure policy becomes current.

---

## P8A-C003 — Legacy three-stage beta retirement vs current Maintenance/Deep Off/five-phase deprovisioner

**Older requirement/implementation contract:** legacy Phase 8 hardening defines:

`DISARMED -> MANAGEMENT_RELEASED -> UNINSTALL_REQUESTED`.

**Later approved requirement:** V1 includes a local Maintenance & Recovery Console, durable Deep Off snapshot/provenance semantics, Policy Ledger, restoration rules, and a five-phase deprovisioner:

`AUTHORISE/FREEZE -> QUIESCE -> UNDO DEVICE MANAGEMENT -> PURGE BRICK -> UNINSTALL`.

**Resolution:** `RESOLVED CONTRACT / IMPLEMENTATION CHECK PENDING`.

The later five-phase/deep-off requirements are current. The older three-stage retirement mechanism may still be a valid lower-level implementation or test escape path, but Phase 8A does **not** declare it equivalent. Phase 8B must prove whether all current requirements are implemented or identify gaps.

---

## P8A-C004 — OSM/self-hosted primary map wording vs current OneMap-first Singapore map architecture

**Older requirement:** Phase 1 ledger `MAP-002` / `GEOREV-001` describes OSM-derived/private map/address infrastructure as the primary V1 direction.

**Later approved requirement:** MapLibre remains the renderer, OneMap high-detail/current supported Singapore mapping is the primary basemap/enrichment architecture, and an approved OSM/Protomaps-style fallback preserves Brick overlays if OneMap fails. Authenticated OneMap enrichment is backend-owned; credentials/tokens must not ship in the APK/browser bundle; enrichment is asynchronous and cannot block live positioning.

**Resolution:** `RESOLVED — SUPERSEDED` for the old primary-provider wording.

Retained privacy principles remain current: no unnecessary child/family telemetry to map providers, provider attribution preserved, live position must not depend on reverse geocoding, and fallback must preserve tracking state.

---

## P8A-C005 — Card-free development backend vs full V1 Cloudflare architecture

**Implementation evidence:** Phase 7 status explicitly records a card-free development runtime with no mandatory R2, Queue, Access/Zero Trust or Cron binding.

**Current V1 master-plan scope:** still explicitly includes Durable Objects, WebSockets, Queue/DLQ, D1/R2 and Access in the final V1 architecture/feature scope.

**Resolution:** `RESOLVED CONTRACT / IMPLEMENTATION CHECK PENDING`.

The card-free Phase 7 runtime is an implementation/development state, not an approved contract rewrite. Phase 8A therefore retains the full current V1 cloud requirements. Phase 8B must determine the real current implementation and report any missing/alternate services rather than quietly changing the contract.

---

## P8A-C006 — Legacy Phase 8A/8B naming vs current six-part audit

**Older documents:** `PHASE8-CLOSURE.md` uses "Phase 8A" for Android acceptance and "Phase 8B" for cloud acceptance.

**Current audit program:**

- 8A Contract & Feature Completeness
- 8B Implementation Reality & Functional Coverage
- 8C Android Deep Audit
- 8D Cloudflare/Backend Deep Audit
- 8E Parent Portal/Browser/UX Deep Audit
- 8F End-to-End/Adversarial/Compliance

**Resolution:** `RESOLVED — SUPERSEDED NOMENCLATURE`.

Historical document headings remain unchanged as historical evidence, but all new audit artifacts use the current six-part meaning.

---

## P8A-C007 — "Desired vs actual" parent wording vs one-shot command history

**Older UI wording:** some Phase 7 evidence refers to "desired vs actual vs acknowledged Location".

**Later approved requirement:** parent UI shows current actual Android Location, last parent command, command result and confirmation time. A completed command is historical context, not persistent desired state.

**Resolution:** `RESOLVED — SUPERSEDED WORDING`.

Current portal contract must not imply that a completed command remains an enforced desired state.

---

## Current conflict totals

- Identified: 7
- Resolved at contract level: 7
- Open contract conflicts: 0
- Implementation-equivalence checks deferred to Phase 8B: P8A-C003, P8A-C005 and any future implementation conflicts discovered during 8A source reconciliation.

This count is provisional until every registered requirement source has been reconciled.
