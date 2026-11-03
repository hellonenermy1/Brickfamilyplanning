# Brick V1 — Phase 8A Final New Requirements — LIVE / PRIORITY

Total: **5**.

## `LIVE-001` — Dedicated end-to-end Fast Live Path

**Class/Profile:** `MANDATORY` / `PROTO`
**Requirement:** Current accepted position follows the dedicated live path accepted fix -> local persistence -> realtime packet -> authoritative Durable Object current state -> WebSocket -> map render, independently of slower background work.
**Source:** SRC-001 §7.1A
**Target phase:** 7
**Owner:** Android transport + Cloudflare current state + portal
**Dependencies:** DAT persistence + BE current-state/WebSocket + PORT render path
**Audit owner:** 8C/8D/8E/8F
**Expected tests:** schema/fuzz/replay/order/duplicate/auth integration tests
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `LIVE-003` — Live-path stage instrumentation

**Class/Profile:** `MANDATORY` / `PERF`
**Requirement:** Instrument at least source age, local persist time, phone send delay, backend delay, WebSocket delay and browser render delay for the Fast Live Path.
**Source:** SRC-001 §7.1A
**Target phase:** 7
**Owner:** Cross-system observability
**Dependencies:** DAT persistence + BE current-state/WebSocket + PORT render path
**Audit owner:** 8C/8D/8E/8F
**Expected tests:** instrumented performance/resource measurement on exact target release
**Field test:** YES

## `LIVE-004` — Coalesce live renders without losing durable history

**Class/Profile:** `MANDATORY` / `DATA`
**Requirement:** Brick preserves every point required by durable history even when obsolete intermediate live renders are coalesced because a newer current state already exists.
**Source:** SRC-001 §7.1A
**Target phase:** 7
**Owner:** Live/history separation
**Dependencies:** DAT persistence + BE current-state/WebSocket + PORT render path
**Audit owner:** 8D/8E/8F
**Expected tests:** transaction/crash/corruption/retention/reconciliation tests
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `LIVE-005` — 23R P95 Fast Live qualification

**Class/Profile:** `MANDATORY` / `TEST`
**Requirement:** Real-device/browser qualification must prove all current 23R Fast Live budgets under representative healthy validated Wi-Fi and normal mobile-data conditions on both target OPPO profiles:

1. accepted current fix -> corresponding visible parent marker: **P95 <= 1.5 seconds**;
2. authoritative backend current-state update -> corresponding visible parent marker: **P95 <= 500 milliseconds**;
3. authenticated parent Live Track activation -> phone fast-mode confirmation or explicit failure/degraded result: **P95 <= 2.0 seconds**.

The first two measurements begin after a position is accepted; they do not include waiting for the next physical GNSS/fused fix. History, Atlas, reverse geocoding, R2/history work, route simplification and offline backlog must not head-of-line block the measured Fast Live path. Degraded/offline networks are judged on truthful state, durability, recovery and zero manual intervention rather than the healthy-network latency SLA.

**Source:** SRC-001 §7.1A; §9.7A + `PHASE8A_23R_LATENCY_AMENDMENT.md`
**Target phase:** 9
**Owner:** Cross-system performance
**Dependencies:** DAT persistence + BE current-state/WebSocket + PORT render path
**Audit owner:** 8F/Phase 9
**Expected tests:** exact production-like scenario with correlated trace IDs and monotonic stage timing; enough samples for meaningful P95; same APK/backend/portal/schema/protocol release identity
**Field test:** YES

## `PRIO-001` — Evidence backlog priority order

**Class/Profile:** `MANDATORY` / `REL`
**Requirement:** Backlog/work scheduling uses the explicit priority order SOS > Critical safety > Location > Health > Evidence learning > Diagnostics so new evidence/diagnostics can never starve safety or current location work.
**Source:** SRC-001 §8.2
**Target phase:** 8
**Owner:** Android/backend queues and schedulers
**Dependencies:** SAFE-* + DAT/BE queues + REL supervisor
**Audit owner:** 8C/8D/8F
**Expected tests:** fault injection + repair/verify/escalation + repeated failure/reboot/offline containment
**Field test:** INTEGRATION REQUIRED; DEVICE WHEN BEHAVIOR CROSSES PHONE
