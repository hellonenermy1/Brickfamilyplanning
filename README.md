# Brick V1 — Phase 3 Cloudflare Position Intelligence

This branch builds on Phase 2's reliable signed ingest and cloud watchdog. It adds the server-side representation and parent live view for Phase 3 positioning data while keeping the Phase 1/2 packet format backward-compatible.

## Phase 3 additions

- accepts legacy 43-byte V1 location packets and new 90-byte V2 Phase 3 packets;
- V2 keeps the phone's raw location separate from Brick's trusted/estimated location;
- stores measurable uncertainty instead of invented confidence percentages;
- exposes measured speed in km/h plus speed accuracy when Android supplies it;
- exposes bearing/bearing accuracy and altitude/vertical accuracy where available;
- exposes broad activity mode only: stationary, walking, running, bicycle, vehicle, unknown;
- exposes Activity Recognition confidence without pretending it distinguishes car/bus/train;
- exposes position quality/source: measured fused vs inertial/last-known fallback;
- exposes GNSS satellite quality telemetry without solving raw GNSS server-side;
- parent live panel now shows quality, uncertainty, speed, movement, source and GNSS evidence;
- old clients remain able to upload V1 packets during staged upgrades;
- current state remains in the per-device Durable Object; detailed route history still belongs to Phase 4;
- a coarse network-evidence slot exists in the Durable Object for Cloudflare country/region evidence, but it is not treated as a coordinate or precise fallback.

## Accuracy rules

The parent map uses the trusted/estimated position for display but keeps the raw reading separately in state. A raw fix marked rejected or mock cannot silently overwrite the trusted position.

`PRECISE`, `ASSISTED`, `ANCHORED`, `ESTIMATED`, `COARSE`, `LAST_KNOWN`, and `UNKNOWN` are semantic states. The UI does not show made-up probability percentages.

## Route constraints

Phase 3 does not snap estimates to arbitrary roads just because a map is visible. Proper route-constrained fallback requires a real road/path graph. That graph is not yet part of the Cloudflare deployment, so the current Phase 3 fallback remains explicitly inertial/last-known with growing uncertainty rather than generating a false street-level answer.

## One-command deployment

The existing Phase 2 installer remains valid because Phase 3 does not require a new D1 schema migration for current live state. Run:

```bash
npm run setup
```

It creates/reuses the same D1/R2/Queues/Durable Object/Access resources and deploys the Phase 3 Worker code.

## Security and privacy

The existing signed device endpoints, replay/idempotency protection, Cloudflare Access parent boundary, WAF/rate-limit layout, and no-coordinate operational logging rules remain unchanged. Network evidence, when enabled, is always coarse context and never converted into a fake exact map pin.

## Validation boundary

Strict TypeScript CI validates the Worker. Actual positioning accuracy and fallback quality can only be evaluated with the real OPPO field test. Compile/typecheck success is not a claim of metre-level accuracy.

## Later phases

Phase 4 adds durable location history, route playback, trips, places/geofences, SOS and I'm Safe. Phase 5 completes parent dashboard polish, private map/geocoder infrastructure and operational Device Health. Phase 6 is the final reliability/security/privacy qualification.
