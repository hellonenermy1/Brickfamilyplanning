# Phase 8D — Live Cloudflare metadata attestation: actual result (2026-11-04)

**Authority:** `Brick V1 Phase 8 Full Audit Execution Plan(6).pdf`, 8D.1, .2, .9, .10, .11, .14, .17, .19 (pp.44–54). Phase 8D remains **IN PROGRESS / NOT PASS**. This gate is read-only metadata access, **not** D1/R2/DO disaster recovery.

## Actions taken

Created `scripts/phase8d-cloudflare-readonly.mjs` and `scripts/test-phase8d-cloudflare-readonly.mjs`; added independent `.github/workflows/phase8d-cloudflare-readonly.yml`. The script:
- Allows **GET only** on nine exact Cloudflare API endpoints; explicitly rejects all paths outside this allowlist and refuses requests without a configured token AND 32-hex account ID.
- Uses `CLOUDFLARE_AUDIT_READ_TOKEN` (a **dedicated scoped read-only token**). It **never uses the production deployment token** and does not query user records, R2 object bodies, secret values, Worker code, or live logs.
- Stores only sanitized check results and metadata in `phase8d-live-readonly-result.json` and a GitHub summary. A missing/invalid credential, API permission, wrong configuration, or partial response is **BLOCKED/DRIFT**, never a false PASS. The live job exits nonzero.
- Confirms seven disjoint conditions when a real scoped account read is available.

## The seven live verification targets

| Target | Plan reference | Actual criterion | 2026-11-04 live status |
|---|---|---|---|
| 1. Active **production Worker deployment** | 8D.1/19 | Real deployment ID, source Git SHA annotation and version traffic percentage | **BLOCKED — no usable audit credential** |
| 2. Active **development Worker deployment** | 8D.1 | Independent deployment/version provenance | **BLOCKED** |
| 3. Production **bindings and storage targets** | 8D.1/14 | D1, DO, Queue, R2 and six rate-limit binding names plus the actual history/maps/queue targets | **BLOCKED** |
| 4. **Development/production isolation** | 8D.1/11 | D1 references distinct; dev login rate bindings; no production history/Queue binding | **BLOCKED** |
| 5. Actual **Queue + DLQ** | 8D.9/18 | Both Queues exist, consumers present, intended DLQ/retries, neither paused | **BLOCKED** |
| 6. Actual **R2 lifecycle** | 8D.17 | Four precise object deletion/multipart rules enabled and with correct prefixes and ages | **BLOCKED** |
| 7. **Cloudflare Access app presence** | 8D.10/11 | Exactly one production `/parent*` Access app declared | **BLOCKED** |

**Evidence:** [initial read-only audit workflow 41827328187](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41827328187): synthetic unit contract job **SUCCESS** (positive fixture, seven independent drift/failure cases, missing credential fail-closed, GET-only), **live job FAILED/BLOCKED** before making any account request because a required dedicated credential/account ID was absent or invalid. The run did not disclose token values. Further source update emits separate missing-token/account-ID reasons without disclosing values.

No live claims should be converted to `INTEGRATION VERIFIED` based on this source test. A source `wrangler.template.jsonc` is not evidence of a deployed Cloudflare binding. A configured `/parent*` Access app alone is **not** evidence of adequate Access policy, JWT issuance, individual family authorization, or WebSocket revocation.

## Safe exact steps to unblock the next phase

- A repository/cloud administrator provides a *separate Cloudflare API token with read permissions only* for Worker scripts/deployments/settings, Queues, R2 bucket configuration, and Access application metadata, restricted to the intended Brick Cloudflare account. Store it as **GitHub Actions secret** `CLOUDFLARE_AUDIT_READ_TOKEN`. Never share the token in chat or CI logs.
- Configure `CLOUDFLARE_ACCOUNT_ID` as an Actions secret or repository Actions variable. The workflow will never guess which account to inspect.
- Rerun the `Brick Phase 8D — Cloudflare READ-ONLY Account Attestation` workflow on `v1-p8d-backend-deep-audit`, then inspect the sanitized PASS/DRIFT/BLOCKED artifact. Its `push` trigger only runs when the attestation scripts/workflow change; it is **not** part of production deployment.
- Only after actual metadata attestation, use a **separate isolated test environment with synthetic data** for destructive D1/R2/DO restore, WS hibernation/revoke, Queue/DLQ and rollback. This read-only gate does NOT authorize destructive tests or production changes.

## Additional work in this turn

A separate pre-existing 8D.18 test `scripts/test-phase8d-delivery-denominator-sqlite.mjs` was intermittently failing because synthetic events were timestamped just before a synthetic device enrollment. The fixture now sets enrollment 10 seconds before its events, eliminating the invalid test setup without weakening production delivery arithmetic. Source CI [41827493772](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41827493772) passed all **3 jobs** and returned 75% for 3/4 expected packets and null/unmeasurable for the extreme sequence discontinuity.

## Remaining hard requirements

All 19 8D sections still require their actual approved exit evidence; among others: active Cloudflare deployment identity, live method/auth/cross-family behavior, D1→Queue→R2 and DO crash injection with no false ACK, WebSocket session expiry/revocation, **complete real isolated D1 + R2 + DO restore**, age-based deletion and log/CDN secret audit, release migration and rollback. No Phase 8D PASS and no authorization for 8E/8F.

### Latest explicit missing-credential result

[GitHub audit workflow **41827760516**](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41827760516) retested after separating token-vs-account failure messages. The synthetic read-only seven-gate unit job **SUCCESS**. The actual Cloudflare metadata job **FAILED/BLOCKED** before any HTTP request with the exact sanitized reason: **“Dedicated read token AND account ID missing/invalid; no account requests made.”** This means the GitHub Actions job received neither a usable `CLOUDFLARE_AUDIT_READ_TOKEN` nor a valid 32-hex `CLOUDFLARE_ACCOUNT_ID`; it does not establish whether a token exists elsewhere in the user's account. Do not mark Cloudflare binding, Queue, lifecycle, Access or deployment facts verified. The main source CI [41827760587](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41827760587) separately passed all 3 jobs.
