# Brick V1 Phase 8D — Permanent findings ledger

**Opened:** 2026-11-04. **Source baseline:** `70a3c287425e9276585fbff85909dcf699dcf2f2`. An audit observation must be recorded before code remediation. Findings below are **OPEN — SOURCE CONFIRMED / RUNTIME RETEST PENDING**, not silently closed.

## P8D-001 — Deployment pipeline incompatible with new production Worker entry
- **Sections / requirements:** 8D.1, 8D.8, 8D.19; `OPS-011`, `OPS-012`, `BE-001`.
- **Severity:** **P1**, release deployment blocked when using checked-in production workflow.
- **Expected:** deploy script provisions and deploys the *approved current* production Worker entry at pinned commit, including compatible migrations, after preflight and without modifying Android.
- **Actual source evidence:** `wrangler.template.jsonc` specifies `src/worker-p8b.ts` and `1.0.0-rc.1`; `.github/workflows/deploy-brick.yml` explicitly requires old `src/worker-v9.ts`, schema 15 and old branch `v1-p8-cloud-hardening`; `scripts/setup-v1-phase6.mjs` checks `src/worker-v9.ts`; `scripts/setup-v1-phase8-finalize.mjs` and `scripts/verify-cloudflare-deployment.mjs` assume old Worker/release.
- **Reproduction:** strict offline consistency test requiring the actual `main` in all production scripts to match current Wrangler template, and actual latest D1 migration to be included; this is expected to fail at baseline. A live production deploy has **NOT** been attempted.
- **Impact:** automated deployment of the current source cannot be trusted; stale Worker/schema/config may be accepted or the workflow fails before deploying.
- **Root cause hypothesis:** Phase 8B template and migrations advanced without updating the earlier production setup workflow.
- **Required correction:** align setup/deploy/verification to explicit production contract with migration preflight and non-destructive upgrade; execute dry-run and isolated D1 migration tests; only then consider an explicitly authorized live deploy.
- **Fix SHA / regression / retest:** NOT YET.
- **Status:** **OPEN**.

## P8D-002 — Backup and restore schema coverage drift
- **Sections / requirements:** 8D.8, 8D.16, 8D.17; `OPS-002`, `OPS-003`, `OPS-011`.
- **Severity:** **P1**, potential loss of required configuration/command/state on disaster restoration; actual data-loss reproduction pending.
- **Expected:** every required durable database state has explicit backup and restore or documented safe reconstruction/exclusion, and a *real isolated destructive restore* reproduces device identity/history/configuration relationships.
- **Actual source evidence:** `src/backup-v6.ts` `BACKUP_TABLES` and `src/backup-restore-v6.ts` `RESTORE_ORDER` enumerate 12 tables predating migrations 016–018; migration 016 creates live-track commands, Wi-Fi schedules, Wi-Fi results, capability profiles, screen-time daily, commutes and provider cache; 017 provider-rate windows; 018 pairing-PIN sessions. `scripts/phase8-live-brick-backup-restore.mjs` only applies the old schema through 015 in its source/target drill.
- **Required analysis:** distinguish transient/reconstructible tables (pairing PIN, rate windows, provider cache) from persistent user configurations, current commands, device capability, screen-time and commute records; test retention and restore invariants without restoring expired secrets or replaying old commands.
- **Reproduction:** compare every D1 table to explicit backup policy; fixture with non-empty current required tables; destroy only isolated fixture DB; validate restore. NOT YET RUN.
- **Required correction:** full explicit inventory and versioned restore with future schema compatibility, atomically reconciled state and destructive isolated drill.
- **Fix SHA / regression / retest:** NOT YET.
- **Status:** **OPEN**.

## P8D-003 — Public development beta authentication secret has low entropy
- **Sections / requirements:** 8D.11, 8D.14, 8D.15; `SEC-006`, `SEC-013`, `SEC-014`.
- **Severity:** **P1 provisional** if this public-template code hash is used by an Internet-reachable service with real parent/child data; **live exposure and impact NOT VERIFIED**.
- **Expected:** development backend is strictly isolated and uses sufficiently strong authentication; no reusable low-entropy parent credential-derived verifier is published as a public template constant.
- **Actual source evidence:** `wrangler.development.template.jsonc` contains `DEV_PARENT_PIN_HASH` of reusable six-digit code; `src/dev-parent-auth.ts` validates SHA-256(code), has 30-day D1 session cookie, and IP-based rate-limit. Code search does not establish whether that token is currently live.
- **Reproduction:** source-based finite code-space verification; only non-invasive live exposure test after verified domain/authorization. DO NOT brute-force any live login.
- **Required correction:** remove low-entropy published credential verifier from public source, use isolated secret-based development access and robust replay/rate-limit/session controls; rotate any potentially exposed beta code through secure out-of-band administration.
- **Fix SHA / regression / retest:** NOT YET.
- **Status:** **OPEN — live exposure unknown**.

## P8D-004 — HTTP ACK versus asynchronous R2 history durability must be formally proven
- **Sections / requirements:** 8D.5–8D.7, 8D.9; `BE-006`, `BE-007`, `BE-010`, `DAT-011`.
- **Severity:** **UNCLASSIFIED PENDING REPRO**, NOT a confirmed defect.
- **Evidence to inspect:** `src/location-ingest-v6.ts` enqueues accepted location into `EVENTS` before D1 write and returns ACK after D1/DO/safety; `src/history-store.ts` performs R2 `raw` and `trusted` puts and ACKs Queue only after both finish. Must prove all crash/order/failure boundaries, Queue→R2 contract, long-term history integrity and exactly what success ACK promises.
- **Reproduction:** Queue publish success + D1 failure, D1 success + response lost, DO failure after D1, R2 partial/duplicate/concurrent write, DLQ poison and retry expiry.
- **Status:** **AUDIT TARGET / UNKNOWN**, no P1 assigned without evidence.

## P8D-005 — Development and production authentication separation requires runtime attestation
- **Sections / requirements:** 8D.1, 8D.3, 8D.10–8D.12.
- **Severity:** **UNCLASSIFIED PENDING REPRO**, NOT confirmed defect.
- **Evidence:** production `src/access-auth.ts` validates Access RS256 JWT for parent routes, while `src/worker-v10.ts` allows D1 development sessions and strips client-supplied internal auth header. Validate the outermost Worker, deployed `APP_ENV`, routes, and cross-environment non-bypass.
- **Status:** **AUDIT TARGET / UNKNOWN**.

**Audit rule:** Fix SHA, actual reproduction run and passing retest are required to transition to `FIXED → RETESTED → VERIFIED CLOSED`. No P0/P1 exception permitted for Phase 8D PASS.
---

## 2026-11-04 CI reproduction and first targeted remediation

**Original pre-fix CI:** [41776381607](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41776381607), commit `14b81332898f33e426e2cd29be8730b6984e2e31`.
- P8D-001 deployment contract **FAILED 9 checks** covering outdated setup worker, missing 016–018 migration, stale release verifier/finalizer and obsolete workflow branch.
- P8D-002 D1 backup contract **FAILED 3 checks** proving the 12-table snapshots/restore are missing essential P8B state and current isolated drill migration chain ends before 016.
- Cloudflare/TypeScript build and parent asset build **PASSED** at original source; these green checks did not waive any audit finding.

**First production-code correction on audit branch (no deploy):**
- `scripts/phase8d-schema-compat.mjs` introduces five explicitly matched SQLite column definitions, stripping only their non-idempotent `ALTER TABLE` statements from the schema 016 `CREATE TABLE IF NOT EXISTS` portion; any unexpected ALTER/source drift fails closed.
- `scripts/setup-v1-phase6.mjs` now selects `src/worker-p8b.ts`, applies 016–018, and runs the five ALTERs using D1 `PRAGMA table_info` introspection. Older 001–015 chain remains intact.
- `scripts/setup-v1-phase8-finalize.mjs`, `scripts/verify-cloudflare-deployment.mjs` and `.github/workflows/deploy-brick.yml` now demand schema 018, `1.0.0-rc.1`, `worker-p8b.ts`, and all relevant D1 P8B tables.
- The production deployment workflow is still **manual dispatch only** and now refuses to deploy from the Phase 8D audit branch. It requires a separately created `v1-p8d-accepted-backend` branch and a PASS acceptance record. That release branch was **NOT created** and **no live Cloudflare deployment was run**.
- `scripts/test-phase8d-schema-compat.mjs` and the dedicated audit CI independently test a fresh D1 SQLite migration chain 001→018 and a second application of schema-016 idempotent CREATEs/017–018. They do not modify production data.

**Retest on exact correction SHA `e62b301f3bd99ee3e10aab41134573dbb00c7165`:** [41777166077](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41777166077).
- P8D-001 source-deployment contract job `126400087987`: **SUCCESS, zero failed checks**.
- Source build/typecheck/parent assets + real SQLite migration replay job `126400087879`: **SUCCESS**; log explicitly says `PASS schema 001-018 additive migration + repeated 016 CREATE/index statements`.
- P8D-002 backup job `126400088134`: **FAIL (3 checks)** as expected; backup table coverage and full 016–018 destructive restore remain uncorrected.

**Revised P8D-001 disposition:** **FIXED → SOURCE/CI RETEST VERIFIED; LIVE DEPLOYMENT/CLOUDFLARE PROVENANCE NOT VERIFIED.** Do not mark the entire 8D.1 or 8D.19 PASS until the deployed Worker/script/route/migration/rollback proof is obtained. **P8D-002 remains OPEN P1.**

**No audit weakening:** pre-fix failures are preserved, strict source checks remain in the workflow, source drift triggers failure; no API tokens/credentials were copied into repo.


## P8D-006 — Revoked devices may receive new P8B control records (reproducing)
- **Sections:** 8D.2 / 8D.3 / 8D.13; source: `src/worker-v9.ts:144–153`, `src/p8b-controls.ts:16–26,42–61`.
- **Severity:** P1 provisionally (revocation/control boundary), pending regression evidence.
- **Expected:** a revoked or absent device can never receive new Live Track activation or Wi-Fi schedule writes; a parent mutation must return a truthful error.
- **Source finding:** P8B routes dispatch direct control handlers after parent authentication, without the revoked-device lifecycle gate enforced in older `worker-v6.ts`. The Live Track UPSERT and Wi-Fi schedule batch do not require `devices.revoked_at IS NULL`.
- **Reproduction:** synthetic revoked-device D1 stub invoking both real exported handlers; run a pre-fix negative CI test before remediation. Additional concurrency/race verification required.
- **Status:** OPEN — SOURCE CONFIRMED, runtime test pending.


## 2026-11-04 exact-source continuation: P8D-002, P8D-003, P8D-006

**P8D-002 source corrections and verified retests:**
- Commit `5138b3c3fd28df98c7b0b1598fb8f02e3ee0c7f8`: 18-table versioned `brick-d1-snapshot-v2` backup + restore; accept only exact 11/12-table historical v1 snapshots or exact 18-table v2 snapshots; reject missing/extra v2 tables; persist newly added Wi-Fi schedules/results, Live Track command history, capabilities, screen time, commutes; preserve device revocation and replay high-water; expire in-flight one-shot commands on recovery; intentionally omit pairing PIN, rate windows, provider cache.
- Commit `4e7bd489cefba9dec60c5d1cf03b8b31b8bb39e2`: nonempty P8B mock D1 restore tests and extended live D1-only destructive fixture script.
- Commit `694d2094524a4b8bc1971e7d7a6d7a1695af2eef`: true disposable SQLite source destroyed, new SQLite source schema applied, all 18 D1 tables restored, pending commands retired, temporary credentials/cache NOT restored; CI **PASS** [41783806915](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41783806915).
- Current **FIXED — SOURCE + REAL SQLITE CI VERIFIED, CLOUD D1/R2/DO RECOVERY UNVERIFIED**. This remains an **OPEN P1** pending Cloudflare isolated full-stack restore proof, continuity under writes, and R2/DO reconciliation. Do not call a local SQLite drill an actual D1 production-data recovery.

**P8D-003 development credential correction:**
- Commit `b096a712f9e260e3d9bc967517026590c404c2da`: removed the public six-digit SHA-256 verifier; worker/dev auth now requires high-entropy 43–128 base64url token; deploy script configures only its SHA-256 hash as Wrangler Worker **secret**, not as `vars`; unset secret fails closed. No login token/hash is logged. Unit tests cover wrong/short/missing secret, cookies, origin, rate, logout and forged internal marker.
- CI **PASS** [41784259743](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41784259743).
- Existing development Worker deployment still **UNKNOWN**. Git history still contains the compromised low-entropy verifier, so affected actual beta login must be rotated out-of-band and old D1 sessions revoked if the beta is live. **P1 provisional remains OPEN — live exposure/rotation not verified**.

**P8D-006 revoked-device P8B controls:**
- Baseline `src/worker-v9.ts:144–153` bypasses `worker-v6.ts` archived-device handling by dispatching direct P8B control routes. `parentSetLiveTrack` and `parentSetWifiSchedules` lacked revoked-device checks.
- Recorded first, then dedicated regression reproduced the P1 scenario: CI **FAIL** [41784727728](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41784727728) on `e1e6f9e1ebea450dae83a91076aa633bb2598399`.
- Fix SHA `168b192f2912a44144d55ec2bae3bc64d1580e58`: require active device before writes; Live Track SQL INSERT/UPSERT constrained by `revoked_at IS NULL`, Wi-Fi schedule DELETE/INSERT similarly guarded and postchecked.
- Exact same regression, typecheck, browser build, backup and deployment CI **PASS** [41784886446](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41784886446).
- **FIXED → RETESTED → SOURCE/CI VERIFIED**, Cloudflare D1/route concurrency and actual deployment remain unverified; do not declare complete Phase 8D security sign-off.

**Additional 8D.16 audit target (unclassified):** current `snapshotD1ToR2` walks multiple D1 tables with paged queries rather than a proven consistent cross-table snapshot while concurrent writes occur. Source inspection alone cannot show whether a recovery snapshot can tear across device/revocation/command states; reproduce with concurrent mutation and test consistency before closing 8D.16.

**Production data:** untouched. **Android production source:** untouched. **Cloudflare deployed Worker/Access:** not inspected.


## P8D-007 — Concurrent same-segment R2 read/merge/write may discard already-ACKed points
- **Sections:** 8D.5 / 8D.6 / 8D.9 / 8D.16; requirements BE-006/BE-007/BE-010/DAT-011.
- **Severity:** P1 provisional until adversarial same-segment queue replay reproduces data loss.
- **Source evidence:** `src/history-store.ts` reads each segment once with `existingSegment(HISTORY, rawKey)`, merges with the current Queue delivery, then writes `raw` and `trusted` objects with unconditional `HISTORY.put` in `Promise.all`. Two concurrent queue consumers targeting the same device/epoch/15-minute segment can both read the same previous generation and each overwrite the other's packet after an ACK.
- **Negative test:** `scripts/test-phase8d-history-concurrent-r2.mjs` uses an artificial barrier forcing two valid synthetic messages through the same segment with both initial raw reads completed before either put. It then requires *both acknowledged* packets in the raw segment and trusted receipt. This is source/behavior evidence, not a claim about observed production user data loss.
- **Status:** OPEN — FAILING REPRO PENDING.


## P8D-008 — Same (device, epoch, sequence) re-delivery can rewrite historical coordinates (8D.5)
- **Severity:** P1 provisional pending negative CI.
- **Source:** `src/history-store.ts` `mergePackets` first inserts the previous persisted rows into a Map and then overwrites identical logical sequence keys with the incoming queue rows. The database `INSERT OR IGNORE device_events` protects its index but `queueLocations` sends even duplicate signed uploads to R2, which can mutate a previously accepted history point.
- **Expected:** immutable first-accepted packet at the same device/epoch/sequence and earliest server receipt; duplicate delivery must be idempotently acknowledged without rewriting original raw or trusted history.
- **Reproduction:** `scripts/test-phase8d-history-idempotence.mjs` stores a synthetic packet, then re-delivers same epoch/sequence with altered latitude; independently checks raw and trusted R2 objects, sequence count and receipt. Run before fix.
- **Status:** OPEN — negative regression pending.


---

## 2026-11-04 Phase 8D.3–D.9 exact-source security and durability continuation

**P8D-007 CONCURRENCY REPRODUCED THEN FIXED — not yet Cloudflare-live-verified**
- RED exact source `ddd950be0aa79b91c32d6932b285d0bfe0082007`: [CI 41790943895](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41790943895), history test fails because two successful concurrent Queue deliveries yield final R2 raw sequence list `[101]` rather than `[100,101]`.
- Implemented conditional R2 generation-bound writes in `src/history-store.ts` using current Cloudflare documented `onlyIf` on `put`; existing object ETag check and first-write `If-None-Match: *`. Bounded 8-attempt re-read/merge on precondition conflict; both independent raw/trusted put results awaited before claiming success. If exhausted, Queue message is retried, not ACKed.
- GREEN exact source `6c71d8788e557cfe3831a79f99d706b6e204c062`: [CI 41791153745](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41791153745), same adversarial barrier retains both sequence records and trusted receipts.
- Source/CI result: **FIXED — RETESTED**, **live Cloudflare R2 conditional-write and multi-object consistency still unverified**.

**P8D-004 ACK / SAFETY FAULT SEAM TESTED, NOT CLOSED**
- [CI 41791370163](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41791370163) verifies synthetic first trusted R2 failure after raw success → no Queue ACK, retry → idempotent ACK; sustained conditional-write exhaustion → retry; safety receipt not present in D1 / D1 outage → retry; matching durable D1 safety row → ACK.
- For ordinary `ingestLocationV6`, HTTP ACK occurs after Queue send, D1 event/index batch, DO latest (when inserted), safety evaluation, optional bounded refinement; **R2 writes occur asynchronously in Queue consumer** and therefore HTTP ACK does NOT establish R2 history persistence. The queue's message ACK, not the HTTP ACK, is guarded on successful R2 writes. This is a documented distinction, not a claim of full end-to-end losslessness.
- Still needed: live Cloudflare Queue/DLQ redelivery/retry-window proof, R2 partial-failure cleanup, HTTP crash-window injection, actual DO persistence, history through backup/restore.

**8D.3/.4/.5 P-256 SIGNED HEALTH VERIFICATION, PARTIAL**
- [CI 41791527844](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41791527844) builds the actual `src/device-json-security.ts` and signs requests with real WebCrypto P-256. Valid sequence `100→102` is accepted; repeated `100`, delayed `101`, wrong key, wrong device, unknown/revoked device, modified signed body, missing signature, stale/future timestamp, malformed and oversized inputs are rejected without advancing the D1 replay watermark.
- This verifies **only the signed health replay route helper** and does NOT qualify all location, SOS, safety, Ground, Witness or WebSocket paths nor the PDF's entire 100/101/102 epoch matrix.

**P8D-008 SAME-SEQUENCE HISTORY REWRITE REPRODUCED THEN FIXED**
- RED exact source `43dc3f3c6b9c612640cf70e4839879e4174a5994`: [CI 41791762934](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41791762934), replaying same (device,epoch,sequence) with different latitude replaced a previously persisted raw history coordinate `13520000` with `13999999` (trusted history equally vulnerable).
- Root cause `mergePackets` loaded old records into a Map but then overwrote identical logical sequence keys from every incoming Queue delivery, despite D1 `INSERT OR IGNORE`.
- Fix SHA `6ef174d366932e75852d50667e8c836108d653da`: first committed packet wins; same-batch duplicates also preserve earliest copy. Earliest server receipt remains unchanged.
- GREEN [CI 41791862854](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41791862854), all three jobs, including original concurrent R2 and new replay integrity test. **Source/CI verified only; historical production R2 corruption and Cloudflare execution unknown**.

**Audit invariants:** No production deployments, Cloudflare account calls, Android changes, live-user data inspection, or source-branch merges occurred during these tests. No secrets added. All RED→GREEN evidence is retained. Phase 8D remains NOT PASS.


## P8D-009 — Public fallback pairing claim accepts an unverified device public key (8D.3/.4/.13)
- **Status:** OPEN — source-confirmed, failing SQLite/crypto regression pending.
- **Severity:** P1 provisionally (device enrollment identity integrity).
- **Expected:** a child claim can only move to parent-confirmable status with a canonical valid P-256 SPKI; invalid keys, malformed JSON and oversized unauthenticated bodies fail closed.
- **Actual source:** `src/pin-pairing.ts:70-82` checks `publicKeySpkiB64` length 32..2048 but never calls `canonicalDevicePublicKey`. The parent confirmation inserts that unchecked string into `devices`; the signed-device authentication layer then cannot verify it. Public `req.json()` is not byte bounded before parsing.
- **Negative test:** synthetic fallback PIN, invalid-length-but-not-P-256 SPKI, exercise actual public handler and ensure no claim/mutation; include true P-256 unpadded canonicalization and oversized body.
- **Production impact:** unproven without deployed endpoint confirmation; no live family data tested.

## P8D-010 — Competing parent confirmations: idempotency and error-contract audit (8D.8/.13)
- **Status:** AUDIT TARGET — exact SQLite concurrency experiment pending, not a confirmed orphan-device defect.
- **Severity:** P2 provisional (misleading 500 / recoverability under race), pending reproduction.
- **Expected:** at most one registration per claimed session and consistent idempotent confirmation result, including concurrent requests.
- **Source observation:** `parentConfirmPin` inserts unconditionally before the session's conditional `UPDATE`, but schema 015 has a **unique index on device public key**, and `DB.batch` is atomic. Thus a competing confirmation using the same claimed key is expected to hit uniqueness and roll back, **not create a ghost device**. A concurrent loser may receive a generic 500 rather than the existing confirmed device; test before classifying as a bug.
- **Negative test:** use real SQLite schema 001/015/018; inject a winning confirmation between another request's SELECT and batch, verify unique constraint/rollback and check the losing response.
- **Production impact:** unknown; do not claim orphan creation without evidence.

---

## 2026-11-04 exact-source continuation: P8D-009, P8D-010, Access JWT, epoch and secrets

**P8D-009 (P1 source defect — fixed, Cloudflare not attested):** Four negative cases reproduced [RED CI 41793189600](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41793189600): invalid length-valid SPKI accepted, missing canonical padded SPKI, >100KB public JSON accepted, invalid historical claim confirmed. Commit `a117776bd0756da20fd5cb8af9fdb3a1f803652d` enforces canonical genuine P-256 SPKI on child claim AND parent confirmation; caps parent/child PIN bodies at 4096 bytes. [GREEN 41793357237](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41793357237). Further Origin/CSRF + PIN rate-limit checks [GREEN 41794792235](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41794792235). **SOURCE/CI VERIFIED ONLY.**

**P8D-010 (P2 concurrent response defect — fixed):** Full current SQLite schema 001→018 confirms UNIQUE index prevents an orphan/ghost device despite competing parent confirmations. The losing confirmation returned a false 500: [RED 41794274779](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41794274779), `8bbb4a47`. Fix `7c9b0bc42a6def8bd2f38a2ce9c139e1bc7f9531` atomically conditions new-device INSERT and session UPDATE, checks actual D1 changes, resolves a previously confirmed winner and preserves its ID. Repeated confirm idempotent with one device: [GREEN 41794488568](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41794488568). Cloudflare D1 concurrency still unverified.

**8D.11 production Access JWT:** Actual RSA-2048 synthetic RS256 JWT verification with fake JWKS [GREEN 41793555257](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41793555257) covers proper signature, issuer, audience, expiry, future times, kid, algorithm substitution, tampering, missing token and production dev-marker denial. Not a live Cloudflare Access app configuration check.

**8D.5/.7:** Actual SQLite D1 event ordering with latest-state policy [GREEN 41793816979](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41793816979) covers 100/101/102 → 100/102/101/102/102, old/new epoch, fresh/stale capture, huge signed sequence jump. Huge jumps currently advance the logical watermark; risk classification/real DO interactions not fully tested.

**8D.15:** Built public parent assets scanned against server private credential markers [GREEN 41794954253](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41794954253), source `d52fff68ffb29b4d99a35cc34f03ec78f4dc8e91`. This is neither full Git history nor live CDN proof.

## P8D-011 — Existing authenticated WebSocket has no demonstrated session expiry/revocation
- **Severity:** P1 provisional; actual deployed exploit/user data impact NOT VERIFIED.
- **Sections:** 8D.10, 8D.11, 8D.13.
- **Source evidence:** `worker-v5b.ts` authenticates and verifies Origin at upgrade; `index.ts` proxies to per-device DO. `device-do.ts` accepts sockets and broadcasts to `ctx.getWebSockets()` without recorded per-socket expiry/authorization refresh. `worker-v6.ts` revokes device in D1 but does not explicitly close DO sockets. Development logout revokes D1 cookie session but does not notify existing DO subscription.
- **Required proof:** negative hibernation/socket test demonstrating current behavior, bounded reconnection/reauth implementation, close live subscriptions on revocation, real isolated DO test and browser reconnect verification. `parent-v6c.ts` has reconnect/backoff but production behavior still needs verification.
- **Status:** OPEN — SOURCE GAP / RUNTIME RETEST PENDING. Do not mark 8D.10 PASS.

---

## 2026-11-04 P8D-011 adversarial RED → GREEN continuation

**Requirement IDs:** BE-005, BE-002, PORT-029, SEC-005, PORT-032, COV-006 (current 525-ID ledger). **Sections:** 8D.10–8D.13; browser reconnection is also a Phase 8E dependency.

- **RED baseline (test-only code, no live deployment):** `2d624563a6380002ac0fd3bac267da57ba23d96a`, [CI 41797894520](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41797894520): actual bundled `BrickDevice.fetch("/ws")` accepted a missing-lease socket with HTTP 101 instead of rejecting it with HTTP 403. CI passed the unrelated build/backup/deployment jobs and failed the new targeted regression.
- **Remediation:** verified parent wrapper issues a short (maximum 30 s) expiry-bounded internal lease only after Access JWT or D1 development-session verification, replacing any attacker-supplied lease; core DO proxy forwards only sanitized grant/Upgrade headers. SQLite-backed DO hibernation sockets serialize expiry, check expiry before every broadcast, and schedule an idle expiry alarm. Legacy sockets lacking a grant fail closed after class reconstruction; durable per-device revocation fences both existing and future connections. Authenticated development logout closes active streams without permanently revoking the child identity.
- **GREEN tested source:** `1af0ebb8497d4f2ce38eb342645292f00368c623`, [Phase 8D CI 41798531256](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41798531256): all three workflow jobs passed including TypeScript, parent build, existing R2/D1/auth/backup regressions and the adversarial bundled DO runtime simulation for missing, invalid and inflated leases; snapshot, hibernation, idle expiry, device revocation, logout and pre-lease socket closure.
- **Limits / open work:** simulated DO/alarms, not real Cloudflare Durable Object/Access; no real browser long-session renewal/connection-gap or cross-family test; no active development beta credential/session rotation. Cloudflare alarms can be delayed, so the Phase 8E parent client should proactively renew before lease expiry rather than assume the alarm always fires exactly at 30 seconds. Verify public route/method access and actual socket invalidation in isolated Cloudflare deployment.
- **Disposition:** P8D-011 **FIXED → SOURCE/CI RETESTED, P1 provisional remains OPEN pending live isolated DO/WS + client renewal/revocation verification**. No production change or Android edit.

---

## P8D-012 — Endpoint audit matrix CSV header/row width discrepancy (8D.2)

- **Requirement ID:** COV-006. **Severity:** P2 audit-evidence integrity (not a proven runtime vulnerability).
- **Expected:** each 8D.2 endpoint field has exactly one named header; no shifted or unlabeled evidence fields.
- **Observed 2026-11-04:** `audit/phase8d/PHASE8D_ENDPOINT_MATRIX_V2.csv` contains 49 candidate route rows with **12 quoted fields** each while its header names **11 fields**. The unlabeled 6th value is uniformly `SOURCE ONLY`, shifting input/output/rate/logging/evidence/status interpretation for CSV consumers.
- **Reproduction:** count RFC-style quoted fields across 49 rows and compare to the header; create a fail-before-fix CI gate.
- **Correction:** add a `source_evidence_level` header in the 6th position; preserve all 49 rows verbatim except evidence revisions grounded in executed tests; CI-enforce consistent schema, unique routes, nonempty fields and declared verification states.
- **Status:** OPEN — finding recorded before remediation. Live endpoint reachability and complete route inventory remain separate 8D.2 tasks.
  
### P8D-012 exact-source correction and CI closure (2026-11-04)

- **RED:** `04a39b439b4c5b5c35819e438258b1473f71b2df`, [run 41799035064](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41799035064): new schema validator failed solely because 49 twelve-field rows had an eleven-field header. Two unrelated jobs passed.
- **Fix:** `48e82f1e461ff9fe99ffea4613908c54211926fe` adds `source_evidence_level` as field 6, preserving all 49 routes, adds exact P8D-011 scope/evidence for WS row without claiming live PASS.
- **GREEN:** [run 41799170739](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41799170739): all three Phase 8D CI jobs SUCCESS including the 49-row exact-width/uniqueness/explicit-status regression.
- **Disposition:** P8D-012 **FIXED → RETESTED → VERIFIED CLOSED** for **CSV evidence schema only**. Complete 8D.2 method/auth/input/output/rate/log evidence and runtime endpoint discovery remain pending.

## P8D-013 — Audit-log paths retain raw device/session identifiers (8D.15 / 8D.18)

**Severity:** P2 privacy/observability boundary; actual production log exposure not verified. **Source-confirmed:** `src/phase5c.ts` `safeAuditPath` records `new URL(raw).pathname.slice(0,240)` unchanged. For audited parent mutations, this can persist literal `/parent/api/device/<deviceId>/...` or `/parent/api/pair/pin/<sessionId>`. Query strings are already omitted. D1 audit access is authenticated, but raw identifiers are unnecessary to classify route operations.

**Negative regression:** call actual `recordAudit` with synthetic UUID/token-bearing path, assert the stored pathname contains no synthetic identifier and is a known route template; reject malformed/unknown path names by redacting them rather than storing arbitrary input.

**Required correction:** sanitize route parameters and unknown path segments before persisting; do not log query strings, tokens, raw coordinates, arbitrary headers, or full request bodies. Preserve a non-identifying route classification for observability. Scope is the D1 audit trail, **not** a claim that every Cloudflare/hosted application log is clean.

**State:** OPEN — finding recorded before targeted regression and remediation.

## P8D-014 — Raw/trusted production R2 history retention cannot be proved (8D.17)

**Severity:** P1 provisional privacy/data-lifecycle concern; actual deployed R2 lifecycle rules and stored object ages are UNKNOWN. The current portal `src/phase4.ts:getRetention` advertises `rawHistoryDays:30` and `trustedHistoryDays:90`, but the checked-in scheduled `runRetentionCleanup` deletes only D1 safety events/pairing tokens/device event index. `cleanupPhase5C` handles D1 crash/audit, `cleanupOps` D1 health, `cleanupPhase5RefinedHistory` handles separate hypothesis/refined objects, and `backup-v6` deletes old `backups/d1/` objects. The inspected `src/history-store.ts` contains no production raw/trusted R2 history delete/sweep, **but `scripts/setup-v1-phase6.mjs` ALREADY DEFINES `history/raw/` 30-day and `history/trusted/` 90-day Cloudflare lifecycle rules**. This later source inspection supersedes the earlier implication that no source retention rule exists. Actual deployed lifecycle state and legacy `history/<device>/` objects remain unknown without authorized read-only Cloudflare evidence.

**Required evidence and remediation decision:** inspect actual R2 lifecycle policy, retained samples and rules for `history/raw/` and `history/trusted/`; prove 30/90-day expiry, bounded failure/retry behavior, tenant/device scoping and no deletion of unexpired records; add CI/isolated R2 fault tests. If no policy exists, implement production-safe bounded cleanup and test before calling 8D.17 PASS.

**Status:** OPEN / LIVE RULE ATTESTATION, LEGACY COVERAGE + SAFE RULE MERGE; source already specifies 30/90-day rules, no production mutation authorized.

## P8D-015 — Dedicated history/WebSocket request limits not demonstrated (8D.14)

**Severity:** P2 provisional availability/resource-risk audit target. Production Wrangler source config has `DEVICE_RATE` (120/min) and `PAIR_RATE` (20/min), while development adds `PARENT_LOGIN_RATE` (6/min); OneMap has a separate D1 provider request budget. Source parent WebSocket upgrades and history read handlers authenticate, but no dedicated per-client history/WS rate guards were found in those paths. Edge-level WAF/Access/rate rules may exist in the Cloudflare account but are not observable here.

**Required:** actual Cloudflare rule snapshot, quota budgets, synthetic abusive-call and reconnect tests, distinct safe limits for authenticated parent history, socket reconnect and costly reverse geocoding without starving SOS; verify normal multi-device / shared-IP behavior. Do not re-use pairing budget blindly.

**Status:** OPEN — no live Cloudflare limits attested, no production change authorized.


### 2026-11-04 six-workstream source/CI continuation — precise findings

**Provenance:** full 3-job CI SUCCESS [41804788810](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41804788810) on `711bc3c1e54fe63659ddab629d05ff89bfdb65ae`. No live Cloudflare account access, data inspection, deployment, credential rotation or Android source changes.

1. **8D.2:** TypeScript AST matched the 49 production endpoint candidates against layered source; three additional development-only login/logout method records added. This is source route coverage, NOT a proof of every runtime method, authz or deployed route.
2. **8D.12:** Bundled actual `worker-p8b.ts` rejects 16 parent mutation variants × three forbidden/missing Origin values = 48/48 denied, with zero synthetic D1/DO mutations. Synthetic localhost auth, NOT live Cloudflare Access.
3. **8D.8:** Full current production source migration chain on native SQLite, 18 durable tables, FK/integrity, duplicate P-256 device-key and epoch/sequence uniqueness, invalid retention CHECK, preserved history after revocation, essential indexes; Cloudflare D1 migrations/concurrency/rollback still open.
4. **8D.9:** Six actual DLQ dispatch cases distinguish malformed/unknown device, D1 outage retry, missing SOS row retry, durable SOS ACK, and poison message retaining an unresolved incident. Real Cloudflare Queue/DLQ redrive and exhaustion remain unverified.
5. **8D.17:** Actual backend cleanup functions on disposable SQLite respect two different devices' per-device safety retention, crash/audit/health/device-event cutoff, open incidents and foreign keys. **P8D-014 OPEN** because production raw/trusted R2 history expiry remains unproved.
6. **P8D-013 8D.18 privacy:** RED [41804393333](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41804393333) on `e7acd3fe` shows actual synthetic device and resource UUIDs in `audit_log.path`. Fix `44e259c50417856d5b3d5724c23a641041b17ad3` uses a fixed path-vocabulary, redacts dynamic segments and records a 96-bit hash-derived device reference instead of raw `deviceId`; unknown paths fail closed. Exact test GREEN [41804618857](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41804618857), repeated in full [41804788810](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41804788810). **P8D-013 SOURCE/CI FIXED–RETESTED, deployed logging still unknown.**
7. **P8D-002 8D.16 additional NEGATIVE:** `scripts/reproduce-phase8d-backup-tear.mjs` uses a synthetic *atomic* two-table mutation between source backup table reads and captures old `devices` with new `device_capability_profile` in the same v2 snapshot. [CI 41804788810](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41804788810) deliberately logs **REPRODUCED OPEN**, not an acceptance PASS. This is a source/mock interleaving, NOT a live D1 race observation. Coherent D1 backup plus D1/R2/DO isolated restore is still **P1 OPEN**.

**Remaining substantive blockers:** P8D-001 actual deployed SHA/config; P8D-002 coherent full-stack disaster restore; P8D-003 development credential rotation and sessions; P8D-011 isolated real Cloudflare DO socket expiry/revocation/client reconnection; P8D-014 raw/trusted R2 retention; P8D-015 distinct parent history/WS rate policy. Other 8D.1–8D.19 contract checks remain partial/unverified. No inferred PASS; 8D OPEN.

---

## 2026-11-04 Phase 8D continuation: P8D-002, P8D-014–016 and session boundary

**Audit contract:** actual Phase 8 plan pp.44–54, sections 8D.8/.11/.13/.14/.16/.17/.19; no 8D exit gate has been met. No production deployment, Cloudflare account mutation, data/secret inspection, or Android source change.

1. **P8D-002 / 8D.16 coherent D1 backup:** prior RED [41808902999](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41808902999) confirmed the old per-table paged reads did not use a single transaction. Cloudflare documents `D1Database.batch()` executes all statements as one transaction. Remediation `src/backup-v6.ts` uses one 18-table transactional D1 batch, 500,001-row fail-closed upper bound per table, and no interim table reads. Source/CI run [41809094309](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41809094309) was all three jobs GREEN. **P8D-002 still OPEN:** per-table D1 snapshot atomicity has a simulated regression, but no actual isolated Cloudflare D1/R2/DO restore under concurrent writes or live rollback. Large realistic backup sizing and runtime limits require qualification.
2. **P8D-016 / 8D.13 revocation TOCTOU:** real SQLite negative test [41809158623](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41809158623) demonstrated `parentSetLocationControl` returned HTTP 200 and inserted a one-shot command after revocation between SELECT and INSERT. `2a3dd8ce` changes both INSERT and UPSERT to conditional `EXISTS(revoked_at IS NULL)`, with result-row count fail closed HTTP 410; positive/negative SQLite test [41809290791](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41809290791) GREEN. **P8D-016 source/CI FIXED and retested, live concurrent D1 verification pending.**
3. **P8D-014 / 8D.17 R2 retention CORRECTION:** production `scripts/setup-v1-phase6.mjs` already contained Cloudflare 30-day raw, 90-day trusted, 30-day raw-evidence and seven-day incomplete multipart rules. Source risk was **blind lifecycle PUT replacing unrelated rules**; new `scripts/phase8d-r2-lifecycle-merge.mjs` reads existing rules, preserves unrelated rules, rejects overlapping unmanaged delete policies and malformed response before PUT. `PHASE8D_R2_LIFECYCLE_TARGET.json` is reference only, **never deployed**. Legacy history retention and actual deployed lifecycle verification remain OPEN.
4. **P8D-015 / 8D.14 parent expensive-read limits:** new authenticated `worker-p8b.ts` dedicated, fail-closed `PARENT_HISTORY_RATE` (60/min) and `PARENT_WS_RATE` (30/min) per Cloudflare edge-client IP; separate production/development namespaces and adversarial missing-binding, malformed/cross-origin WS and 429 tests. [41809496915](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41809496915) all three jobs GREEN. **Still OPEN:** real edge quotas, NAT/shared IP, browser multi-tab/reconnect, device-family budgets and denial-of-service suitability have not been field-tested.
5. **8D.11 dev-session expiry:** new exact-expiry/multiple-session test RED [41809656810](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41809656810): equality with `expires_at` accepted exactly expired credentials. Changed comparison to strictly greater and cleanup to expire-at-or-before; [41809934540](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41809934540) all three jobs GREEN. Tests also cover independent randomized cookies, Origin-protected selective logout and fixation resistance. Live dev-session rotation/P8D-003 remains OPEN.
6. **8D.19 release security:** new source test `scripts/test-phase8d-release-gates.mjs` checks immutable SHA-pinned actions, production accepted-branch + Phase8D FINAL PASS fence, exact commit SHA, lockfile install, npm vulnerability gate, strict deploy, independent production/development entries, and presence of new backup/revocation/rate regressions. These are **source release-guard checks, not an actual deployment or rollback.** Real branch protection and Cloudflare rollback evidence remain OPEN.

**Provisional decision:** Continue Phase 8D only. Green unit/SQLite/CI checks are not release acceptance. Source fixes require an isolated Cloudflare environment, actual resource and lifecycle attestation, and operator-approved credential/restore/rollback tests before Phase 8D can pass.

## P8D-017 — Browser live-socket previous-child event crosses selected-device state (8D.10)

**Severity:** P1 provisional child-location presentation isolation / stale-data trust. **RED source execution:** CI [41811596033](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41811596033) on `2a184049` executed the generated *production* parent `connect(id)` function under controlled browser WebSocket/timer simulation. A pending old socket message from child A was processed by the active child B dashboard after switching (`received=1`, expected `0`). Existing code also lets an old `onclose` clear the new child refresh timer; and reconnects after terminal 4003 device revocation/session end, which can flood rate limits. This is a source/browser-simulation observation, not proof of a live data leak between independent parent accounts. Development portal uses a separate connection patch and needs the same identity/lifecycle guarantee.

**Must fix:** event handlers must check the captured socket identity **and** currently selected device, stale events/close callbacks cannot mutate current UI/timer, terminal 4003 must stop reconnection, normal 4001 expiry must reconnect with bounded backoff, one fallback refresh timer per current child, async refresh response must be checked after completion. Add executed regressions on BOTH rendered production and development parent pages, plus server-side Worker grants/Origin/device routing. Preserve Phase 8C Android image; no live deployment.

**State:** OPEN — RED first, then exact-source fix and green verification.


### P8D-017 / P8D-011 source-level remediation — 2026-11-04

**Four targeted 8D.10 checks, all source/CI only; no production access.**

1. **Authenticated full Worker upgrade:** new `scripts/test-phase8d-ws-worker-boundary.mjs` executes bundled `worker-p8b.ts` and confirms five invalid upgrade/Origin/method attempts denied before DO, spoofed `X-Brick-Internal-Ws-Lease-Until` replaced with a verified <=30s Worker grant, no Cookie/Access assertion passed to DO, two distinct child IDs route to separate DOs, missing rate binding returns 503, nonexistent child returns 404, production without Access JWT rejects. This uses synthetic localhost auth and does not attest live Cloudflare Access.
2. **Browser selected-child isolation:** RED [41811596033](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41811596033) on `2a184049`: production rendered `connect()` processed the previous selected child's queued message. Shared `PHASE6_WS_CONNECT_CODE` now guards callbacks by both captured socket identity and selected child; old-close callback cannot clear the current refresh interval. `refreshPhase5State` rechecks the selected child **after** awaited HTTP to prevent stale state painting B.
3. **Revocation, idle expiry and reconnect:** generated production `parentV8Html()` and development `parentV7LiveHtml()` source functions are exercised in Node `vm` with mock WebSocket/timers. Terminal 4003 (device revoked/session closed) stops reconnect and clears polling; ordinary 4001 reestablishes with 1–15 second capped backoff, and one current device fallback timer remains. Existing `scripts/test-phase8d-ws-session.mjs` checks real bundled DO code under test shim, stored grants/alarms and persistent device revocation, but NOT real Cloudflare hibernation.
4. **Proactive lease renewal:** RED [41812278224](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41812278224) after adding a test: no proactively scheduled new authentication before the 30s lease. Added a current-socket guarded 24-second renewal timer, cleared on old device switch, close or replacement. Test exercises renewal and asserts retirement of old socket. This intentionally creates periodic short lived sockets, and neither zero-gap handover nor real mobile browser tab-throttling is proven.

**GREEN complete baseline:** exact code `86b6b9295b2d1a58d37ff0addf37de35a4d3d3d5`, [Phase 8D CI 41812573198](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41812573198), all **3** jobs successful. Browser tests use generated real production/development HTML `connect()` and `refreshPhase5State()` functions, but mock WebSocket/network/timers; full Worker boundary tests simulate D1/DO. Previous accepted Phase 8C Android source/ APK unchanged.

**Finding disposition:** P8D-017 **FIXED → SOURCE/CI RETESTED**. P8D-011 8D.10 **P1 provisional OPEN** pending isolated Cloudflare Access+DO real WebSocket upgrade, 30s alarm/hibernation and expiry timing, device revoke/logout concurrent-upgrade race, per-family/session isolation, real browser sleeps/tabs and sustained live stability. The D1 development logout currently closes all device sockets; per-session targeting is not demonstrated. Never claim a live PASS from these simulations.

---

## 2026-11-04 next-source deep audit — findings to verify before any fix

**P8D-018 / 8D.4 — fall-event pre-auth, unbounded JSON read (P1 provisional).** `maybeHandleFallEvent` calls `req.clone().json()` before its `validateSafetyReplayWindow()` signature/body cap, then assumes a non-null object. Test 8KiB+ unauthenticated fall body and null/array; require a bounded read and consistent 400/413, with no D1/DO/Queue effects. Do not claim live exploit.

**P8D-019 / 8D.3/.5 — signed screen-time non-monotonic daily overwrite and revoked-device time-of-check/time-of-write (P2 provisional).** `ingestScreenTime` checks device revocation before signature validation, then unconditionally overwrites the day row on CONFLICT. Older signed capture can overwrite a newer aggregate; revoked device can win after auth SELECT. It also assumes parsed JSON is a non-null object. Test against real SQLite, wrong/missing signature, stale captures, and post-read revocation.

**P8D-020 / 8D.3/.5 — signed health replay write after device revocation race (P2 provisional).** `reserveHealthReplay` reads active device before verifying signature but its `device_replay_state` INSERT/UPSERT does not condition on current `devices.revoked_at`. Test actual SQL interleaving; ensure no replay state advances after revocation without changing accepted replay behavior.

**P8D-021 / 8D.5/.6/.7 — location ingestion Queue/DO may outlive device revoke (P1 provisional).** After authorization once, `ingestLocationV6` enqueues first, then `persistAccepted` INSERTs events without a revocation predicate and may update DO despite a revoked D1 identity. An active→revoked interleaving before Queue send must not add post-revocation history/live state or produce HTTP 200. Test single + batch/preview, durable ACK semantics, and duplicates; explicitly retain queue-at-least-once and two-store non-atomic limitations.

**P8D-022 / 8D.4/.14 — OneMap reverse endpoint treats missing coordinates as numeric zero (P3 input contract).** `Number(searchParams.get(...))` makes null/blank 0, which is a superficially valid Earth coordinate, and may return 200 outside-Singapore result instead of an input error. Test missing, empty, NaN, Infinity, out of bounds; do not consume provider budget on malformed input.

**P8D-023 / 8D.18 — bounded scheduled commute refresh cannot reach devices beyond first 100 (P2 provisional operational fairness).** Current `worker-p8b.scheduled` performs `SELECT ... ORDER BY id LIMIT 100` every invocation without paging/cursor, so eligible devices past first 100 are never refreshed by this scheduled path. Test pagination/cursor with synthetic 105+ devices; keep per-run work bounded, don't starve critical SOS/health, and do not assert production scale without telemetry.

These six are **source-supported hypotheses** pending executed RED reproductions and fixes; all Phase 8D live Cloudflare gates remain open.


### 2026-11-04 verified six-workstream continuation — RED → GREEN, no live attestation

**Authoritative exact code/workflow SHA:** `938e3666e863f3836ac6ce64657d73c6a3b0d8c6`. **Full three-job CI PASS:** [41815897999](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41815897999). All new tests use generated synthetic data, real native SQLite under current production SQL migrations and/or actual bundled Worker module functions. Neither Cloudflare resources nor Android were modified.

| Finding | Pre-fix negative proof | Remediation / final source test | Remaining uncertainty |
|---|---|---|---|
| **P8D-018**, 8D.4, provisional P1 | [RED 41815113010](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41815113010) fall JSON >20KB processed before signed-body cap and returned 401 rather than bounded 413 | `src/fall-event-route.ts` now reads max 8192 bytes ahead of parsing, rejects null/array/primitive/malformed roots, preserves non-fall delegation and signed small fall requirement; [GREEN 41815897999](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41815897999) | Real streaming/Cloudflare memory/latency, adversarial signed fall semantics and all other event-route inputs pending |
| **P8D-019**, 8D.3/.5, provisional P2 | [RED 41815219163](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41815219163) earlier signed capture 400,000ms overwrote newer 800,000ms summary for same day | `src/screen-time-route.ts` conditions atomic D1 INSERT/UPSERT on active device AND strictly newer signed `capturedAtMs`, returns idempotent duplicate instead of overwriting, validates JSON object. Real SQLite after-auth revocation test [GREEN 41815897999](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41815897999) | Clock rollback/corrections, true phone retention and shared-device runtime still need tests |
| **P8D-020**, 8D.3/.5, provisional P2 | [RED 41815354577](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41815354577) D1 high-water advanced after revocation between signed key SELECT and replay UPSERT | `src/device-json-security.ts` atomically verifies active identity for INSERT AND conflict UPDATE; explicit 401 if revoked vs 409 if ordinary replay. Native SQLite + real P256 signatures [GREEN 41815897999](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41815897999) | Real D1 concurrency and complete child-auth path matrix still pending |
| **P8D-021**, 8D.5/.6/.7, provisional P1 | [RED 41814765962](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41814765962) revoked device persisted history index after stale auth check; **additional RED** [41815827201](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41815827201) proved revoked device also wrote `phase5_precise_endpoints` despite outer D1 check | `location-ingest-v6.ts` conditionally INSERTs device_events under active D1 guard, checks active UPDATE in same transaction, moves Queue enqueue after D1 active decision and returns retryable 503 if Queue unavailable; preview performs additional D1 check. `phase5-refined-history.ts` precise endpoint INSERT also atomically checks device active. Native SQLite, signed V1/V2 and retained existing epoch tests [GREEN 41815897999](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41815897999) | **Critical:** D1 and DO/Queue are not one transaction. DO may receive state after successful D1 but before Queue durability; a concurrent revocation after last D1 check but before DO broadcast still needs isolated Cloudflare race proof; Queue failure after D1 writes leaves retryable unacknowledged event, not durable R2 history. No 8D.6/7 PASS |
| **P8D-022**, 8D.4/.14, P3 | [RED 41815605625](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41815605625) absent lat/lon accepted because `Number(null)===0` | `onemap-client.ts` explicitly rejects absent/blank query parameters; ten invalid input cases plus legitimate (0,0) outside-SG case [GREEN 41815897999](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41815897999); no provider calls for those cases | Input-parser subfinding source/CI closed; live OneMap auth/rate/circuit-breaker remains 8D.14 open |
| **P8D-023**, 8D.18, provisional P2 | Source-confirmed `SELECT ... ORDER BY id LIMIT 100` with no cursor always excluded higher-sorted active devices. Initial CI gate [41815445041](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41815445041) failed for missing rotating scheduler module; this failure alone is **not** a runtime proof | New `commute-scheduler.ts` persists an operational cursor in existing `provider_cache`, bounds each cron pass to 20 and wraps after last ID; `worker-p8b.scheduled` now schedules those candidates. Full exact-migration native SQLite test reached all 104 eligible synthetic devices over 7 ticks, excluded revoked devices [GREEN 41815897999](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41815897999) | Actual Cloudflare cron frequency, concurrent cron cursor, queue/runtime limits and large-family freshness require live qualification |

**Disposition:** all six findings **SOURCE/CI FIXED–RETESTED** within the listed regression scope (P8D-022 parser subfinding source-closed). Do **NOT** mark Phase 8D.3–8D.7, 8D.14, or 8D.18 complete based on these tests. No Phase 8D PASS; existing unresolved P1s P8D-002 (full D1+R2+DO restore), P8D-011 (live WS), P8D-014 (actual R2 lifecycle), P8D-021 (cross-store race), and Cloudflare deployment evidence remain open. Phase 8E/8F untouched. No production or credential changes.

---

## 2026-11-04 continuing Phase 8D — source findings to reproduce before fixes (P8D-024–029)

**Scope:** Sections 8D.4/.6/.7/.9/.14/.18 of the approved 76-page Phase 8 plan, after verified baseline `1010f748f78f77ac82d176606d35d22b47b3e141` (CI 41816426959 GREEN). These are initial source observations and require executable RED tests; no Cloudflare production/Android change.

- **P8D-024 (P1 provisional, 8D.6/.7):** `ingestLocationV6` calls `persistAccepted`, which writes the parent-visible DO live fix **before** `EVENTS.send` successfully commits to Queue. On Queue error the child gets 503 and history is not durable in R2, while parent may already see the fix. Separate D1/Queue/R2/DO persistence cannot be made atomic; test exact boundary and ensure DO publish is gated by successful Queue submission while retaining signed retry behavior and D1 dedupe. No 100% durability claim.
- **P8D-025 (P1 provisional, 8D.18/.9):** `alertPersistentIncidents` reads alerts without LIMIT and creates a fresh UUID safety row, then updates `alerted_at` regardless of whether a competing process already claimed the incident. Two concurrent sweeps can create duplicate alerts; high-volume outages can overflow cron/SQL budgets. Require unique deterministic incident alert id, insert-idempotency, bounded paging, and concurrent SELECT negative regression.
- **P8D-026 (P2 provisional, 8D.18):** `reliability` computes expected sequence deliveries as `MAX(seq)-MIN(seq)+1`; an extremely large signed sequence jump (explicitly accepted by 8D.5) creates a near-zero delivery ratio without evidence that those packets were ever sent. Test no fabricated precision/denominator overflow; mark unknown where sequence ranges cannot support a meaningful delivery estimate, while keeping raw evidence.
- **P8D-027 (P2 provisional, 8D.14/.18):** Parent `GET /commutes` schedules a full R2 history scan/derivation on **every request**, without any cadence gate; repeated valid requests consume unbounded backend work. Test bounded per-device refresh claim and meaningful retry interval while preserving cron eventual refresh, including two concurrent requests.
- **P8D-028 (P2 provisional, 8D.4):** Commute `limit` is coerced with `Number` and passed via `Math.trunc` to D1. NaN/Infinity/invalid strings can become `NaN` SQL bind and a false 500; the HTTP interface should reject malformed inputs with 400 before D1, and safely cap large numbers.
- **P8D-029 (P2 provisional, 8D.14):** OneMap reverse and parent commute endpoints lack **dedicated fail-closed edge request quotas**, while existing history and WebSocket budgets are separate. Provider's own D1 quota does not bound authenticated cache/SQL requests or history lookups. Add distinct quota scopes and test 429, missing limiter, auth-before-cost and production/development namespace separation. Cloudflare Worker rate limits are **approximate per-colo**, not globally strict; live efficacy remains unknown.

**Ordering:** record negative reproduction first, implement narrow fix next, run all Phase8D gates at exact SHA, and update 19-section execution matrix plus handoff with separate runtime UNKNOWN status.


### P8D-024–029 six negative regressions and exact source/CI dispositions — 2026-11-04

**Frozen verified execution evidence:** `07dcf73c9d8a3859a7b3ba43a88aa793149d9f4d`, [strict Phase 8D CI 41818648409](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41818648409), **all three jobs SUCCESS**. Six tests are **strict blocking steps**; temporary `continue-on-error` used only to collect pre-fix negative evidence in [41817926970](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41817926970) and removed before final CI. This is not a live Cloudflare deployment or Phase 8D PASS.

1. **P8D-024 (8D.6/.7), P1 source defect FIXED → SOURCE/SQLITE RETESTED.** Negative [41817926970](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41817926970) reproduced parent DO getting a location despite failed Queue submission. Real signed V1 + native SQLite test now verifies failure 503, no DO publish until Queue accepted, retried identical packet queued exactly once and live state recovered despite existing D1 idempotency row. Public single/batch routes defer DO publish and recheck revoked device after Queue acceptance; direct `persistAccepted` seam preserves historical test behavior. **Still OPEN P1 as cross-store failure class:** D1→Queue crash may leave an unqueued D1 index, DO/Queue/D1 are not atomic, Queue ACK is not equivalent to asynchronously completed R2 history, and post-D1 revocation races need live isolated proof. Do not claim complete 8D.6 acceptance.

2. **P8D-025 (8D.18/.9), provisional P1 SOURCE/SQLITE RETESTED.** Pre-fix [41817926970](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41817926970) showed >100 unbounded incident-sweep outputs. New `alertPersistentIncidents` ordered `LIMIT 100`, deterministic `inc_<incident-id>` safety event ID, `INSERT OR IGNORE`, and conditional `alerted_at` ensure two concurrent readers with serialized native SQLite batch writers emit exactly one alert; [GREEN 41818648409](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41818648409). **Still OPEN for real D1 concurrent cron, alert delivery over DO/WS, overflow behavior and provider notifications.** Test harness was corrected to serialize transactions after both unalerted SELECTs raced; no production logic was relaxed.

3. **P8D-026 (8D.18), P2 SOURCE/SQLITE RETESTED.** [NEGATIVE 41817926970](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41817926970): an epoch with just sequences 1 and 4,000,000,000 generated a false near-zero packet delivery rate. Reporting now returns `packetDeliveryPct: null`, `packetEvidence.expectedPackets: null` with `sequenceDiscontinuity: true` if inferable range exceeds a conservative 3/s span (with 1m floor); normal genuine 3-of-4 evidence remains 75% [GREEN 41818648409](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41818648409). This is an *evidence-quality guard*, not proof of actual packet delivery or field battery/latency performance.

4. **P8D-027 (8D.14/.18), P2 SOURCE/SQLITE RETESTED.** Source previously started an R2 history/commute derivation on every authenticated `GET /commutes`. New `claimCommuteRefresh` uses atomic active-device D1 upsert, maximum one on-demand refresh per device per 10 minutes, concurrent requests only one winner, excludes revoked devices. Real SQLite [GREEN 41818648409](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41818648409). Independent rotating cron remains; parent still gets cached results. **Actual concurrency across Cloudflare colos and UI freshness not demonstrated.** Initial [41817926970](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41817926970) encountered missing helper source, not evidence of live exploit.

5. **P8D-028 (8D.4), P2 SOURCE/SQLITE RETESTED.** Before fix, invalid `NaN`/infinite/fractional/negative commute and screen-time limits reached invalid D1 bind or were silently coerced. Both parent read functions now return 400 for invalid integer values and cap valid high integer requests at 100/90 respectively. Native SQLite [GREEN 41818648409](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41818648409); previous [41817926970](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41817926970) showed invalid query thrown from test. Full public API input-fuzz 8D.4 remains open.

6. **P8D-029 (8D.14), P2 SOURCE/CI RETESTED.** Separate fail-closed authenticated Cloudflare rate-limit bindings `PARENT_GEOCODE_RATE` 120/min and `PARENT_COMMUTE_RATE` 30/min, separate namespaces in both prod/dev templates. Missing bindings 503, over budget 429, unauthenticated requests denied before limiter; full layered Worker test [GREEN 41818648409](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41818648409). **Cloudflare binding counters are approximate per-colo, and per-IP keys may affect legitimate shared NAT clients. Live quota/fairness verification OPEN.** Prior [41817926970](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41817926970) captured missing guards before production changes.

**No phase advancement:** The approved 76-page Phase 8 plan requires actual deployment identity and complete API/Queue/D1/DO fault, expiry, restore, secrets, retention and rollback proofs. `8D = IN PROGRESS / NOT PASS`; `8E,8F = NOT STARTED`; Phase9 OPPO field trials later. No production secrets, routes, Cloudflare bindings or family data were touched, no Android source changes.


---

## 2026-11-04 P8D-030–037 continuation: command/result truth, Queue poison, actual snapshot path, API auth and secret assets

**Exact CI-verified executable SHA:** `1fd03dd970021532c00f14e0a9a06dcafad8f857`. [Three-job Phase 8D CI 41822669148](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41822669148) is **SUCCESS**, including all prior audit tests. No Android code, APK, Cloudflare production deployment, credential, or family data changed. Findings below have synthetic signed-route / native SQLite / bundled Worker evidence, **not live Cloudflare proof**.

1. **P8D-030 / 8D.13, P2 (SOURCE/CI FIXED): Location-control terminal result replay.** [RED 41821975972](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41821975972) demonstrated a later health result could replace `completed` with `failed`. `noteLocationControlHealth` now updates only matching `pending` command within its logical 10-minute window, with wrong ID and late expired confirmations refused. SQLite command finality test **GREEN 41822669148**. Device-side nonce validation / physical phone results remain 8D.13 OPEN.
2. **P8D-031 / 8D.13, P2 (SOURCE/CI FIXED): Live-track terminal state replay.** Same RED run reproduced terminal completed→failed overwrite. `noteP8BHealth` explicit live-track confirmation now requires current `pending` command, nonexpired TTL, exact ID and active D1 device in the same UPDATE. SQL tests for wrong ID, already completed and expired commands **GREEN 41822669148**. Real child application and delivery need live proof.
3. **P8D-032 / 8D.13, P2 (SOURCE/CI FIXED): Wi-Fi schedule stale or unrelated result.** RED showed older signed `attemptedAtMs` overwriting newer status. `noteP8BHealth` now conditionally accepts result only if current configured schedule ID and target match, device remains active and incoming attempt is strictly newer. Tests also block removed schedule and revoked device, **GREEN 41822669148**. Device-side execution still unverified.
4. **P8D-033 / 8D.3/.13, P2 (SOURCE/CI FIXED): Capability profile rollback.** RED showed older version overwriting newer. `storeCapabilityProfile` now atomically conditions on active device, increasing profile version or strictly newer capture within same version. Actual native SQLite version/time/revocation tests **GREEN 41822669148**. True phone capability accuracy and signed request route remain separately scoped.
5. **P8D-034 / 8D.9, P2 (SOURCE/CI FIXED): Malformed Queue history payload crashes handler / poisons batch.** Original Queue consumer dereferenced `null` body and accepted incomplete coordinate packets for R2 encoding; CI [RED 41822194342](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41822194342). Queue ingress now validates type, device ID and required history delta fields, explicitly ACKs nonreplayable bad payloads without writing R2; **legacy stored R2 parsing remains deliberately permissive** to avoid silently losing earlier historical records. Null, undefined, scalar, truncated, out-of-range, unknown tested **GREEN 41822669148**. Real Cloudflare DLQ retry exhaustion not tested.
6. **P8D-035 / P8D-002 / 8D.16 (ISOLATED D1+R2 DRILL VERIFIED; P1 LIVE RESTORE OPEN):** New `test-phase8d-d1-r2-roundtrip.mjs` calls the **actual `snapshotD1ToR2`**, captures its compressed SHA-256-tagged 18-table snapshot into a synthetic R2 adapter, copies actual generated raw and trusted history objects byte-for-byte to an isolated bucket, restores into fresh fully migrated **native SQLite** via actual `restoreBackupToFreshD1`, validates FK/retained safety rows/revoked state and pending command expiry. Crucially tests a **D1-only restore is INCOMPLETE without two R2 objects**. **GREEN 41822669148**. This is a closer end-to-end source drill than previous hand-crafted backup fixtures, but **not real Cloudflare R2/D1/DO disaster recovery**; DO sessions/current state, full family configuration and real recovery cutover remain unverified.
7. **P8D-036 / 8D.2/.3/.11 (SOURCE AUTH MATRIX VERIFIED; DEPLOYED AUTH OPEN):** Parses the 49-row production endpoint inventory and calls the actual bundled layered production Worker for **41 supported parent method/path combinations** with no Cloudflare Access credentials. All refused without D1, DO, R2, Queue, backend scheduling or expensive rate-limit side effects. **GREEN 41822669148**. Live auth/key/ownership/multi-family testing cannot be inferred; exact deployed route and method inventory is STILL OPEN.
8. **P8D-037 / 8D.15 (CURRENT PUBLIC ASSET SCAN VERIFIED; HISTORICAL SECRET AUDIT OPEN):** Parses rendered production and development parent HTML plus public JavaScript/HTML/CSS/JSON/source maps. Positive synthetic private-key and server-token controls are detected and no inspected current public asset contained a high-confidence secret marker, **GREEN 41822669148**. This does NOT audit Git history, real CDN objects, deployed logs or actual secret contents. Scan logs never print matches.

**Live-evidence limitations (mandatory per PDF pp.44–54):** No verified active deployed Worker SHA, Cloudflare tenant routing/bindings/secrets-present metadata, live parent Access ownership, actual Cloudflare D1 migration/restore, two-object R2 recovery, DO restoration/hibernation, Queue/DLQ replay exhaustion or production rollback. GitHub API attempts to inspect deployment and environment endpoints were blocked by connector endpoint restrictions, and branch protection read returned **403 not accessible to integration**. No direct Cloudflare account tool is connected. Therefore **Phase 8D remains IN PROGRESS/NOT PASS** with P8D-002/011/014 and cross-store guarantees OPEN; Phase 8E/8F still not authorized.

---

## P8D-038–042 — corrected live Cloudflare drift and safe remediation (2026-11-04)

**P8D-038 (8D.1, P1, source FIXED — LIVE provenance BLOCKED):** Previous audit falsely marked dev source provenance ATTESTED by reading annotations from a deployment object, which do not guarantee the active Worker version source. Auditor now GETs the actual active script version and requires source Git annotation from that version; ambiguous/unknown versions and split traffic remain BLOCKED. Real [41834309379](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41834309379) found BOTH prod/dev untagged or unreadable active-version source SHA. Source CI GREEN [41835676509](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41835676509).

**P8D-039 (8D.9, P1, source FIXED — LIVE Queue missing):** Previous GET of page one could falsely report Queue absent. Now bounded 20-page, 100/page GET-only inventory with a 102-item synthetic page-two test and no unrelated Queue names logged. Real account still did not list expected `brick-family-v1-events`/`brick-family-v1-dlq` in paginated results. This is a live infrastructure blocker, not cured by code. Green source gate 41835676509; real Queue/DLQ existence and 8D.6 ACK durability still OPEN.

**P8D-040 (8D.1/.9/.14, P2, source FIXED — LIVE binding drift OPEN):** New static contract verifies production/dev Wrangler worker entries, D1 isolation, R2/Queues, DO, all six production rate bindings, all development quotas, unique/distinct namespace IDs, producer/consumers/DLQ and Access placeholders; CI GREEN 41835676509. Real Cloudflare production missing seven bound names (HISTORY, MAPS, EVENTS, PARENT_HISTORY_RATE, PARENT_WS_RATE, PARENT_GEOCODE_RATE, PARENT_COMMUTE_RATE); dev missing two rate names. No deploy performed.

**P8D-041 (8D.1/.9/.11/.17, P2, source FIXED — LIVE permissions OPEN):** Seven-target deterministic remediation plan refuses malformed/partial/duplicate evidence, marks all targets BLOCKED/DRIFT/ATTESTED independently, and always disables Cloudflare mutations or release authorization; uploaded with read-only audit artifact. Temporary CI failure 41835145599 was caused by import accidentally invoking the CLI entrypoint; fixed exact module URL. GREEN 41835676509. Dedicated token's R2 lifecycle and Access app permissions remain 401/403 and require token owner.

**P8D-042 (8D.11/.14/.19, P1 release operations source FIXED — DEV deployment NOT RUN):** Existing `deploy-brick-development.yml` still mandated obsolete Phase 6C branch and obsolete PIN verification, incompatible with current 8D high-entropy parent auth. Updated manual-only workflow targets current audited dev branch, uses secure `BRICK_DEV_PARENT_ACCESS_TOKEN`, current `setup:development`, dev-only DB, no prod Queue/R2, new rate binding checks, parent session boundary smoke and pinned actions. Source CI GREEN 41835676509. This does **NOT** prove deployment fixed; must run explicitly with valid secrets, test data and appropriate authorization. Production workflow accepted-branch and Phase8D FINAL STATUS: PASS barriers unchanged.

**Overall:** 3 confirmed live config drifts, 4 blocked live attestation areas, all unresolved as of real GET result [41835091894](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41835091894); **NO production/Cloudflare mutation, no user data, no Android edits. Phase8D NOT PASS.** Detailed repair sequence: `PHASE8D_LIVE_DRIFT_REMEDIATION_2026-11-04.md`.

---

## P8D-043–049 — live active-version/integration evidence (2026-11-04)

**Executable SHA `d74b30d97e97a01ce55171f1931c685d51f4d180` source CI [41839919380](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41839919380) 3/3 PASS. LIVE Cloudflare [41839919454](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41839919454) NOT PASS.** Refer to `PHASE8D_LIVE_SECURITY_ACCEPTANCE_2026-11-04.md` for source-vs-live isolation.

- **P8D-043, P1, 8D.1/14 LIVE DRIFT:** Active Worker version and script settings both lack 7 production binding names (HISTORY, MAPS, EVENTS, PARENT_HISTORY_RATE, PARENT_WS_RATE, PARENT_GEOCODE_RATE, PARENT_COMMUTE_RATE), and 2 development quotas (PARENT_GEOCODE_RATE, PARENT_COMMUTE_RATE). Previous script-settings-only audit was insufficient. Active deployed version read now confirms both. Git SHA remains UNKNOWN due untagged/unreadable version annotation.
- **P8D-044/046/049, P1, 8D.2/10/11 LIVE FAIL:** Actual 12 anonymous GET parent probes: 9 ATTESTED (protected API denied incl forged auth header, dev login expected), 2 production /parent same-origin local-login redirects BLOCKED, 1 prod /parent/login publicly HTTP 200 FAIL. This is a **Cloudflare Access-first production policy mismatch**, not proof of exposed family data. No response bodies, user history, or cookies collected. Must remediate and retest live before final PASS.
- **P8D-045, P2, 8D.1/8 LIVE BLOCKED:** Actual Cloudflare D1 database catalog GET failed HTTP 401; requires scoped audit token D1 Read. No SQL or records accessed, prod/dev named UUID isolation still NOT VERIFIED.
- **P8D-047, P1, 8D.11/19 SOURCE FIXED:** Production release verifier formerly accepted any 303 as Cloudflare Access proof and would have accepted actual local-login redirect. New strict Access-challenge module rejects same-origin Brick local login, malicious lookalike hosts, HTTP downgrade, or public production login; full regression CI 41839919380 PASS. **Only future deployment gate is repaired; existing deployed protection remains LIVE FAIL.**
- **P8D-048, P1, 8D.11 SOURCE GATED:** Read-only future Access config audit now checks exact app details and one account-member allow policy, rejects bypass, wrong account, weaker cookies, additional policies. CI mock GREEN; Cloudflare Access Read token permission still BLOCKED.

**Release blockers unchanged:** Real Cloudflare Queue/DLQ not found, R2 metadata permission blocked, D1 prod/dev resources unreadable, full D1+R2+DO isolated recovery, live Queue crash/ACK, WS session isolation, retention, release rollback not completed. **8D NOT PASS; no 8E/8F; no Cloudflare deploy or user-data change.**

## P8D-050 — Actual Fast Live route bypasses tested revoke recheck; DO latest writes ignore persisted revoke fence

- Requirements: SEC-005, BE-002/003/004, LIVE-001; sections 8D.3/.7/.10.
- Baseline: ea23177c21d39864a152f9963d68b939d1a754bb. Severity P1 provisional until reproduction.
- Evidence before correction: worker-v9 routes /location/live to fast-live.ts::handleFastLive, not the lower previewLatestLocationV6 exercised by the old revoke test. handleFastLive checks active identity only before asynchronous route work; BrickDevice.commitLatest writes latest without checking wsRevoked. The persisted flag currently gates sockets/broadcasts only, permitting archived current state mutation.
- Reproduction: new test calls actual bundled worker-p8b with real P-256 signature and native SQLite; inject revocation after auth SELECT, then exercise persisted DO fence and class reconstruction. Include active success and DO outage response. Run before source changes.
- Status: RECORDED BEFORE FIX; not live Cloudflare proof.

## P8D-051 — Development qualification entry/schema omit current production overlay

- Requirements: OPS-011/012, BE-002, COV-006; sections 8D.1/.8/.19. Severity P1 provisional release-qualification risk.
- Baseline: ea23177. worker-v10 imports worker-v9, omitting worker-p8b routes; setup:development applies 001–015 subsets but not 016–018, although inherited v9 accesses P8B control tables and columns. Config parity tests only inspect binding names, not actual route/schema parity.
- Reproduce on fresh disposable SQLite and actual bundled dev Worker before fixing. Development continues to use D1 adapters; it cannot qualify production Queue/R2 services.
- Status: RECORDED BEFORE FIX; no development deployment authorized by this finding.

## P8D-002 addendum — Complete recovery inventory beyond eighteen tables

- Requirements: OPS-002/003, BE-009/010, WIT-002/011; section 8D.16. Existing P1 remains open.
- Baseline backup omits durable witness_authorizations, ground_receivers and other model/evidence indexes created by 008–010. Eighteen-table coverage is not whole-schema coverage. Reproduce nonempty source snapshot/restore loss before correction; version any expanded format and retain historical v1/v2 compatibility with explicit incomplete-coverage reporting. Classify every source table, rather than restoring ephemeral credentials/counters blindly.


## Current continuation — P8D-050/051 and P8D-002 expanded coverage

Continued ea23177 on the same audit branch. P8D-050 five actual-route/DO tests reproduced four negative failures before fix and pass locally after fix. P8D-051 fresh development route/schema failures reproduced and corrected; interruption/retry, unknown migration drift rejection and prior-session revocation pass on native SQLite. P8D-002 actual missing witness/receiver backup reproduced; v3 now snapshots/restores 38 durable tables, classifies all 48 declared tables, expires generic pending commands and marks legacy snapshots incomplete. Full live recovery P1 remains OPEN.

Native local workerd integration passes real D1/Queue/R2/DO route, Access JWT, idle WS alarm, persisted revoke after eviction and v3 fresh D1 restore. This is not live Cloudflare acceptance. Old 18-table mutating live drill now refuses current inventory before network/resource creation, covered by negative test. Details and limits: `PHASE8D_CONTINUATION_2026-11-04.md`. Hosted exact-SHA CI evidence pending commit. Fresh old-source live run 41839919454 attempt2 still has same binding/Queue/Access failures and missing audit token scopes. No deployment, Android change or family-data access. **8D NOT PASS.**


## Hosted source CI verified — 00e0174a3181a52550840a178bf29b4d5d1e087c

[Source audit run 41854951853](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41854951853) **SUCCESS, 3/3 jobs**: deployment contract 126660945591 (7/7 steps), backup inventory 126660944772 (7/7), source build 126660945431 (64/64). Actual job log read after completion: all new routed-revoke, dev migration/route, v3 coverage/legacy-drill refusal, native workerd groups and prior regressions pass. SQLite CLI epoch/PIN race/schema checks and isolated source-destruction/38-table restore also pass in Ubuntu CI; earlier local CLI unavailability is resolved by this hosted evidence, not relabeled as a local pass. Evidence extract: `PHASE8D_SOURCE_CI_41854951853.txt`; lines are log summaries, not an asserted independent-test count.

P8D-050/051 corrections are SOURCE/CI VERIFIED at this SHA; P8D-002 expanded D1 recovery is SOURCE/CI VERIFIED but full cloud D1+R2+DO recovery P1 remains OPEN. Cross-store atomic revoke, deployed dev parity and live configuration/security remain unproven. Follow-up changes after this executable SHA are documentation/evidence only. Frozen Android unchanged; no deployment, Cloudflare mutation or family data access. **Phase 8D NOT PASS; 8E/8F not started.**

## P8D-052 — Recovery validates late rows after prior commits; ignores occupied transient target

Recorded before correction, baseline ec9d61d. Sections 8D.16/.12, OPS-002/003, P2 proposed pending reproduction. restoreBackupToFreshD1 validates each row while inserting tables in separate committed batches. A malformed last-table row may fail after earlier tables commit. Freshness check inspects durable tables only: stale one-time pairing credentials/cache/rate state can remain in a supposedly fresh target. Reproduce with actual native SQLite, assert zero INSERTs and preserve occupied target on rejection. Does not imply whole multi-batch restore can become atomic across Cloudflare failures.

## P8D-053 — Backup restore decompression and generated JSON lack byte limits

Recorded before correction at ec9d61d; 8D.16/.18, OPS-002/003, P2 proposed. Table row cap does not bound row byte size; validateBackupBody materializes gzip output without decoded-byte cap, and scheduled snapshot can publish an object too large for safe recovery. Test compressed input, valid high-ratio gzip, exact boundary and producer refusal without R2 put/prune. Proposed explicit supported envelope: compressed <=8MiB, decoded UTF-8 JSON <=16MiB (engineering bounds, not claimed Cloudflare service limits). Data above envelope must fail visibly and preserve prior backups; scale/streaming snapshot design remains open.


## Current continuation — private repository, P8D-052/053 and native hibernation

Continued ec9d61d, same audit branch. Private GitHub access verified; audit and main branch metadata protected=false; repository rulesets empty; detailed protection read403. No repository settings changed. P8D-052 six baseline failures reproduced on native SQLite: late malformed-row partial commits and four occupied transient tables accepted. Preflight now validates all rows before writes and rejects nonempty transient state; seven checks pass including second-batch outage/partial-target retry refusal. P8D-053 three negative size tests reproduced missing byte envelope; 8MiB compressed/16MiB decoded UTF-8 guards and producer refusal now pass all four checks. Existing all-38-table recovery/legacy/atomic tests pass locally. Native actual Workers socket survives hibernation/reconstruction and idle-expiry alarm. Hosted exact-SHA CI pending.

Fresh read-only live attempt3 of41839919454 still has the same production/dev binding, Queue, Access, provenance and token-scope blockers. Actual logs read; no family bodies, Cloudflare mutations, deployment or Android changes. Full report: `PHASE8D_RECOVERY_HARDENING_2026-11-04.md`. **Phase8D NOT PASS.**


## Hosted source verification — f93e3c858da1b270aa1cd4619995c1736c3a32e5

[Source CI 41856987680](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41856987680) **3/3 jobs SUCCESS**. Source job 126668176641: 64/64 steps; deployment job 126668176592: 7/7; backup job 126668175549: 7/7. Job log was fetched and inspected after completion, with no error/FAIL lines. Seven P8D-052 checks, four P8D-053 checks and native socket hibernation/reconstruction/expiry all pass, along with prior route/auth/Queue/recovery regressions and actual SQLite CLI source-destruction/38-table restore. Evidence: `PHASE8D_SOURCE_CI_41856987680.txt` (PASS summaries, not an asserted 95 independent tests).

P8D-052 and P8D-053 are **SOURCE/CI VERIFIED** at this SHA, to the exact limits above. Whole-restore SQL/service atomicity, high-volume D1 allocation/memory behavior and live cloud recovery remain OPEN. GitHub repository private and authenticated source/log/write access verified. main/audit branch metadata unprotected; no settings modified. Live read-only run 41839919454 attempt 3 remains failure with unchanged drift/scope/Access findings. No Android edits, deployment, Cloudflare writes or family data access. Follow-up commit is documentation/evidence only. **8D NOT PASS; no Phase 8E/8F.**

Next: obtain scoped read metadata for Cloudflare, prepare authorized infrastructure/Access repair and isolated current full-stack recovery/rollback. Preserve branch ec9d61d→f93e3c8 lineage; do not restart or infer final PASS from source CI.

## P8D-054–056 — DO telemetry archival fence, concurrent markers and health ordering

Recorded before correction, baseline3a29458. 8D.3/.5/.7/.10, BE-002/003/004 and SEC-005. Proposed P2 pending reproduction. Existing latest-location fence does not cover setHealth/setNetworkEvidence/pushSafetyEvent or three marker writers. Marker read-then-put methods are not transactional; concurrent higher/lower calls may regress accepted high-water. setHealth ignores signed healthSequence ordering even though D1 replay reservation is monotonic, so delayed accepted calls may overwrite newer DO health. Reproduce on actual production-exported class with deterministic concurrent transaction fixture; preserve legacy health compatibility before first sequence-aware record. No claim of externally callable RPC, live exploitation or atomic D1+DO fix.


## Continuation — P8D-054/055/056, local history scope

Continued 3a29458 on existing private audit branch. Seven negative DO tests reproduced failures before source edits, one active/legacy control passed. After fixes all 8 focused tests pass: six archived telemetry/marker keys respect persisted revocation, three markers use transactional monotonic updates, health follows signed sequence and rejects delayed/duplicate/legacy downgrade. Native workerd actual RPC and hibernation/revocation checks pass locally. Source CI pending exact new commit.

Read-only Git history scan:2234 reachable local commits,2382 unique blobs,19,215,060 bytes;10 blobs contain only known P8D-003 weak-verifier marker among checked categories. No matching values printed; findings-review status, not blanket absence/rotation proof. Evidence refs/paths/scopes in `PHASE8D_LOCAL_GIT_HISTORY_3a29458.json`; detailed report `PHASE8D_DO_ORDERING_HISTORY_2026-11-04.md`. Cross-store races, exclusive safety evaluation, real Cloudflare recovery/security and all existing live blockers remain OPEN. No deployment, Android/family data or settings changes. **8D NOT PASS.**


## Hosted source proof — 0a7e6eb6cbb35eae3d36d0621d8a7d3caa48f287

[CI 41859178762](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41859178762) **3/3 jobs SUCCESS**. Source job 126675937098: 65/65 steps; backup126675937168:7/7; deployment126675937752:7/7. Actual completed source log fetched: no error/FAIL lines; eight new DO tests, native RPC ordering/revoked archive checks, WS hibernation/expiry, scanner controls and all prior regressions including SQLite source-destruction/38-table restore PASS. Extract: `PHASE8D_SOURCE_CI_41859178762.txt` (106 PASS summary lines, not 106 independent tests).

P8D-054/055/056 **SOURCE/CI VERIFIED** to the exact scopes in `PHASE8D_DO_ORDERING_HISTORY_2026-11-04.md`. Latest local full reachable-history scan at executable HEAD0a7e6eb:2235 commits/2394 unique blobs/19,483,355 bytes;11 known weak-verifier-marker matches only among checked categories, including scanner's own legacy reference. `PHASE8D_LOCAL_GIT_HISTORY_0a7e6eb.json` is sanitized evidence, not rotation or all-secret absence proof.

Cross-store revocation and crash/ACK, exclusive safety evaluation, exact live source/config/Access, full Cloudflare D1+R2+DO disaster recovery, retention/rollback, repository protection and remaining endpoint coverage stay OPEN. Live attempt3 of41839919454 is still the latest inspected live evidence; no claim that this code is deployed. No Android edits, deployment, Cloudflare writes, user family data or repository settings changed. Follow-up commit contains documentation/evidence only. **Phase8D NOT PASS; no Phase 8E/8F.**

## P8D-057/058/059 — Actual signed safety-route revoke, collision and coordinate cases

Recorded before correction at807025e. 8D.3/.4/.5/.6/.7, proposed P2 until reproduction. Fall handler authorizes before Queue await but unconditionally inserts afterward; ordinary event handler also inserts after asynchronous auth. Both infer duplicate success from ignored global-primary-key insertion without verifying same-device row, so a collision can falsely ACK another device's event. Fall coordinate schema silently converts invalid/asymmetric values to nullable data and does not reject invalid accuracy before Queue work. Test actual outer production Worker with real P256 signatures/native SQLite, revoke at Queue/final auth boundary, cross-device collision, malformed signed coordinates and valid0,0 retry control.

## P8D-060 — Safety batch event side effects are detached from conditional state ownership

Recorded before correction at807025e, proposed P2, 8D.5/.6/.7/.9. Batch evaluator loads a state snapshot then conditionally advances geofence/trip state, but event inserts are unconditional; return/publication includes ignored duplicate inserts. A stale evaluator can lose its state write yet persist/report a transition, and two accepted evaluations can publish the same durable event twice. Reproduce actual evaluator with native SQLite, later/newer-state or revocation injected before its batch, and two identical concurrent snapshots; preserve an ordinary successful transition as control. Scope is current batch evaluator used by location ingestion, not dormant legacy evaluator or all cross-store exclusivity.


## Continuation — P8D-057/058/059/060 safety acceptance

Continued807025e. Actual signed Worker/native SQLite RED reproduced11 negative route failures (one positive control passed), and actual safety evaluator RED reproduced3 ownership/publication failures (one positive control passed). Source fixes now pass24 focused tests: conditional active-device safety insertion, actual duplicate ownership/kind, fall coordinate validation, atomic guarded event/state transaction and newly-inserted-only publication, bounded re-read/retry on lost newer snapshot. Prior Phase7 safety-quality fixture passes. Native Workers safety route coverage extended; full hosted exact-SHA CI pending.

Scope/remaining replay and cross-store gaps explicit in `PHASE8D_SAFETY_ACCEPTANCE_2026-11-04.md`; no global eventSequence ledger or live acceptance inferred. No schema/Android/deploy/settings/Cloudflare writes or family-data access. Existing live blockers unchanged. **8D NOT PASS.**


## Exact source commit and queued hosted verification

Executable `9b2601d9742c02bf55e45f5a2ddaf40e2661a916` pushed on the same audit branch. [Hosted CI41862396858](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41862396858) currently **QUEUED**, all 3 jobs unstarted on repeated API checks. No runner-failure/billing/permission cause established; no hosted PASS inferred. Prior green executable remains0a7e6eb for CI claims.

Current source local evidence:24 focused signed-route/evaluator checks PASS, Phase7 safety-quality fixture PASS, typecheck PASS, native actual Workers D1/Queue/R2/DO/Access/WS/recovery plus signed fall route PASS. Broader source-build command run:55 groups attempted,54 exited0 within explicit command omissions,1 stopped at missing sqlite3 executable in test-phase8d-controls-sqlite.mjs. Other CLI-dependent commands/schema replay were omitted; this is not a full local CI pass. Exact grouping/omissions: `PHASE8D_LOCAL_REGRESSION_9b2601d.json`.

P8D-057/058/059/060 status: **SOURCE FIXED, LOCAL RETEST VERIFIED, HOSTED CI PENDING**. Next continuation must inspect this exact hosted run and job logs, resolve any real regression, then record source closure. Do not restart or call the queued run green. Existing live Cloudflare findings, distinct-ID sequence replay ledger, full cloud recovery/rollback and remaining audit gates stay OPEN. No deployment, schema migration, Android/family data or settings changes. **Phase8D NOT PASS.**

## P8D-061/062 — Immutable event content and priority-safe fall retry semantics

Recorded before correction, baseline28d8a73/9b2601d, 8D.3/.5/.6/.9/.13, proposed P2 pending reproduction. Same owner/kind UUID duplicate currently ACKs changed event timestamp/coordinates/detail not actually persisted. Fall DO high-water rejects unseen older UUIDs although frozen SafetyOutbox drains ORDER BY priority DESC,id ASC and SafetyDispatcher uses priority SOS200/HIGH-fall100; strict global arrival monotonicity is not a supported client guarantee. Safety counter allocation also lacks visible synchronization, so uniqueness cannot be assumed from source. Preserve signature, positive counter/timestamp window, immutable UUID content and atomic D1 uniqueness; do not impose a new unique-sequence protocol/schema on frozen Android. Verify changed-content conflicts, semantic object-key retry equivalence, delayed valid falls and stale-window denial using actual signed Worker/native SQLite/production DO class. No Android edits.

## P8D-063 — Production acceptance gate accepts quoted/qualified PASS without tested-source provenance

Recorded before correction, baseline28d8a73; 8D.19, provisional P1 future release-control weakness (no live exploit/deploy). Current grep -F accepts pending-review suffix, quoted example alongside NOT PASS, and code-fenced marker. It does not validate acceptance section coverage, requirement gaps, unresolved P0/P1, evidence hashes or a successful exact tested-source CI run. Reproduced three invalid records accepted with exit0. Strengthen the existing separate accepted-branch/manual-only barriers with a structured fail-closed attestation verifier; do not create a real final-PASS record or deploy.

## P8D-064 — Minimum safety retention can delete UUID before signed replay window expires

Recorded before correction at28d8a73, 8D.5/.17, proposed P2. Safety validation allows five-minute future clock skew and30-day captured-time replay window. Cleanup deletes only by server_created_at under minimum30-day policy; a clock-ahead event can lose its UUID row while captured timestamp is still valid, permitting a signed retry to be recreated as new. Test real cleanup/native SQLite, inclusive time boundary, per-device retention and actual signed Worker retry. Preserve UUID until both configured server-time retention and captured-time replay window have expired, without changing device policy or adding a new ledger/schema.


##5November2026 Singapore continuation — P8D-061/062/063/064

Continued28d8a73. Prior queued9b2601d source run41862396858 reports overall SUCCESS; fetched source log66/66 steps green incl prior24 safety cases and SQLite restore; backup job-list metadata lag is documented. Current new fixes local verified: immutable persisted incident content on duplicate UUID; priority-safe older fall delivery; structured source/CI/evidence-bound production gate replacing substring PASS; retention keeps UUID through captured-time replay window.14 signed retry cases,38 release gate cases, retention boundaries, native workerd and55 locally executed command groups (explicit omissions) pass. No final acceptance file or production deployment created. Exact new hosted CI pending.

Details/limits: `PHASE8D_RETRY_RELEASE_RETENTION_2026-11-05.md`; release contract documented separately. Frozen Android source reviewed for priority/counter constraints without edits. No new schema, unique-sequence ledger, APK, Cloudflare write, repository policy or family-data change. Existing live Cloudflare/security/recovery/rollback gates stay OPEN. **Phase8D NOT PASS.**

## P8D-065 — Release private-key grep rejects its own synthetic marker tests

Recorded before correction at761655c5, 8D.15/.19, proposed P2 release operability defect. Exact production grep -l finds scripts/phase8d-secret-history-audit.mjs and scripts/test-phase8d-public-secret-exposure.mjs, which deliberately contain marker-only positive controls rather than a committed private-key block. Keep forbidden key-container filename policy, but use an in-memory material-aware content scan that also checks escaped newlines/indented key bodies. Test marker-only/public-key negatives and material-bearing/escaped/encrypted positives; never print key values or treat this focused check as a complete secret audit.


## P8D-065 local retest and expanded history detector

Production release key grep matched marker-only synthetic source controls, reproduced by filenames only (no values). Replacement keeps key-container filename refusal and detects actual private-key material, escaped-newline/indented/encrypted blocks; marker-only/public-key controls no longer false-block. Seven focused cases and current tracked-source scan pass locally. Shared history detector now covers those encoded newline/indent cases too. Expanded local reachable-history scan at HEAD761655c5:2239 commits/2442 unique blobs/20,607,934 bytes;11 matching blobs, all known weak-verifier marker category among checked formats. Evidence `PHASE8D_GIT_HISTORY_ESCAPED_KEY_SCAN_2026-11-05.json`. This is not absence of arbitrary encoded credentials or rotation proof. No final acceptance record created, no deploy. Hosted exact-SHA verification pending for this follow-up.


## Fresh live read-only attempt4 — still NOT PASS

[41839919454 attempt4](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41839919454/attempts/4) reran the same old attestor source d74b30d, not a deployment. Logs fetched for metadata126703360991, parent126703361111, D1 catalog126703361268 (04Nov16:24Z =05Nov00:24Singapore): prod active/latest still missing HISTORY/MAPS/EVENTS plus four parent rate bindings; dev missing geocode/commute rates; expected Queue/DLQ absent from paginated account inventory; deployed source annotations unavailable; R2 lifecycle and Access policy read permissions blocked. D1 catalog401 requires D1 Read. Parent12 probes:9 expected,2 prod local-login redirects inconclusive,1 public prod login FAIL. No family response bodies/cookies/user rows, resource/SQL writes or secret values accessed. These live blockers were freshly reconfirmed; source changes did not repair deployment.

Next user/admin unblock remains scoped Workers R2 Storage Read, Access Apps & Policies Read and D1 Read on the dedicated existing audit token/account; no token value in chat and no substitution with broad deployment credentials. Only after read proof can infrastructure/Access repair and isolated recovery/cutover be made concrete. Full Cloudflare recovery, Queue/ACK/DLQ, live retention/rollback and required repository policies remain open. **8D NOT PASS.**

## P8D-066 — Direct fall/screen-time ingestion bypasses base device rate limiter

Recorded before correction atbb0877bc, 8D.2/.14, BE-002, proposed P2. worker-p8b directly handles these endpoints; neither handler consults DEVICE_RATE. Reproduce actual signed production Worker with deny/missing/throw/malformed limiter, auth-before-quota, active distinct-key success and revocation during limiter await. Add authenticated, validated, fail-closed device quotas before state acceptance; separate fall/screen-time keys preserve other critical traffic buckets. This does not establish a pre-auth IP/WAF limit or live colo/global fairness.


## P8D-066 local correction — direct device quota boundary

Confirmed P2. Eleven baseline negative/key-contract failures and two unsigned-auth controls reproduced on actual signed Worker/nativeSQLite. Both direct fall and screen-time routes now consult DEVICE_RATE after bounded signature/schema validation and before state acceptance. Missing binding/throw503; denied/nonboolean-success429; distinct per-device fall/screen-time keys preserve other event/health/location buckets. Thirteen full-route cases pass: eight denied/unavailable/malformed cases, two unsigned-before-quota controls, two revocation-during-limit races and active two-handler key/success case. Prior screen-time/fall/retry fixtures updated with explicit functioning limiter bindings and immutable payload timestamps; no test bypass added to production.

This is authenticated state-ingress quota coverage, not a pre-auth IP/WAF defence, hard global provider budget, or proof of live namespace/colo/NAT fairness. Source config retains120 requests/60seconds per key. No configuration/deployment mutation occurred. Exact new hosted CI pending.

Frozen Android check: no app/ diff from run baseline28d8a73 to current changes. Comparing the whole branch against historical runtime freeze2c492eff finds one pre-existing68-line Android instrumentation test added by28ca478b5fd4259c745c30ff4cce146369da8432 (P8C-008 reproduction). It predates this run and was not edited; do not claim whole app/ tree is byte-identical to2c492eff. Runtime/source APK freeze remains preserved within this run; no APK rebuilt.


## Final source verification for this continuation — cd5e50ca050a8afa8932434c590d923e3ade62a4

[Hosted source CI 41869667667](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41869667667) **3/3 jobs completed SUCCESS**. Source126712978517:66/66 steps; deployment126712978076:7/7; backup126712978558:7/7. Actual completed log fetched: no error/FAIL lines. All P8D-057–066 current checks and prior regressions, native workerd, public asset/key scans, schema replay and actual SQLite source-destruction/38-table restore pass. Evidence `PHASE8D_SOURCE_CI_41869667667.txt`;163 PASS log summaries are not 163 independent tests.

P8D-061/062/063/064/065/066 are **SOURCE/CI VERIFIED**, with producer-order, semantic retry, structural release-proof and limiter scopes exactly as documented above. Earlier queued P8D-057–060 fixes are also covered by this full current run. Latest changes after executable SHA are documentation/evidence only. Real release preflight still refuses: final structured acceptance record absent. No final-PASS artifact was generated.

Fresh [live41839919454 attempt4](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41839919454/attempts/4) completed FAILURE. Its actual metadata/parent/D1 logs were inspected and summarized in `PHASE8D_LIVE_ATTEMPT4_2026-11-05.txt`. Binding/Queue/provenance/Access/read-scope blockers remain; no live repair or deployment claimed. Current GitHub metadata also confirms main and audit branch protected=false; repository rulesets returned[]. No policies changed.

Android scope: app/src/main matches recorded runtime freeze2c492eff; whole app/ includes one pre-existing instrumentation-only test from28ca478, unchanged by this continuation. No app/ edits compared to run baseline28d8a73; no APK build/deployment. No new schema or Cloudflare/family-data mutation.

**Phase8D IN PROGRESS / NOT PASS.** Remaining full live recovery/cutover/rollback, deployed source/config/Access, service fault/ACK/DLQ, ownership/rates/WS, retention/log/rotation, repository policy and 19-section/525-requirement evidence reconciliation cannot be inferred from these source tests. No Phase 8E/8F started. Next continuation must preserve bb0877bc→cd5e50ca plus documentation lineage, obtain scoped Cloudflare reads and qualify an isolated production-equivalent Cloudflare environment before final acceptance.

## P8D-002 continuation — 2026-11-05 local destructive D1/R2/DO recovery

Existing finding extended: baseline lacks DO snapshot/restore RPC (RED native reproduction). Added disabled-by-default internal primitive with bounded explicit eight-key inventory, SHA/device/public-key/namespace checks, empty/alarm/socket target guard, atomic DO insert and preserved D1/DO revocation. Actual synthetic workerd fixture now captures quiesced D1/R2/DO, requires source SQLite files, deletes source persistence, restores into independent stores and verifies counts/FK/R2 bytes+metadata/commands/DO state across worker restart. Invalid digest/key/device/state, occupied/disabled target and D1 revocation override cases are checked. See `PHASE8D_FULL_STORE_RECOVERY_2026-11-05.md` for exact scope and limitations. Live cross-store consistency, orchestration, original R2 retention age, scale, cloud destructive recovery and RTO/RPO remain OPEN; P1 not closed.

Fresh GET-only 41839919454 attempt5 remains FAILURE at old attestor source d74b30d9: seven prod/two dev missing bindings, absent expected Queue/DLQ in audited account, public prod local login, active SHA unavailable, D1 Read 401 and Access/R2 read permission blocks. Sanitized result saved. No cloud mutation, policy change, Android edit or family-data access. Current operational checklist replaced stale 18-table packet and explicitly retains all 19 sections plus pending 525-ID reconciliation. Phase8D NOT PASS.

P8D-002 continuation exact-source CI: **58285064fbf3d6b707dd15d8ef2fd3fb967ae47d**, run41952880677 attempt1 completed SUCCESS; all3 jobs, source67/67 steps. Actual logs inspected. Source/local scope verified; full Cloudflare recovery P1 remains OPEN. Follow-up evidence/checkpoint changes only.

## P8D-067 — Final acceptance trusts 525 aggregate counts without per-ID evidence

- Sections/requirements: 8D.19 and all-19 closeout; GOV-001, GOV-002, GOV-004, GOV-005, GOV-015.
- Severity: P1 source acceptance-control gap; no live deployment or exploit claimed.
- Baseline: 113f38c9f0751b17fdbb300019e76c43f68fad7c (tested executable58285064).
- Expected: release acceptance validates all525 canonical IDs/classifications and reviewed applicability, owners, status and hash-bound appropriate evidence; missing rows or unresolved items cannot be replaced by zero-count claims.
- Source: scripts/verify-phase8d-release-acceptance.mjs accepts requirements.total525/unmapped0/unverifiedApplicable0 without reading any actual requirement ledger. Its positive synthetic fixture has no per-ID ledger yet verifies true. Nineteen section files do not establish525 requirement dispositions.
- RED reproduction: positive existing synthetic release fixture succeeds without a ledger. New adversarial regression must refuse missing/duplicate/unknown/changed baseline IDs, class downgrades, unsupported mandatory/forbidden items, unresolved scope/owners/status, missing/tampered evidence and fabricated aggregate totals before any GitHub request.
- Required correction: hash-pinned canonical525 baseline, tracked hash-bound per-ID ledger, derived gap counts and independent review semantics; create a truthful draft inventory with unresolved review/ownership gaps visible. Candidate finding references are navigation, not acceptance evidence. No invented owners, out-of-scope exclusions, unsupported declarations or final PASS.
- Status: OPEN — source confirmed, correction/retest pending. Existing live/account/security/recovery/rollback P1s remain open.

P8D-067 local correction/retest: gate now reads the pinned canonical525 baseline and tracked hash-bound per-ID ledger; verifies IDs/classification/profile/title/full-row digest, owners/review/scope/disposition/evidence and derives actual carry/defer counters before network. Phase boundaries remain explicit: approved later-phase device/UI work is not silently accepted or made a circular8D prerequisite. Existing39 gate cases + new61 per-ID cases GREEN locally. Draft all525 rows read/mapped (214 backend/shared,311 cross-phase), all final dispositions/owners/acceptance reviews still pending; OPS-003 local proof linked without closing live P1. Details and changed-file inventory in PHASE8D_REQUIREMENT_RECONCILIATION_2026-11-05.md. Exact hosted CI pending; P8D-067 source correction not yet CI-verified. No final PASS or cloud/policy/Android change.

P8D-067 exact source-job retest: **f87a0be0bdaf320752d747ae2a39da01ee0a1ece**, CI41956379795 attempt1 overall completed SUCCESS/source68/68, existing39 + new61 gate cases GREEN. Source-control flaw corrected and source-job verified; actual per-ID acceptance/owners and existing live P1s remain OPEN. One deployment-contract job metadata status in_progress despite success result is preserved; final all-job gate correctly refuses, confirmed with actual captured metadata and synthetic fixture. Follow-up data links9 scoped structural source proofs (10 total rows with partial evidence) without acceptance claims. No executable change after tested source. Details: PHASE8D_SOURCE_CI_41956379795.txt and PHASE8D_REPOSITORY_AND_CI_METADATA_2026-11-05.txt.


## D1-approved architecture continuation — findings P8D-068–072
Read PHASE8D_D1_RECONCILIATION_2026-11-05.md and PHASE8D_D1_LOCAL_CHECKPOINT.md. Source branch audit/phase8d-d1-qualification starts at beta488b34f2; formal8D audit branch is preserved.
P8D-068 (P1): incoherent D1 metadata/chunk read and undetected corruption; native RED, corrected local12-case suite GREEN.
P8D-069 (P2): ignored D1 onlyIf; create/update concurrency RED, atomic transactional guards locally GREEN.
P8D-070 (P1): readiness betaDiagnostic blocks inherited DO export; native RED, validated ephemeral exclusion and fresh local beta DO restore GREEN.
P8D-071 (P1): signed20-point batch fails actual D1 compound SELECT; native RED, VALUES-derived insert/fence and20-point retry locally GREEN.
P8D-072 (P1): direct D1 history write after exact revoke interleaving; native RED, transactional liveness predicate locally GREEN.
Original finding reports and RED/GREEN receipts are retained alongside this ledger; hosted source acceptance is separate, no live closure inferred. P8D-002 full cloud/operational recovery remains P1 OPEN despite local41+4-table recovery progress.
No525-ID acceptance state is changed; no production/phone/endurance PASS.

