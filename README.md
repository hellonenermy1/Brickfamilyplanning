# Brick V1 — Phase 2 Cloudflare Reliability

This branch upgrades the Phase 1 Cloudflare backend into the independent reliability/watchdog side of Phase 2. Phase 1 remains untouched on `phase1-cloudflare-setup`.

## Phase 2 additions

- signed `/api/device/<id>/health` heartbeat endpoint;
- strict health-payload schema validation and size limits;
- health packets contain operational state, not coordinates;
- D1 device-health metadata: last health, status, recovery count, queue depth and app version;
- per-device Durable Object stores current location and current health separately;
- independent cloud watchdog derives **device health** separately from **position freshness**;
- Durable Object alarm reevaluates stale/offline state even if the phone stops talking entirely;
- hibernating Durable Object WebSockets instead of an in-memory socket set;
- WebSocket automatically pushes location, health and status transitions;
- parent Phase 2 map shows DEVICE and POSITION as separate statuses;
- parent can see network state, pending local records, recovery count and app version;
- setup script safely upgrades an existing Phase 1 D1 database or initializes a new one;
- Phase 2 D1 column migration is introspected before ALTER statements, making setup rerunnable;
- one-command setup still keeps the Cloudflare API token out of disk/config files.

## One-command setup / upgrade

Prerequisites: Node.js 20+ and a Cloudflare account with Workers, D1, R2, Queues and Zero Trust enabled.

```bash
npm run setup
```

The installer can be run against a fresh account or an existing Phase 1 deployment. It:

1. creates/reuses D1, R2, Queue and DLQ;
2. generates Wrangler config;
3. installs dependencies and type-checks;
4. applies the base schema;
5. inspects the D1 `devices` table and adds only missing Phase 2 health columns;
6. applies the rerunnable Phase 2 health schema;
7. deploys the Worker;
8. creates/reuses Cloudflare Access protection for `/parent*`.

The token is prompted without echoing and is not written to `setup-state.json`.

## Security layout

- `/parent*` — Cloudflare Access required;
- `/api/pair/complete` — short-lived one-time pairing token + rate limit;
- `/api/device/<id>/location` — device ECDSA signature + packet validation + rate limit;
- `/api/device/<id>/health` — device ECDSA signature + strict JSON validation + rate limit;
- `/healthz` — no family/location data.

## Watchdog semantics in Phase 2

Device health and position freshness are deliberately different. A phone can still be online and healthy while its position source is stale. The parent UI therefore does not collapse every failure into a single misleading “offline” state.

Current Phase 2 watchdog thresholds are conservative starter values that will be tuned during the real OPPO qualification work:

- signed health heartbeat received within 45 s: device healthy;
- 45–75 s: device degraded;
- >75 s: device offline;
- location received within 15 s: position fresh;
- 15–60 s: position stale;
- >60 s: position unavailable.

These are operational thresholds, not claims about GPS accuracy.

## Still outside Phase 2

Activity recognition, speed, GNSS-quality scoring, trusted-position filtering and fallback positioning remain Phase 3. Detailed history/R2 route segments, SOS, I'm Safe, trips and geofences remain Phase 4. Full dashboard polish, health history, map hosting/privacy and reverse geocoding remain Phase 5. Release torture testing and the final security/privacy/reliability audit remain Phase 6.
