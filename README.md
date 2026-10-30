# Brick V1 — Phase 5B Private Map + Local Place Context

Phase 5B builds on the frozen Phase 5A parent/operations layer. It removes the parent map's live third-party map dependency and gives Brick a Singapore-focused, OSM-derived place/street lookup path that stays inside the Brick deployment.

## What Phase 5B adds

- MapLibre GL JS is bundled and served from Brick's own `/parent-assets` path.
- The MapLibre worker and CSS are served same-origin; the parent dashboard no longer loads MapLibre from UNPKG.
- A private R2 bucket, `brick-family-v1-maps`, stores the Singapore PMTiles archive.
- The browser reads map ranges only through the authenticated Brick Worker route `/parent/map/basemap.pmtiles`.
- The map fails closed if the private archive is missing. There is no silent Google, demo-tile, Nominatim, or other live map fallback.
- Saved Brick places/geofences remain the highest-priority human-readable place labels.
- Outside saved places, Brick directly reads nearby vector tiles from its own PMTiles archive and derives local POI/building/road/locality context without sending the child's coordinate to a geocoding provider.
- Decoded local tiles are cached in the parent browser to avoid repeatedly downloading the same PMTiles ranges as the child moves.
- Phase 5A Health, History, Trips, SOS, I'm Safe, places/geofences, retention, reliability, and realtime APIs remain underneath the thin Phase 5B wrapper unchanged.

## Privacy boundary

Normal parent viewing uses same-origin Brick resources only:

```text
Parent browser
  ├─ /parent-assets/brick-map.mjs
  ├─ /parent-assets/maplibre-gl.css
  ├─ /parent-assets/maplibre-gl-worker.mjs
  └─ /parent/map/basemap.pmtiles
          ↓
      authenticated Brick Worker
          ↓
      private Cloudflare R2 bucket
```

The one-time map installer downloads OSM-derived Protomaps map data to build the private Singapore archive. That download is provisioning, not live child-location lookup. Once installed, viewing a child's location does not send the viewed coordinate to Protomaps, Google Maps, Nominatim, or another map/geocoding service.

The current basemap intentionally omits MapLibre symbol layers until Brick also self-hosts the required font glyph and sprite assets. Roads, buildings, landuse and other geometry still render; human-readable current-place context comes from the local PMTiles resolver. This is preferable to quietly fetching label assets from a third party.

## Deploy Phase 5B

Run:

```bash
npm run setup
```

The setup script creates/reuses Brick's existing D1, history R2 bucket, queues, Durable Object and Access configuration, creates the private map R2 bucket, builds the same-origin browser assets, applies existing schemas, and deploys the Worker.

`setup` does **not** automatically download a regional map archive. Install the Singapore map once after setup:

```bash
npm run map:install
```

The installer:

1. finds a recent Protomaps OSM-derived daily PMTiles build unless `BRICK_MAP_SOURCE` is supplied;
2. extracts the Singapore bounding box (`103.55,1.12,104.12,1.50`) through zoom 15;
3. runs `pmtiles verify` on the extracted archive;
4. uploads it to `brick-family-v1-maps/basemap/singapore.pmtiles`;
5. writes installation metadata alongside the map archive.

You need either the `pmtiles` CLI or Docker for the extraction step. The native `pmtiles` CLI is preferred.

### Large archive handling

Brick uses Wrangler for normal map uploads. If the extracted archive exceeds the safe Wrangler threshold, the installer stops before a doomed upload. Configure `rclone` for the R2 bucket and set, for example:

```bash
export BRICK_R2_RCLONE_REMOTE='r2:brick-family-v1-maps'
npm run map:install
```

The installer will then use multipart-capable rclone for the PMTiles archive while retaining Wrangler for the small metadata object.

## Optional map overrides

```bash
BRICK_MAP_SOURCE='https://example.com/custom.pmtiles' npm run map:install
BRICK_MAP_BBOX='103.55,1.12,104.12,1.50' npm run map:install
BRICK_MAP_MAXZOOM='15' npm run map:install
```

Do not lower map detail just to make an upload succeed unless that tradeoff is intentional; use the multipart path for a genuinely large archive.

## CI / regression gates

Phase 5B CI verifies:

- setup and map-installer syntax;
- strict TypeScript for the browser map module;
- self-hosted MapLibre/PMTiles asset build;
- the private PMTiles route is present in the bundled browser code;
- no UNPKG MapLibre, MapLibre demo tiles, Nominatim, or Google Maps endpoint appears in the live parent map bundle/HTML;
- Worker TypeScript;
- rendered parent dashboard JavaScript syntax;
- Phase 5 health classification regressions;
- Phase 4 history codec round trips;
- all current D1 schemas on a fresh SQLite database.

## What Phase 5B does not claim

- The private map archive is not automatically refreshed yet.
- The current map does not yet self-host full font glyph/sprite assets for rich road/POI labels.
- Local PMTiles place context is useful context, not a guaranteed postal-address oracle; OSM data completeness varies.
- Phase 6 OPPO endurance, battery and real-world reliability acceptance is still required before Brick is called production-reliable.

The core rule remains: prevent failures where Android legitimately allows it, detect failures immediately, extract the most useful evidence available, and never present an estimate as a measurement.
