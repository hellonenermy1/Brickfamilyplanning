# Brick V1 — Phase 8D immutable start baseline

- **Audit opened:** 2026-11-04 (Asia/Singapore).
- **Repository:** `hellonenermy1/Brickfamilyplanning` (public source; do not place credentials or private family data in this repository).
- **Audit branch:** `v1-p8d-backend-deep-audit`.
- **Branch creation parent SHA:** `70a3c287425e9276585fbff85909dcf699dcf2f2`, identical to approved Phase 8C final documentation branch HEAD at creation. This is the **Phase 8D pre-edit source baseline**, not a live deployment identity.
- **Approved frozen Android code:** `2c492efff01095e17f96af3c24ac07ac0b5c3739`; changes during 8D must not touch `app/src/main` without reopening Android audit.
- **V1 audit authority:** user-supplied `Brick V1 Phase 8 Full Audit Execution Plan(4).pdf`, pages 1–9 global rules, 44–54 Phase 8D. Requirement coverage: `audit/phase8c/PHASE8C_RECOVERED_525_REQUIREMENTS.csv` (525 source-listed records; these are **not** all backend-owned).
- **Requirement source hierarchy:** latest explicit approved decision > approved amendments > base V1 contract > older plans; implementation is evidence, never an automatic replacement for approved requirements.
- **Production Wrangler source template:** `wrangler.template.jsonc`, Worker `brick-family-v1`, entry `src/worker-p8b.ts`, `compatibility_date=2026-10-29`, `APP_ENV=production`, `CURRENT_APP_VERSION=1.0.0-rc.1`.
- **Template production bindings:** D1 `DB` name `brick-family-v1`; DO `BRICK_DEVICE` / `BrickDevice`; R2 `HISTORY`, `MAPS`; queue `EVENTS` with DLQ `brick-family-v1-dlq`; `DEVICE_RATE`, `PAIR_RATE`; cron `*/1 * * * *` and `17 3 * * *`; Access vars `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`. Names are configuration evidence, **not verified deployed bindings**.
- **Development template:** `wrangler.development.template.jsonc`, `src/worker-v10.ts`, `brick-family-v1-dev`; no Cloudflare R2/Queues/cron configured; D1 dev parent sessions and access-code hash in public template. Development and production must be evaluated separately.
- **Current schema source:** 16 SQL files in `schema/`, through `018_p8b_pin_pairing.sql`; numbered gaps are historical filenames, not evidence of deleted migrations. **Live D1 migration version UNKNOWN**.
- **Observed production setup discrepancy:** `.github/workflows/deploy-brick.yml`, `scripts/setup-v1-phase6.mjs`, `scripts/setup-v1-phase8-finalize.mjs`, and `scripts/verify-cloudflare-deployment.mjs` still require `worker-v9.ts` / schema 15 or older release metadata, conflicting with current production template and P8B migrations 016–018. See `PHASE8D_FINDINGS.md`; not yet fixed or runtime tested.
- **Deployment ID/Cloudflare deployment SHA:** **UNKNOWN — REQUIRE LIVE READ-ONLY EVIDENCE**.
- **Production Worker URL and routes bound in account:** **UNKNOWN — REQUIRE LIVE READ-ONLY EVIDENCE**; never infer `workers.dev` hostname.
- **Live Cloudflare binding IDs and secret presence:** **UNKNOWN — REQUIRE LIVE READ-ONLY EVIDENCE**; record secret names/presence only, never values.
- **Live D1 schema/data, DO migration and R2/Queues/DLQ:** **UNKNOWN — REQUIRE LIVE READ-ONLY EVIDENCE**.
- **Cloudflare Access policy and real session/family isolation:** **UNKNOWN — REQUIRE LIVE READ-ONLY EVIDENCE**.
- **Parent Portal deployed asset/build SHA:** **UNKNOWN — REQUIRE LIVE READ-ONLY EVIDENCE**; `web/` and `src/parent-p8b.ts` are repository evidence only.
- **Android/Worker protocol contract:** `src/protocol.ts`, `src/evidence-protocol.ts`, Android code; exact deployed compatibility must be checked.
- **Current Phase 8D state:** **IN PROGRESS / NOT PASS**; audited against the above source baseline only. No live Cloudflare resource mutation is authorized by this baseline.

## First mandatory gates
1. Confirm actual deployment SHA, environment, route/domain, bindings and schema against configured source, using read-only Cloudflare API or authenticated CI evidence.
2. Exhaustively enumerate layered Worker routes and map all backend-owned V1 requirements.
3. Record defects **before** fixing; assign severity and preserve original reproductions.
4. Execute original repro, negative tests and regression against an exact SHA.
5. Prove backup → isolated deletion → new D1/R2/DO recovery with full required data reconciliation, without touching production.
6. 8D PASS only if zero open P0/P1, zero unknown public endpoints/persistence/auth paths, and **actual restore evidence**. No inferred PASS.

**Read-only audit baseline is not a production deployment approval.**