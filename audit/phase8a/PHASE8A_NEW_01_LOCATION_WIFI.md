# Brick V1 — Phase 8A Final New Requirements — LOCATION / WIFI

Total: **10**.

## `LOC1S-003` — No persistent parent desired Location state

**Class/Profile:** `MANDATORY` / `SEC`
**Requirement:** Normal Brick V1 must not create or use parentDesiredLocationState (or an equivalent persistent desired-state loop) to keep Location ON/OFF after a one-shot parent command has completed.
**Source:** SRC-001 §6.1-6.2
**Target phase:** 6
**Owner:** Device Owner / command state
**Dependencies:** DPM-002 amended + SHZ-008/009 amended + SEC command auth
**Audit owner:** 8C/8E/8F
**Expected tests:** static/config/package review + authenticated/unauthenticated adversarial tests
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `LOC1S-004` — No normal Location configuration lock

**Class/Profile:** `MANDATORY` / `SEC`
**Requirement:** Normal Brick V1 must not apply DISALLOW_CONFIG_LOCATION or an equivalent persistent policy that removes the child's ordinary Location control for the one-shot parent Location feature.
**Source:** SRC-001 §6.1; §9.7A
**Target phase:** 6
**Owner:** Device Owner / policy
**Dependencies:** DPM-002 amended + SHZ-008/009 amended + SEC command auth
**Audit owner:** 8C/8F
**Expected tests:** static/config/package review + authenticated/unauthenticated adversarial tests
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `WIFICTL-001` — Scheduled Wi-Fi is one-shot

**Class/Profile:** `MANDATORY` / `FEAT`
**Requirement:** Bedtime/morning Wi-Fi schedules execute as local one-shot actions and never create a persistent desired Wi-Fi state.
**Source:** SRC-001 §6.2A
**Target phase:** 6
**Owner:** Device Owner / Wi-Fi schedule
**Dependencies:** DPM-* + SEC command/policy rules + local scheduler + SAFE-*
**Audit owner:** 8C/8E/8F
**Expected tests:** unit where useful + integration + reachability + real-device if platform-dependent
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `WIFICTL-002` — Capability-gated Wi-Fi actuator

**Class/Profile:** `MANDATORY` / `FEAT`
**Requirement:** Device Owner may toggle Wi-Fi only where the tested target platform permits; Brick verifies the resulting actual Wi-Fi state and records the result.
**Source:** SRC-001 §6.2A
**Target phase:** 6
**Owner:** Device Owner / Wi-Fi schedule
**Dependencies:** DPM-* + SEC command/policy rules + local scheduler + SAFE-*
**Audit owner:** 8C/8E/8F
**Expected tests:** unit where useful + integration + reachability + real-device if platform-dependent
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `WIFICTL-003` — No normal Wi-Fi configuration lock

**Class/Profile:** `MANDATORY` / `SEC`
**Requirement:** Scheduled Wi-Fi control must not apply DISALLOW_CHANGE_WIFI_STATE or an equivalent persistent lock for normal V1 operation.
**Source:** SRC-001 §6.2A
**Target phase:** 6
**Owner:** Device Owner / Wi-Fi schedule
**Dependencies:** DPM-* + SEC command/policy rules + local scheduler + SAFE-*
**Audit owner:** 8C/8E/8F
**Expected tests:** static/config/package review + authenticated/unauthenticated adversarial tests
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `WIFICTL-004` — Child Wi-Fi override wins

**Class/Profile:** `MANDATORY` / `FEAT`
**Requirement:** After a scheduled Wi-Fi action completes, a later deliberate child/user Wi-Fi toggle is legitimate current state and Brick does not force the schedule result back.
**Source:** SRC-001 §6.2A
**Target phase:** 6
**Owner:** Device Owner / Wi-Fi schedule
**Dependencies:** DPM-* + SEC command/policy rules + local scheduler + SAFE-*
**Audit owner:** 8C/8E/8F
**Expected tests:** unit where useful + integration + reachability + real-device if platform-dependent
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `WIFICTL-005` — Offline/reboot schedule durability

**Class/Profile:** `MANDATORY` / `REL`
**Requirement:** Wi-Fi schedules persist locally for offline execution and are restored correctly across reboot and time-zone change.
**Source:** SRC-001 §6.2A
**Target phase:** 6
**Owner:** Device Owner / Wi-Fi schedule
**Dependencies:** DPM-* + SEC command/policy rules + local scheduler + SAFE-*
**Audit owner:** 8C/8E/8F
**Expected tests:** fault injection + repair/verify/escalation + repeated failure/reboot/offline containment
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `WIFICTL-006` — Stale missed trigger suppression

**Class/Profile:** `MANDATORY` / `REL`
**Requirement:** A missed Wi-Fi schedule trigger outside the configured grace window is skipped rather than replayed blindly later.
**Source:** SRC-001 §6.2A
**Target phase:** 6
**Owner:** Device Owner / Wi-Fi schedule
**Dependencies:** DPM-* + SEC command/policy rules + local scheduler + SAFE-*
**Audit owner:** 8C/8E/8F
**Expected tests:** fault injection + repair/verify/escalation + repeated failure/reboot/offline containment
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `WIFICTL-007` — Safety defers scheduled Wi-Fi off

**Class/Profile:** `MANDATORY` / `SAFE`
**Requirement:** Scheduled Wi-Fi OFF is deferred while SOS or HIGH-fall critical emergency handling is active.
**Source:** SRC-001 §6.2A
**Target phase:** 6
**Owner:** Device Owner / Wi-Fi schedule
**Dependencies:** DPM-* + SEC command/policy rules + local scheduler + SAFE-*
**Audit owner:** 8C/8E/8F
**Expected tests:** safety-event priority/durability/offline/reboot/parent-delivery tests
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `WIFICTL-008` — Phone-confirmed Wi-Fi result

**Class/Profile:** `MANDATORY` / `UI`
**Requirement:** Parent UI changes the scheduled Wi-Fi action result/state only after the phone verifies and reports the actual resulting Wi-Fi state.
**Source:** SRC-001 §6.2A
**Target phase:** 6
**Owner:** Device Owner / Wi-Fi schedule
**Dependencies:** DPM-* + SEC command/policy rules + local scheduler + SAFE-*
**Audit owner:** 8C/8E/8F
**Expected tests:** browser/device UI state matrix + integration + stale/offline/error states
**Field test:** YES OR TARGET-HARDWARE DEPENDENT
