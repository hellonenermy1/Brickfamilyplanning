# Brick V1 — Phase 8A Final New Requirements — ONEMAP

Total: **7**.

## `ONEMAP-001` — Separate token-free and authenticated OneMap paths

**Class/Profile:** `MANDATORY` / `PROTO`
**Requirement:** Token-free Basemap/Mini Map/Advanced Mini Map/Static Map capability is isolated from authenticated OneMap enrichment services so basemap capability does not depend on authentication.
**Source:** SRC-001 §7.1C
**Target phase:** 7
**Owner:** Cloudflare provider boundary / parent map
**Dependencies:** MAPSG-* + SEC secret boundary + BE provider adapter
**Audit owner:** 8D/8E/8F
**Expected tests:** schema/fuzz/replay/order/duplicate/auth integration tests
**Field test:** BROWSER/PRODUCTION-INTEGRATION REQUIRED

## `ONEMAP-002` — Backend owns OneMap authenticated access

**Class/Profile:** `MANDATORY` / `SEC`
**Requirement:** Authenticated OneMap Search, Coordinate Converters, Reverse Geocode, Themes, Routing, Planning Area and Population Query access is owned by the Brick backend; tokens/registration credentials never ship in parent JavaScript or the APK.
**Source:** SRC-001 §7.1C
**Target phase:** 7
**Owner:** Cloudflare provider boundary / parent map
**Dependencies:** MAPSG-* + SEC secret boundary + BE provider adapter
**Audit owner:** 8D/8E/8F
**Expected tests:** static/config/package review + authenticated/unauthenticated adversarial tests
**Field test:** BROWSER/PRODUCTION-INTEGRATION REQUIRED

## `ONEMAP-003` — Three-day OneMap token lifecycle

**Class/Profile:** `MANDATORY` / `REL`
**Requirement:** Brick stores OneMap credentials securely and implements the approved three-day token-renewal lifecycle with refresh before expiry.
**Source:** SRC-001 §7.1C
**Target phase:** 7
**Owner:** Cloudflare provider boundary / parent map
**Dependencies:** MAPSG-* + SEC secret boundary + BE provider adapter
**Audit owner:** 8D/8E/8F
**Expected tests:** fault injection + repair/verify/escalation + repeated failure/reboot/offline containment
**Field test:** BROWSER/PRODUCTION-INTEGRATION REQUIRED

## `ONEMAP-004` — Bounded OneMap auth retry

**Class/Profile:** `MANDATORY` / `REL`
**Requirement:** OneMap token refresh/retry is bounded; authentication failure cannot deadlock Brick tracking or the parent map.
**Source:** SRC-001 §7.1C
**Target phase:** 7
**Owner:** Cloudflare provider boundary / parent map
**Dependencies:** MAPSG-* + SEC secret boundary + BE provider adapter
**Audit owner:** 8D/8E/8F
**Expected tests:** fault injection + repair/verify/escalation + repeated failure/reboot/offline containment
**Field test:** BROWSER/PRODUCTION-INTEGRATION REQUIRED

## `ONEMAP-005` — Centralized OneMap rate limiting

**Class/Profile:** `MANDATORY` / `PERF`
**Requirement:** Brick centralizes OneMap provider rate limiting below the approved published 300-calls-per-minute ceiling.
**Source:** SRC-001 §7.1C
**Target phase:** 7
**Owner:** Cloudflare provider boundary / parent map
**Dependencies:** MAPSG-* + SEC secret boundary + BE provider adapter
**Audit owner:** 8D/8E/8F
**Expected tests:** instrumented performance/resource measurement on exact target release
**Field test:** YES

## `ONEMAP-006` — Reverse-geocode coalescing/cache

**Class/Profile:** `MANDATORY` / `PERF`
**Requirement:** Brick coalesces/caches enrichment so a roughly 2-second Live Track cadence never produces matching roughly 2-second reverse-geocode calls.
**Source:** SRC-001 §7.1C
**Target phase:** 7
**Owner:** Cloudflare provider boundary / parent map
**Dependencies:** MAPSG-* + SEC secret boundary + BE provider adapter
**Audit owner:** 8D/8E/8F
**Expected tests:** instrumented performance/resource measurement on exact target release
**Field test:** YES

## `ONEMAP-007` — Enrichment outage isolation

**Class/Profile:** `MANDATORY` / `REL`
**Requirement:** Token expiry, rate limiting or authenticated enrichment outage must leave token-free basemap capability where available and Brick tracking overlays/current state operational.
**Source:** SRC-001 §7.1C
**Target phase:** 7
**Owner:** Cloudflare provider boundary / parent map
**Dependencies:** MAPSG-* + SEC secret boundary + BE provider adapter
**Audit owner:** 8D/8E/8F
**Expected tests:** fault injection + repair/verify/escalation + repeated failure/reboot/offline containment
**Field test:** BROWSER/PRODUCTION-INTEGRATION REQUIRED
