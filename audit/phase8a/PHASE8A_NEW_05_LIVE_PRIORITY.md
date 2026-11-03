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
**Requirement:** Real-device/browser qualification must measure and meet the approved 23R P95 Fast Live Path latency budget; history, Atlas, reverse geocoding and backlog work must not head-of-line block the measured path.
**Source:** SRC-001 §7.1A; §9.7A
**Target phase:** 9
**Owner:** Cross-system performance
**Dependencies:** DAT persistence + BE current-state/WebSocket + PORT render path
**Audit owner:** 8F/Phase 9
**Expected tests:** the named exact production-like scenario with timestamped expected-vs-actual evidence
**Field test:** YES

**Open source-value gap:** `P8A-GAP-002` — the authoritative numeric 23R P95 threshold(s) have not been recovered. No number may be invented.

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
