# Brick V1 — Phase 8A Final New Requirements — MAINT

Total: **7**.

## `MAINT-001` — Local-only Maintenance & Recovery Console

**Class/Profile:** `MANDATORY` / `FEAT`
**Requirement:** Provide a local-only Maintenance & Recovery Console for authorised maintenance/recovery work.
**Source:** SRC-001 §6.13
**Target phase:** 6
**Owner:** Maintenance / recovery
**Dependencies:** DPM/SHZ policy state + truthful REL health + SEC privacy
**Audit owner:** 8C/8F
**Expected tests:** unit where useful + integration + reachability + real-device if platform-dependent
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `MAINT-002` — Hidden maintenance entry sequence

**Class/Profile:** `MANDATORY` / `SEC`
**Requirement:** Maintenance entry is exactly seven logo taps, wait at least ten seconds, then one further logo tap inside the armed window.
**Source:** SRC-001 §6.13
**Target phase:** 6
**Owner:** Maintenance / recovery
**Dependencies:** DPM/SHZ policy state + truthful REL health + SEC privacy
**Audit owner:** 8C/8F
**Expected tests:** static/config/package review + authenticated/unauthenticated adversarial tests
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `MAINT-003` — Maintenance entry has no backend secret

**Class/Profile:** `MANDATORY` / `SEC`
**Requirement:** Maintenance entry uses no PIN, key or backend dependency; invalid sequences reset silently.
**Source:** SRC-001 §6.13
**Target phase:** 6
**Owner:** Maintenance / recovery
**Dependencies:** DPM/SHZ policy state + truthful REL health + SEC privacy
**Audit owner:** 8C/8F
**Expected tests:** static/config/package review + authenticated/unauthenticated adversarial tests
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `MAINT-004` — Truthful maintenance state timeline

**Class/Profile:** `MANDATORY` / `UI`
**Requirement:** The console exposes truthful subsystem/device-policy state and a System State Timeline rather than hard-coded health.
**Source:** SRC-001 §6.13
**Target phase:** 6
**Owner:** Maintenance / recovery
**Dependencies:** DPM/SHZ policy state + truthful REL health + SEC privacy
**Audit owner:** 8C/8F
**Expected tests:** browser/device UI state matrix + integration + stale/offline/error states
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `MAINT-005` — Maintenance actions preserve user override

**Class/Profile:** `MANDATORY` / `FEAT`
**Requirement:** Any one-shot Location/Wi-Fi/future supported radio action launched through maintenance preserves the rule that a later child/user toggle wins after the action completes.
**Source:** SRC-001 §6.13
**Target phase:** 6
**Owner:** Maintenance / recovery
**Dependencies:** DPM/SHZ policy state + truthful REL health + SEC privacy
**Audit owner:** 8C/8F
**Expected tests:** unit where useful + integration + reachability + real-device if platform-dependent
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `MAINT-006` — Future mobile-data/SIM actuators capability-gated

**Class/Profile:** `MANDATORY` / `OPT`
**Requirement:** Mobile-data and SIM/radio actuators remain disabled/capability-gated until separately proven on each real target OPPO; unsupported capability is reported honestly.
**Source:** SRC-001 §6.13
**Target phase:** 6
**Owner:** Maintenance / recovery
**Dependencies:** DPM/SHZ policy state + truthful REL health + SEC privacy
**Audit owner:** 8C/8F
**Expected tests:** runtime capability detection + supported end-to-end or VERIFIED UNSUPPORTED on each target device
**Field test:** YES

## `MAINT-007` — Privacy-reduced diagnostic export

**Class/Profile:** `MANDATORY` / `SEC`
**Requirement:** Maintenance diagnostic export is privacy-reduced and excludes unnecessary raw child location/radio identifiers/secrets.
**Source:** SRC-001 §6.13
**Target phase:** 6
**Owner:** Maintenance / recovery
**Dependencies:** DPM/SHZ policy state + truthful REL health + SEC privacy
**Audit owner:** 8C/8F
**Expected tests:** static/config/package review + authenticated/unauthenticated adversarial tests
**Field test:** YES OR TARGET-HARDWARE DEPENDENT
