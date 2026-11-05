# Brick project memory

## 2026-11-05 — mandatory no-card architecture

Jayvian explicitly reconfirmed that he has no credit card, cannot use R2, has repeated this constraint several times, and wants D1 substituted for R2. This is a hard project requirement, not an optional optimisation.

Do not ask him to activate R2, add a payment card, or enable a paid subscription again. A request to finish/deploy the beta does not override this rule.

Direction: D1-backed history, evidence and beta observations; indexed bounded retention and actual durability tests. The repository already contains src/dev-free-runtime.ts, worker-v10.ts and the card-free development setup, including D1 object/history storage, a direct event persistence path and authenticated D1 parent sessions. Qualify/adapt those components for the current beta rather than starting from scratch or downgrading current feature coverage.

Maps and APK binaries require separate sizing/range/download decisions. Do not promise that arbitrary large objects can simply become one D1 row. Existing card-free runtime map sourcing and chunked D1 objects are implementation candidates, not automatically accepted solutions.

The previous Phase2 R2-based setup and its requirement to enable R2 were an assistant mistake. That launch path must remain disabled until replaced by a tested no-card path. Its earlier CI results describe the old design only; they do not qualify the D1 replacement.

Resolved in approved APK source fa52547d89929e2032fc8ced4511b79e9bf8a23c: readiness uses object_store_roundtrip and event_persistence_roundtrip, backed by actual D1 persistence. Never relabel these as real R2/Cloudflare Queue tests. The current card-free backend is deployed at https://brick-family-beta.lumjayvian.workers.dev/parent/login from source20b68c693cb949771db81121fdfdbe5fb3293ade. Independent APK escape/reboot fixes are retained. Phase8D stays at71f5460fa6dfb47e276121e6c69db98cdae4485a.

## Current delivery (2026-11-05)

The D1 replacement and its guarded launch succeeded. Primary history/objects and diagnostics use separate D1 databases; live state and the maintenance scheduler use separate SQLite Durable Objects. Account Cron quota was full, so the beta uses its own persisted DO alarm plus D1 maintenance leases, without deleting other schedules or upgrading the account. Parent login uses private hashed D1 sessions and a Worker secret; the generated private credential was delivered privately, never committed. No R2, Cloudflare Queue, Zero Trust or paid subscription was enabled. Private APK upload/download and map ranges passed actual live checks. Real phone installation/provisioning/removal and the72h run remain user-side checks, not completed evidence. See audit/beta-backend/FINAL_RESULTS.json and D1_LIVE_VERIFICATION.json.

## Active user-reported bug register (2026-11-05)

Canonical issue: https://github.com/hellonenermy1/Brickfamilyplanning/issues/26 . Update this issue when the user reports a new Brick defect, preserving exact symptoms, affected host, date, root-cause evidence and deployment/verification status; never write access tokens, personal locations, device keys or private data to GitHub.

Unresolved: Phase 8D beta MapLibre map reported not working; live cause not yet verified. Source review found incorrect cached PMTiles Content-Range offset and the portal device-list loading being coupled to map `load`. Track fixes and real-browser tests in #26. Login POST previously returned `Same-origin Brick parent request required` and a header fix was committed, but live success was not confirmed. Old Phase 7 development portal showed a revoked phone; a hide-only fix was committed on a separate branch, not deployed, and the user requested full removal only after a backup-safe reset. A fresh reset of the isolated beta D1/device state is prepared, not executed. Keep `brick-family-v1-dev` (old development) separate from `brick-family-beta` (8D-based beta).

No-code-only success claims: distinguish committed source, CI, live deployed SHA, and actual user verification. Maintain separate Phase 8D acceptance and signed APK. No R2/payment card.

### 2026-11-05 — map visual/functional fix
User additionally requested the beta MapLibre map be shorter, roughly half viewport height rather than occupying full screen. Confirmed source-level CSP mismatch: OneMap raster external tile URLs were disallowed by strict parent CSP; the source now uses authenticated same-origin OneMap raster tile + logo proxy while keeping CSP strict, and falls back to private PMTiles. Previously discovered PMTiles cached range metadata bug and map-event-coupled device initialization were corrected. Beta-only CSS: desktop 50vh capped at 560px and minimum 320px, mobile 42vh capped 420px/minimum 260px. See PR #27 (merged to beta/backend-portal commit `098399d6ac20239336847c8bf2a8ae3ed99e5fc8`) and GitHub issue #26. PR isolated regression passed; live Cloudflare deployment and browser acceptance remain unverified until explicit evidence.

### 2026-11-05 — urgent parent dashboard blank regression
After PRs #28 and #29, user screenshot showed authenticated `brick-family-beta` portal with **empty phone selector and no MapLibre initialization**, not proof of any D1 device deletion. The browser may have reused the old `/brick-map.mjs` for up to one year under the original `immutable` asset headers, while the new HTML asked for newly exported names. This is a strong source-level hypothesis **not yet proved by Chrome console/network evidence**. Hotfix #30 merged at `63075728e51d62d83641a0883deeb5e585fdf116` after successful tests: restored original four-function module import, versioned module URL, changed static asset caching to revalidation, and removed optional map diagnostics from critical dashboard startup. Maintains 92vh desktop/70vh mobile map, Phase 8D APK and D1. Do not represent browser fix as verified before screenshot/observability confirms devices + map controls return. Track in GitHub issue #26.
