# Brick V1 — Phase 8A Amended Existing Requirements

Total amended existing checklist IDs: **14**.

The historical checklist wording remains preserved in the pinned 469-point source. The text below is the current authoritative interpretation after later approved amendments.

## `DPM-002` — Location setting management

**Historical checklist wording:** Device Owner can apply the parent desired Location state through supported managed APIs/policies and verify the actual resulting Android state.

**Current requirement:** Device Owner is the primary reliable actuator for a one-shot parent Location ON/OFF request where supported: apply the requested state, verify actual Android state, report the command result, then stop enforcing after completion.

**Dependencies:** PLT-* + SEC-* + Android Device Owner capability

**Audit owner:** 8C/8F

## `LOC-008` — Freshness gate

**Historical checklist wording:** Reject/down-weight stale fixes using monotonic timing rather than trusting wall-clock time alone.

**Current requirement:** Reject/down-weight stale fixes using monotonic timing, but freshness thresholds must respect the active sampling profile so intentional slow stationary cadence is not falsely classified as degraded or stale.

**Dependencies:** PLT-* + monotonic timing + durable location record

**Audit owner:** 8C/8F

## `FUS-001` — Fallback policy hierarchy

**Historical checklist wording:** Policy ranks fresh fused, assisted/network, anchor/place, inertial, route-constrained, network context, IP, last verified, then unknown while still allowing parallel evidence fusion.

**Current requirement:** Policy ranks fresh trustworthy measured/fused positioning ahead of assisted/network, anchor/place, inertial, route-constrained, network context, IP, last verified and unknown; an older fallback/estimate never outranks a newer accepted measured fix.

**Dependencies:** LOC-* + MOT-* + ATL-* + WIT-* where available

**Audit owner:** 8C/8D/8E/8F

## `SHZ-002` — Device Owner remains primary

**Historical checklist wording:** Persistent safety management and Location control prefer Device Owner; Shizuku is secondary enhancement/repair only.

**Current requirement:** Device Owner remains primary for approved managed actions. One-shot Location control uses Device Owner where supported; Shizuku remains a detachable secondary enhancement/repair path and never creates persistent desired-state enforcement.

**Dependencies:** DPM-* + SEC-* + optional Shizuku capability

**Audit owner:** 8C/8F

## `SHZ-008` — Desired-versus-actual state machine

**Historical checklist wording:** Implement and verify all desired/actual combinations, with repair when mismatched and no false portal success state.

**Current requirement:** While a Location command is genuinely pending or failed, Brick may compare the requested target with actual Android state and retry/repair as allowed. Once the command completes, any later deliberate child/user Location toggle is legitimate current state and must not be repaired back to the historical command target.

**Dependencies:** DPM-* + SEC-* + optional Shizuku capability

**Audit owner:** 8C/8F

## `SHZ-009` — Phone-side Location confirmation

**Historical checklist wording:** Portal changes confirmed Location state only after the phone reports actual resulting state; request and actual are shown separately when unresolved.

**Current requirement:** Portal changes the confirmed Location command result/current actual state only after phone-side actual-state confirmation. While a command is unresolved, requested target and actual state are shown separately; after completion the request becomes command history rather than persistent desired state.

**Dependencies:** DPM-* + SEC-* + optional Shizuku capability

**Audit owner:** 8C/8F

## `SHZ-021` — GPS-on notification quietness

**Historical checklist wording:** Any Brick GPS-on status uses no sound, vibration, heads-up, popup or repeated per-position alerts and does not suppress required Android foreground-service visibility.

**Current requirement:** Brick's required consolidated foreground/location status remains low-importance and silent with no sound, vibration, heads-up, popup or per-position repost; no second standalone GPS-on status is layered on top, and Android-required foreground-service/privacy visibility remains intact.

**Dependencies:** DPM-* + SEC-* + optional Shizuku capability

**Audit owner:** 8C/8F

## `REL-010` — System Truth Location cross-check

**Historical checklist wording:** Location healthy state cross-checks Brick desired/internal state, Android master state, recent FLP/GNSS callbacks and fresh accepted fixes.

**Current requirement:** Location System Truth cross-checks actual Android master state, permissions, tracker/service/subscription health, recent FLP/GNSS callbacks and fresh accepted fixes. A requested target is compared to actual state only while a one-shot command is pending; completed historical commands do not create a permanent desired-state mismatch.

**Dependencies:** PLT-* + DAT-* + BE-* + provider health + SEC-*

**Audit owner:** 8C/8D/8E/8F

## `REL-018` — Daily silent integrity check

**Historical checklist wording:** Once per day, Brick verifies tracker, Location desired/actual, Device Owner/policy, permissions, subscriptions, journal/Vault/sequence, network, FGS, Atlas, battery/power and optional Shizuku.

**Current requirement:** Once per day, Brick verifies tracker, actual Location/permissions, any currently pending Location command, Device Owner/policy state, subscriptions, journal/Vault/sequence, network, FGS, Atlas, battery/power and optional Shizuku; a completed historical command is not treated as persistent desired state.

**Dependencies:** PLT-* + DAT-* + BE-* + provider health + SEC-*

**Audit owner:** 8C/8D/8E/8F

## `PORT-004` — Live MapLibre map

**Historical checklist wording:** Parent map is interactive and uses MapLibre/private map hosting strategy rather than a static image.

**Current requirement:** Parent map is interactive and uses MapLibre as the renderer. The current supported high-detail OneMap Singapore path is primary where available, with provider-independent Brick overlays and an approved fallback when the primary provider fails.

**Dependencies:** BE-* + SEC-* + HIS/SAFE/current-state APIs

**Audit owner:** 8E/8F

## `PORT-007` — Current readable place

**Historical checklist wording:** Portal resolves a human-readable current place/address using the private/OSM-derived approach where available and falls back honestly when not resolvable.

**Current requirement:** Portal resolves a human-readable current Singapore place/address through the current approved asynchronous provider path (OneMap primary where available, approved fallback as applicable), renders current coordinates first, and falls back honestly when enrichment cannot resolve a useful label.

**Dependencies:** BE-* + SEC-* + HIS/SAFE/current-state APIs

**Audit owner:** 8E/8F

## `PORT-014` — Requested versus actual Location state

**Historical checklist wording:** Portal shows requested parent Location state, actual phone state, confirmation age and repair-pending mismatch honestly.

**Current requirement:** Portal shows current actual Android Location separately from one-shot command history. While a command is pending it may show requested target, actual state and confirmation age; after completion it shows last command/result/time as history. A later child/user toggle becomes current truth and is not labelled repair-pending merely because it differs from the historical command.

**Dependencies:** BE-* + SEC-* + HIS/SAFE/current-state APIs

**Audit owner:** 8E/8F

## `PORT-031` — Private map privacy

**Historical checklist wording:** Viewing the child coordinate does not unnecessarily send every viewed position to Google Maps; map assets/services follow the private MapLibre/OSM strategy.

**Current requirement:** Viewing child location does not unnecessarily disclose coordinates/history to unrelated third parties. MapLibre rendering, OneMap primary/fallback providers and enrichment send only provider-necessary data; unrelated Brick history/evidence/family telemetry and private credentials remain private/backend-controlled.

**Dependencies:** BE-* + SEC-* + HIS/SAFE/current-state APIs

**Audit owner:** 8E/8F

## `BE-006` — Queue-based history processing

**Historical checklist wording:** Live current state updates immediately while history/evidence processing can batch through Cloudflare Queues asynchronously.

**Current requirement:** Current live state follows a dedicated fast path and updates immediately, while history/evidence/Atlas/background processing batches asynchronously and may not head-of-line block current live position delivery.

**Dependencies:** SEC-* + DAT-* + Cloudflare bindings/storage

**Audit owner:** 8D/8F
