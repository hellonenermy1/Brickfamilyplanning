# Brick V1 — Phase 8A Final New Requirements — REACQ / NOTIFY

Total: **9**.

## `REACQ-003` — Old fallback cannot overwrite newer measurement

**Class/Profile:** `MANDATORY` / `ALG`
**Requirement:** A fallback, Atlas, particle or coarse computation that started earlier and finishes late must not overwrite a newer accepted measured/fused position.
**Source:** SRC-001 §5.11; §9.7A
**Target phase:** 5
**Owner:** Location / fusion / supervisor
**Dependencies:** LOC-008 amended + FUS-001 amended + REL supervisor + ACT sampling
**Audit owner:** 8C/8F
**Expected tests:** deterministic/simulation + integration + adversarial evidence + real physical scenario where needed
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `REACQ-004` — Callback gap enters active reacquisition

**Class/Profile:** `MANDATORY` / `REL`
**Requirement:** An unexpected location callback/subscription gap enters an internal refresh/reacquisition path before fallback is declared authoritative.
**Source:** SRC-001 §5.11; §9.7A
**Target phase:** 5
**Owner:** Location / fusion / supervisor
**Dependencies:** LOC-008 amended + FUS-001 amended + REL supervisor + ACT sampling
**Audit owner:** 8C/8F
**Expected tests:** fault injection + repair/verify/escalation + repeated failure/reboot/offline containment
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `REACQ-005` — Reacquisition health checks

**Class/Profile:** `MANDATORY` / `REL`
**Requirement:** Active reacquisition verifies Android Location state, required permissions, tracker/service state and location-subscription health before deciding measured positioning is unavailable.
**Source:** SRC-001 §5.11; §9.7A
**Target phase:** 5
**Owner:** Location / fusion / supervisor
**Dependencies:** LOC-008 amended + FUS-001 amended + REL supervisor + ACT sampling
**Audit owner:** 8C/8F
**Expected tests:** fault injection + repair/verify/escalation + repeated failure/reboot/offline containment
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `REACQ-006` — Fresh fix and subscription repair

**Class/Profile:** `MANDATORY` / `REL`
**Requirement:** Active reacquisition requests a fresh fused/current fix and recreates a stalled location subscription where appropriate.
**Source:** SRC-001 §5.11; §9.7A
**Target phase:** 5
**Owner:** Location / fusion / supervisor
**Dependencies:** LOC-008 amended + FUS-001 amended + REL supervisor + ACT sampling
**Audit owner:** 8C/8F
**Expected tests:** fault injection + repair/verify/escalation + repeated failure/reboot/offline containment
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `REACQ-007` — Reacquisition is bounded

**Class/Profile:** `MANDATORY` / `REL`
**Requirement:** Active reacquisition is bounded by explicit timeout/retry policy; fallback begins only after reacquisition genuinely fails rather than waiting indefinitely.
**Source:** SRC-001 §5.11; §9.7A
**Target phase:** 5
**Owner:** Location / fusion / supervisor
**Dependencies:** LOC-008 amended + FUS-001 amended + REL supervisor + ACT sampling
**Audit owner:** 8C/8F
**Expected tests:** fault injection + repair/verify/escalation + repeated failure/reboot/offline containment
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `REACQ-008` — Motion exits stationary slow profile immediately

**Class/Profile:** `MANDATORY` / `ALG`
**Requirement:** When motion leaves a slow stationary profile, Brick immediately requests fresh positioning instead of waiting for the previous stationary cadence.
**Source:** SRC-001 §5.11; §9.7A
**Target phase:** 5
**Owner:** Location / fusion / supervisor
**Dependencies:** LOC-008 amended + FUS-001 amended + REL supervisor + ACT sampling
**Audit owner:** 8C/8F
**Expected tests:** deterministic/simulation + integration + adversarial evidence + real physical scenario where needed
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `REACQ-009` — No false degraded transition qualification

**Class/Profile:** `MANDATORY` / `TEST`
**Requirement:** On target devices, healthy Location ON with acceptable measured fixes for the active sampling profile must produce zero false ESTIMATED/COARSE/LAST KNOWN transitions; stationary slow sampling must not be misclassified as degradation.
**Source:** SRC-001 §5.11; §9.7A
**Target phase:** 5
**Owner:** Location / fusion / supervisor
**Dependencies:** LOC-008 amended + FUS-001 amended + REL supervisor + ACT sampling
**Audit owner:** 8C/8F
**Expected tests:** the named exact production-like scenario with timestamped expected-vs-actual evidence
**Field test:** YES

## `NOTIFY2-001` — No separate Brick GPS-on status

**Class/Profile:** `MANDATORY` / `UI`
**Requirement:** An ordinary successful one-shot parent Location ON/OFF command must not create a separate Brick GPS-on notification; continuous background tracking uses only the required consolidated foreground-service notification where Android requires visibility.
**Source:** SRC-001 §6.11; §9.7A
**Target phase:** 6
**Owner:** Android notifications
**Dependencies:** DPM-007 + CUI-004/CUI-011 + Android notification rules
**Audit owner:** 8C/8F
**Expected tests:** browser/device UI state matrix + integration + stale/offline/error states
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `NOTIFY2-005` — Remove needless disclosure-triggering writes

**Class/Profile:** `MANDATORY` / `REL`
**Requirement:** If repeated Android/ColorOS/device-policy Location/privacy notices are caused by needless repeated Brick permission or policy writes, Brick must remove those repeated writes rather than attempting to suppress required system disclosures.
**Source:** SRC-001 §6.11; §9.7A
**Target phase:** 6
**Owner:** Policy / notification reliability
**Dependencies:** DPM-007 + CUI-004/CUI-011 + Android notification rules
**Audit owner:** 8C/8F
**Expected tests:** fault injection + repair/verify/escalation + repeated failure/reboot/offline containment
**Field test:** YES OR TARGET-HARDWARE DEPENDENT
