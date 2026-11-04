# Phase 8D — Security progress (P8D-003, P8D-006)

**Retested source SHA:** `168b192f2912a44144d55ec2bae3bc64d1580e58`.
**Scope:** source/CI negative tests, not live Cloudflare attestation.

## Development parent login (P8D-003)
- Previous `wrangler.development.template.jsonc` publicly shipped SHA-256 of a reusable six-digit code. Rate limiting alone cannot turn that published 1,000,000-option verifier into a strong secret.
- `b096a712` replaces it with `DEV_PARENT_LOGIN_HASH` provisioned through Wrangler Worker **secret** binding, not `vars`; actual token must be random base64url with at least 32 random bytes. Existing short codes are rejected; an unset secret fails closed.
- Setup requires `BRICK_DEV_PARENT_ACCESS_TOKEN` supplied privately before any account mutation, then hashes it and sends only the hash via Wrangler secret put without logging values.
- CI [41784259743](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41784259743) passes six-digit rejection, wrong/missing secret, correct token, rate limiting, Origin, cookie flags, logout/session revocation and forged internal parent-header removal.
- **Live beta was not deployed, rotated or reauthenticated.** The old weak verifier remains in public Git history and could remain on an older deployed Worker. Existing 30-day D1 sessions may remain valid after authentication changes. Must establish live beta exposure and rotate/revoke old credentials/sessions with authorized operator action.
- P8D-003 remains **P1 provisional OPEN** pending live exposure/credential rotation/session validation.

## Revoked-device control mutation (P8D-006)
- Prior `worker-v9.ts` dispatched P8B Live Track/Wi-Fi routes without old `worker-v6` archived-device guard. Source handlers could mutate DB for revoked devices.
- Negative CI [41784727728](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41784727728) failed on exactly this condition before fixes.
- `168b192f` introduces mandatory active-device lookup, and conditional SQL INSERT/UPSERT/DELETE based on `revoked_at IS NULL` with a postcheck for Wi-Fi.
- Identical negative regression and full TypeScript/build/backup CI [41784886446](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41784886446) SUCCESS.
- Source fix verified; real Cloudflare D1 concurrency and deployed Worker API negative tests are pending. This is not complete 8D.13 sign-off.

## Other mandatory security sections still unverified
8D.2 endpoint inventory and live method probes; 8D.3 device P-256 cross-device/epoch/revocation/replay; 8D.4 malformed payload; 8D.10 WebSocket auth; 8D.11 live Access JWT; 8D.12 CSRF full mutation matrix; 8D.14 rate limits; 8D.15 history/artifact/log secrets and deployed frontend; 8D.19 release provenance/rollback.
