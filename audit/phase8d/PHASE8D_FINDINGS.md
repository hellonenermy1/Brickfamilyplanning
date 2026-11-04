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
