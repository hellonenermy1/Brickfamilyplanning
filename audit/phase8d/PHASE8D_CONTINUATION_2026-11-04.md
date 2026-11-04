# Phase 8D continuation — routed revocation, development parity and recovery coverage

**State: IN PROGRESS / NOT PASS.** Continued existing `v1-p8d-backend-deep-audit` from `ea23177c21d39864a152f9963d68b939d1a754bb`. No Android change, deployment, live SQL, Cloudflare resource creation or family-data access. Current source CI result must be attached after the commit; local results below are not a hosted CI claim.

## Confirmed defects and corrections

| Finding | Reproduced baseline behavior | Correction and bounded evidence |
|---|---|---|
| P8D-050, P1, 8D.3/.7/.10 | Actual outer production Fast Live route returned 200 after injected D1 revoke; DO persisted revoke fence did not stop latest writes after reconstruction; DO outage escaped as exception. Active control passed, four negative checks failed. | Actual route rechecks active D1 identity after asynchronous map work, returns 503 on unavailable DO, honors revoked result. DO latest transaction reads persisted fence before compare/write. Five focused tests now pass. D1 and DO still do not form one atomic transaction. |
| P8D-051, P1, 8D.1/.8/.19 | Fresh development setup lacked current control/summary/PIN schema; development entry returned 404 for production screen-time routes and lacked current parent overlay. | Dev wraps current worker-p8b; applies migrations through 018 before deployment; schema016 resumes after interrupted ADD COLUMNs; legacy columns repaired before deploy; prior sessions revoked before changing login verifier. Four actual-route/schema checks plus interruption/retry/drift/session tests pass. No deployment run. |
| P8D-002 addendum, P1 recovery gate remains OPEN | Actual 18-table snapshot omitted nonempty witness authorization and receiver configuration. | Versioned v3 snapshot and fresh restore cover 38 durable tables. All 48 declared schema tables classified: 38 durable, 4 transient credentials/cache/rate, 6 development-only. All 38 seeded nonempty in native SQLite; restored row counts and noncommand fields compared, FK clean; pending generic commands expire. v1/v2 remain readable with explicit missingTables and coverageComplete=false. |

The old live isolated D1 helper still makes an 18-table v2 fixture. It now **fails before any Cloudflare fetch or resource creation** when given the current restore module. A negative test confirms this with synthetic credentials and blocked fetch. It must be upgraded before another live recovery qualification; it cannot generate a current full-recovery PASS.

## Actual local Workers integration

`scripts/test-phase8d-workerd-integration.mjs` uses the locked Miniflare 5.20261023.3-beta / workerd 1.20261023.1 and actual bundled production entry, without the Node DurableObject shim. Synthetic P-256 and RSA keys only; outbound requests limited to an in-process synthetic Access JWKS response. Disposable local services are removed after use.

Four groups PASS:

1. Actual signed location -> local D1 acceptance -> actual Queue consumer -> compressed R2 history; exact duplicate leaves one D1 delivery row; actual DO state agrees; missing Access denied and valid synthetic JWT accepted.
2. Actual WebSocket subscription expires through storage alarm while idle. Allow 45 seconds for local runtime scheduling (a 6-second harness timeout was insufficient; no production code change made for that timeout).
3. Parent revoke denies further Fast Live, DO eviction/reconstruction retains fence, archived current state remains stable, new subscription returns 410.
4. Actual v3 snapshot writes compressed SHA-tagged object to local R2 and restores into a separate local D1 with 38-table coverage, accepted sequence index and revoked identity retained.

Harness startup initially used a temporary module outside its default module root, causing workerd path resolution failure. Setting an explicit disposable modulesRoot fixed the harness. Neither harness configuration issue is claimed as a Brick production defect.

This is **local workerd evidence**, not active deployed Worker provenance, real Cloudflare service quotas/concurrency/hibernation, physical phone behavior, full DO disaster recovery or production rollback. The recovery API still restores D1 only; HISTORY/DO inventories and controlled cutover remain separate gates. Larger durable backups increase memory/response-size risk: current row/decoded-size checks fail closed; hosted scale/limit validation remains required.

## Regression scope

TypeScript typecheck, parent asset build, static deployment/recovery contract, new focused tests and local workerd integration PASS. Existing source-build groups were also executed locally; three older groups could not start their SQLite CLI checks because this container has no `sqlite3` executable. The separate isolated CLI restore/schema-replay checks are deferred to the unchanged Ubuntu CI environment; do not count their local absence as a PASS. Native `node:sqlite` tests above did run against real SQLite.

Blocking CI steps now include routed revocation, development route/schema/upgrade tests, nonempty 38-table recovery and native workerd integration. Hosted full CI outcome belongs to the exact committed SHA, recorded in the follow-up evidence entry.

## Fresh read-only live evidence

Re-ran existing [live run 41839919454, attempt 2](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41839919454/attempts/2), still at old source `d74b30d97e97a01ce55171f1931c685d51f4d180`. Real GET-only results remain NOT PASS:

- Active version and script settings lack 7 production bindings: HISTORY, MAPS, EVENTS, PARENT_HISTORY_RATE, PARENT_WS_RATE, PARENT_GEOCODE_RATE, PARENT_COMMUTE_RATE; development lacks the last two quotas.
- Expected Queue and DLQ absent from paginated account listing; active source Git SHA unavailable.
- R2 metadata and Access app/policy read blocked by token scopes. D1 metadata catalog HTTP401 (D1 Read required).
- Anonymous parent probes: 9 expected outcomes, 2 production local-login redirects inconclusive, production /parent/login publicly 200 fails Access-first policy. Protected APIs still deny anonymous/forged dev marker requests. This does not demonstrate exposure of family records.

Token owner must add only scoped **Workers R2 Storage Read, Access Apps and Policies Read, D1 Read** on the existing dedicated audit token/account and rerun read-only attestation. Do not paste tokens or substitute deployment credentials.

## Next execution gates, preserve all prior work

1. Inspect exact new hosted source CI, resolve regressions before claiming source closure.
2. Obtain read-only metadata scopes, verify active source, prod/dev D1 isolation and Access app/policy.
3. Prepare authorized binding/Queue/Access remediation with rollback; no production release before separate accepted branch and final PASS.
4. Upgrade isolated live drill to actual current D1/R2 snapshots plus DO state/inventory, destruction and recovery; exercise scale/limits and rollback.
5. Complete live Queue crash/ACK/retry/DLQ and cross-store revocation faults, session ownership/WS reconnect/hibernation, retention and release rollback. Keep all 19-section matrix and 525 requirements traceability honest.

**No 8D final acceptance; no Phase 8E/8F started.** Frozen Android `2c492efff01095e17f96af3c24ac07ac0b5c3739` unchanged.
