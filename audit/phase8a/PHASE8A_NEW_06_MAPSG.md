# Brick V1 — Phase 8A Final New Requirements — MAPSG

Total: **11**.

## `MAPSG-002` — OneMap primary Singapore basemap

**Class/Profile:** `MANDATORY` / `FEAT`
**Requirement:** Use the current supported high-detail OneMap Singapore map path as the primary Singapore basemap where approved provider capability is available.
**Source:** SRC-001 §7.1B
**Target phase:** 7
**Owner:** Parent map / enrichment
**Dependencies:** PORT-004/007/031 amended + LIVE-* + approved map providers
**Audit owner:** 8D/8E/8F
**Expected tests:** unit where useful + integration + reachability + real-device if platform-dependent
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `MAPSG-003` — Progressive Singapore map detail

**Class/Profile:** `MANDATORY` / `UI`
**Requirement:** Progressive zoom reveals only provider-supplied planning/estate context, roads/transit/schools/parks, building/HDB and block/street detail appropriate to zoom; Brick never invents labels.
**Source:** SRC-001 §7.1B
**Target phase:** 7
**Owner:** Parent map / enrichment
**Dependencies:** PORT-004/007/031 amended + LIVE-* + approved map providers
**Audit owner:** 8D/8E/8F
**Expected tests:** browser/device UI state matrix + integration + stale/offline/error states
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `MAPSG-004` — Brick overlays are provider-independent

**Class/Profile:** `MANDATORY` / `UI`
**Requirement:** Current marker, heading, accuracy/uncertainty, live trail, history/playback, stops/trips, places/geofences, SOS/I'M SAFE/fall events and degraded corridors/particle areas remain provider-independent overlays.
**Source:** SRC-001 §7.1B
**Target phase:** 7
**Owner:** Parent map / enrichment
**Dependencies:** PORT-004/007/031 amended + LIVE-* + approved map providers
**Audit owner:** 8D/8E/8F
**Expected tests:** browser/device UI state matrix + integration + stale/offline/error states
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `MAPSG-005` — Primary map failure preserves tracking map

**Class/Profile:** `MANDATORY` / `REL`
**Requirement:** OneMap/provider failure is not a tracking failure; Brick fails over to the approved OSM/Protomaps-style fallback while preserving current Brick state and overlays.
**Source:** SRC-001 §7.1B
**Target phase:** 7
**Owner:** Parent map / enrichment
**Dependencies:** PORT-004/007/031 amended + LIVE-* + approved map providers
**Audit owner:** 8D/8E/8F
**Expected tests:** fault injection + repair/verify/escalation + repeated failure/reboot/offline containment
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `MAPSG-006` — Parent pan/zoom/recenter/follow controls

**Class/Profile:** `MANDATORY` / `UI`
**Requirement:** Parent map supports normal mouse/trackpad/touch pan and zoom, +/- controls and explicit Recenter/Follow.
**Source:** SRC-001 §7.1B
**Target phase:** 7
**Owner:** Parent map / enrichment
**Dependencies:** PORT-004/007/031 amended + LIVE-* + approved map providers
**Audit owner:** 8D/8E/8F
**Expected tests:** browser/device UI state matrix + integration + stale/offline/error states
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `MAPSG-007` — Manual map movement disables forced follow

**Class/Profile:** `MANDATORY` / `UI`
**Requirement:** Manual parent pan/zoom disables forced follow until the parent explicitly recenters or re-enables Follow.
**Source:** SRC-001 §7.1B
**Target phase:** 7
**Owner:** Parent map / enrichment
**Dependencies:** PORT-004/007/031 amended + LIVE-* + approved map providers
**Audit owner:** 8D/8E/8F
**Expected tests:** browser/device UI state matrix + integration + stale/offline/error states
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `MAPSG-008` — Address enrichment stays off Fast Live Path

**Class/Profile:** `MANDATORY` / `PERF`
**Requirement:** Current coordinates/marker render first and Singapore address enrichment runs asynchronously; reverse geocoding never blocks the Fast Live Path.
**Source:** SRC-001 §7.1B
**Target phase:** 7
**Owner:** Parent map / enrichment
**Dependencies:** PORT-004/007/031 amended + LIVE-* + approved map providers
**Audit owner:** 8D/8E/8F
**Expected tests:** instrumented performance/resource measurement on exact target release
**Field test:** YES

## `MAPSG-009` — Reject stale reverse-geocode results

**Class/Profile:** `MANDATORY` / `REL`
**Requirement:** Every address result is bound to the coordinate/time that produced it; an older delayed enrichment result cannot overwrite a newer position/address.
**Source:** SRC-001 §7.1B
**Target phase:** 7
**Owner:** Parent map / enrichment
**Dependencies:** PORT-004/007/031 amended + LIVE-* + approved map providers
**Audit owner:** 8D/8E/8F
**Expected tests:** fault injection + repair/verify/escalation + repeated failure/reboot/offline containment
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `MAPSG-010` — Map style policy

**Class/Profile:** `MANDATORY` / `UI`
**Requirement:** Detailed is the default style; Clean may be a secondary route/history style; Satellite is optional only with a properly licensed/tested provider and is not a V1 dependency.
**Source:** SRC-001 §7.1B
**Target phase:** 7
**Owner:** Parent map / enrichment
**Dependencies:** PORT-004/007/031 amended + LIVE-* + approved map providers
**Audit owner:** 8D/8E/8F
**Expected tests:** browser/device UI state matrix + integration + stale/offline/error states
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `MAPSG-012` — Responsive map workspace

**Class/Profile:** `MANDATORY` / `UI`
**Requirement:** Desktop gives the map most of the tracking workspace with a side event/detail rail; narrow screens use a stacked/collapsible layout without hiding critical tracking/safety state.
**Source:** SRC-001 §7.1B
**Target phase:** 7
**Owner:** Parent map / enrichment
**Dependencies:** PORT-004/007/031 amended + LIVE-* + approved map providers
**Audit owner:** 8D/8E/8F
**Expected tests:** browser/device UI state matrix + integration + stale/offline/error states
**Field test:** YES OR TARGET-HARDWARE DEPENDENT

## `MAPSG-013` — Singapore address enrichment fields

**Class/Profile:** `MANDATORY` / `UI`
**Requirement:** When reliably returned, selected-child address enrichment supports useful block/building, street, estate/neighbourhood/planning-area and postal information; missing fields remain absent rather than invented.
**Source:** SRC-001 §7.1B
**Target phase:** 7
**Owner:** Parent map / enrichment
**Dependencies:** PORT-004/007/031 amended + LIVE-* + approved map providers
**Audit owner:** 8D/8E/8F
**Expected tests:** browser/device UI state matrix + integration + stale/offline/error states
**Field test:** YES OR TARGET-HARDWARE DEPENDENT
