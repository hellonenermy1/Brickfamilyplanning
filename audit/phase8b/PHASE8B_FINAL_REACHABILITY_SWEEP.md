# Brick V1 — Phase 8B Final Production Reachability / Legacy Sweep

Candidate: `v1-p8b-integrated-candidate` at `204a141e90c078b6c2008778bd6c01bcbb8a4622`.

Purpose: prove the remediation is connected to production entrypoints and does not leave superseded beta/current-contract behavior reachable merely because new files exist.

## Android production surface

- Production manifest is not `testOnly`.
- Production version identity is V1 RC (`1.0.0-rc.1`, versionCode 10).
- Exactly one launcher is present: `MainActivity`.
- Maintenance/Recovery is local and non-exported; no second diagnostics launcher exists.
- Hidden Maintenance entry is reachable from the normal Brick logo through the exact local entry state machine.
- Child/Parent-Guardian/Unprovisioned runtime role is explicit; parent role does not start child tracking.
- Deep Off checks are present in startup/recovery/service control paths rather than only in the maintenance screen.
- Deprovisioning uses the current Policy Ledger/Deep Off path rather than relying on the old three-stage beta retirement UI.
- Scheduled Wi-Fi is locally durable and invoked through its scheduler/worker path.
- Live Track command state is applied to the existing location cadence path rather than implemented as a disconnected second tracker.
- daily canary, screen-time aggregate, fall runtime and capability profile code are connected to scheduled/service/health paths.
- Fast Live uses the live API/current-state path while durable history remains separate.
- fallback PIN pairing is reachable from manual child setup for exactly eight-digit fallback codes; normal QR token pairing remains independent.

## Superseded Android behavior absent from current production semantics

- no `parentDesiredLocationState` persistent desired-state loop;
- no normal `DISALLOW_CONFIG_LOCATION` enforcement;
- no normal `DISALLOW_CHANGE_WIFI_STATE` schedule lock;
- completed Location commands are history, not permanent desired state;
- no separate Brick-created GPS-on notification is required by the one-shot control path;
- no generic Shizuku/remote shell interface;
- no root/custom-ROM dependency introduced;
- no external advertising/analytics SDK dependency detected by the final gate.

Historical beta/debug source may remain for upgrade/test traceability, but `BRICK_BETA=false` and the production manifest/entrypoints do not make that historical surface the current V1 product contract.

## Cloud / backend production surface

- production Wrangler entry is `src/worker-p8b.ts`;
- production version identity matches the V1 RC configuration;
- parent P8B HTML overlay is rendered from the production worker;
- Fast Live, canary, Live Track, Wi-Fi schedule, fall ingest, screen-time, commute summary and OneMap routes are reachable from production routing;
- all current D1 migrations apply cleanly to an empty database, including the P8B control/summary/provider state and fallback PIN session table;
- current-state fast path is not replaced by history/Atlas/reverse-geocode processing;
- OneMap authenticated enrichment credentials are backend bindings only and are not present in browser/public assets;
- reverse-geocode work is coalesced/cached and stale-result guarded;
- fallback PIN public claim does not create a device; authenticated parent confirmation is the binding step;
- parent mutation routes retain Access/same-origin protections;
- Wrangler production dry-run builds the actual configured worker bundle.

## Parent portal reachability

Current production parent overlay exposes/wires:

- actual one-shot Location command history/current Android state;
- Live Track start/stop state;
- scheduled Wi-Fi control/results;
- screen-time aggregate;
- commute summaries;
- device rename;
- Singapore OneMap-backed map with fallback;
- explicit Recenter/Follow and manual-pan/zoom follow cancellation;
- asynchronous structured address enrichment;
- HIGH-fall prominent alert path;
- fallback PIN creation + separate confirmation;
- Explain This Location with evidence/missing-evidence truth.

## Fake/dead/placeholder sweep

The final Android and Cloud remediation CI gates explicitly reject obvious production TODO/not-implemented placeholders and verify critical source files/routes. Manual source audit additionally checked that headline remediation families are referenced from the APK/Worker/portal paths above.

A file existing by itself was not sufficient for promotion in the final rescore.

## Result

Mandatory source-level production reachability blockers found by Phase 8B: **0 remaining**.

Optional device-dependent features may still be `VERIFIED UNSUPPORTED` only after the later target-device audit; Phase 8B does not manufacture device support.

**REACHABILITY / LEGACY SWEEP: PASS at source level, subject to the final integrated CI result and later 8C–8F/Phase 9 runtime qualification.**