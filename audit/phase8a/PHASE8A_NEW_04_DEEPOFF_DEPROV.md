# Brick V1 — Phase 8A Final New Requirements — DEEPOFF / DEPROV

Total: **10**.

## `DEEPOFF-001` — Deep Off snapshot and provenance

**Class/Profile:** `MANDATORY` / `DATA`
**Requirement:** Before/while entering Deep Off, Brick creates a durable state snapshot plus provenance ledger sufficient to distinguish Brick-caused temporary changes from later user/system changes.
**Source:** SRC-001 §6.13
**Target phase:** 6
**Owner:** Maintenance / deprovisioning
**Dependencies:** MAINT-* + Policy Ledger + durable config/state storage
**Audit owner:** 8C/8F
**Expected tests:** transaction/crash/corruption/retention/reconciliation tests
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `DEEPOFF-002` — Deep Off quiesces Brick

**Class/Profile:** `MANDATORY` / `FEAT`
**Requirement:** Deep Off stops all active Brick work required by the contract to quiesce the system rather than merely hiding the UI.
**Source:** SRC-001 §6.13
**Target phase:** 6
**Owner:** Maintenance / deprovisioning
**Dependencies:** MAINT-* + Policy Ledger + durable config/state storage
**Audit owner:** 8C/8F
**Expected tests:** unit where useful + integration + reachability + real-device if platform-dependent
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `DEEPOFF-003` — Deep Off survives reboot/power-off

**Class/Profile:** `MANDATORY` / `REL`
**Requirement:** Deep Off remains quiesced across reboot and day-long power-off without silently reactivating Brick.
**Source:** SRC-001 §6.13
**Target phase:** 6
**Owner:** Maintenance / deprovisioning
**Dependencies:** MAINT-* + Policy Ledger + durable config/state storage
**Audit owner:** 8C/8F
**Expected tests:** fault injection + repair/verify/escalation + repeated failure/reboot/offline containment
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `DEEPOFF-004` — Deep Off never auto-reactivates

**Class/Profile:** `MANDATORY` / `REL`
**Requirement:** Deep Off never auto-reactivates without the explicit authorised reactivation path.
**Source:** SRC-001 §6.13
**Target phase:** 6
**Owner:** Maintenance / deprovisioning
**Dependencies:** MAINT-* + Policy Ledger + durable config/state storage
**Audit owner:** 8C/8F
**Expected tests:** fault injection + repair/verify/escalation + repeated failure/reboot/offline containment
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `DEEPOFF-005` — Provenance-aware reactivation

**Class/Profile:** `MANDATORY` / `DATA`
**Requirement:** Reactivation restores only Brick-caused temporary changes that have not been superseded by later child/user/system changes.
**Source:** SRC-001 §6.13
**Target phase:** 6
**Owner:** Maintenance / deprovisioning
**Dependencies:** MAINT-* + Policy Ledger + durable config/state storage
**Audit owner:** 8C/8F
**Expected tests:** transaction/crash/corruption/retention/reconciliation tests
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `DEPROV-001` — Five-phase deprovisioner

**Class/Profile:** `MANDATORY` / `FEAT`
**Requirement:** Final deprovisioning follows AUTHORISE/FREEZE -> QUIESCE -> UNDO DEVICE MANAGEMENT -> PURGE BRICK -> UNINSTALL.
**Source:** SRC-001 §6.13
**Target phase:** 6
**Owner:** Maintenance / deprovisioning
**Dependencies:** DEEPOFF-* + DPM ownership/policy state + Policy Ledger
**Audit owner:** 8C/8F
**Expected tests:** unit where useful + integration + reachability + real-device if platform-dependent
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `DEPROV-002` — Policy Ledger

**Class/Profile:** `MANDATORY` / `DATA`
**Requirement:** Brick maintains a Policy Ledger for Brick-created policy changes needed for safe reversal/deprovisioning.
**Source:** SRC-001 §6.13
**Target phase:** 6
**Owner:** Maintenance / deprovisioning
**Dependencies:** DEEPOFF-* + DPM ownership/policy state + Policy Ledger
**Audit owner:** 8C/8F
**Expected tests:** transaction/crash/corruption/retention/reconciliation tests
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `DEPROV-003` — Reverse Brick policies before ownership release

**Class/Profile:** `MANDATORY` / `FEAT`
**Requirement:** Brick reverses applicable Brick-created policies before relinquishing Device Owner/management ownership.
**Source:** SRC-001 §6.13
**Target phase:** 6
**Owner:** Maintenance / deprovisioning
**Dependencies:** DEEPOFF-* + DPM ownership/policy state + Policy Ledger
**Audit owner:** 8C/8F
**Expected tests:** unit where useful + integration + reachability + real-device if platform-dependent
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `DEPROV-004` — Device Owner escape path must exist

**Class/Profile:** `MANDATORY` / `TEST`
**Requirement:** A tested test-build/Device Owner escape path must remain available; qualification fails if the path is unavailable.
**Source:** SRC-001 §6.13
**Target phase:** 6
**Owner:** Maintenance / deprovisioning
**Dependencies:** DEEPOFF-* + DPM ownership/policy state + Policy Ledger
**Audit owner:** 8C/8F
**Expected tests:** the named exact production-like scenario with timestamped expected-vs-actual evidence
**Field test:** YES

## `DEPROV-005` — Deprovision real-device qualification

**Class/Profile:** `MANDATORY` / `TEST`
**Requirement:** Real-device qualification covers hidden entry, Deep Off idle behavior, reboot persistence, state restoration/provenance, child override, policy reversal, Device Owner release and final uninstall handoff.
**Source:** SRC-001 §6.13
**Target phase:** 6
**Owner:** Maintenance / deprovisioning
**Dependencies:** DEEPOFF-* + DPM ownership/policy state + Policy Ledger
**Audit owner:** 8C/8F
**Expected tests:** the named exact production-like scenario with timestamped expected-vs-actual evidence
**Field test:** YES
