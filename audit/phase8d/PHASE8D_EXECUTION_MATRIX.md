# Brick V1 Phase 8D — Live execution and acceptance ledger

**Started:** 2026-11-04, baseline `70a3c287425e9276585fbff85909dcf699dcf2f2`.
**Status vocabulary:** NOT STARTED / SOURCE REVIEWED / REPRODUCED FAILURE / FIXED — RETEST PENDING / CI VERIFIED / INTEGRATION VERIFIED / VERIFIED UNSUPPORTED / BLOCKED — LIVE EVIDENCE / VERIFIED CLOSED. **No UNKNOWN at closure.**

| PDF section | Scope | Initial status | Mandatory proof to obtain |
|---|---|---|---|
| 8D.1 | Actual deployment identity/config | BLOCKED — LIVE EVIDENCE | Active SHA+deployment ID, routes/domain, production/dev bindings, schema, flags and secrets-present without values |
| 8D.2 | Every backend API | 49/49 source candidate paths AST-matched + 3 development auth method records, CI 41804788810; full method/auth/live probes still OPEN | Exhaustive route inventory across worker-p8b→v9→v8→v7→v6→v5b→index, methods/authz/inputs/effects/storage/logging, public-surface probes |
| 8D.3 | Signed device authentication | P8D-019/020/021 valid synthetic ECDSA device signatures, screen-time and health replay/revocation races CI GREEN [41815897999]; full live device auth/revoke/forgery matrix OPEN | Valid/wrong/missing/revoked/forged/replayed/expired signature and cross-device tests |
| 8D.4 | Input validation | P8D-018 bounded pre-auth fall JSON + malformed scalars, P8D-019 screen-time root validation, P8D-022 malformed/missing OneMap coordinates CI GREEN [41815897999]; other APIs/live fuzz OPEN | Malformed/oversized/truncated/duplicate/unknown payload and bounded errors |
| 8D.5 | Sequence/epoch idempotency | P8D-019 screen-time newer-capture first write wins and P8D-020 health replay D1 revocation guard CI GREEN, epoch ordering prior CI; cross-device runtime/reboot/huge jump policy OPEN | PDF 100,101,102 then 100,102,101,102,102; old/new epochs, huge jumps |
| 8D.6 | Durable ACK boundary | P8D-021 D1 conditional active check before enqueue, Queue failure remains retryable 503, precise refinement fenced CI GREEN [41815897999]; HTTP ACK/R2/DO transaction and live fault seams still OPEN P1 | Fault seams between Queue, D1, DO, safety, R2, response; exact persisted/ACK invariant |
| 8D.7 | Current-state ordering | P8D-021 revived D1→DO guard + source simulations CI GREEN; concurrent revocation after checked D1/DO, delayed backlog/live Cloudflare runtime still OPEN | Older backlog/fallback/history vs fresh measurement/DO/WS interleavings |
| 8D.8 | D1 schema/migration | SOURCE/SQLITE CI verifies 18-table schema/FK, but native D1 concurrency, schema rollback and large queries still OPEN | all 16 migrations, upgrade from existing schema, clean install, FK/index/queries, rollback |
| 8D.9 | Queue/DLQ | Six actual synthetic DLQ replay/poison/D1 outage/SOS cases passed; R2 fault tests retained; live DLQ retry exhaustion OPEN | duplicate/poison/retry/exhaustion/replay, R2 two-object put failures |
| 8D.10 | WebSocket | P8D-011/017 SOURCE+CI GREEN at `86b6b929` [41812573198]: full Worker Origin/lease/JWT scrub/device routing; generated prod+dev client stale socket/late HTTP guards, terminal 4003 stop, bounded reconnect, proactive 24s renewal; DO hibernation/alarm source simulations. Real Cloudflare Access/DO WS and family/session isolation still OPEN P1 | isolated DO WS runtime, exact Access JWT/session upgrade, cross-family controls, idle alarms, actual hibernation, revoke/logout concurrent upgrade, browser tab/sleep and reconnect; measure timing/no gaps |
| 8D.11 | Parent sessions | DEV session exact-expiry RED→GREEN at d204636c, randomized multiple sessions/fixation/logout isolation CI; live dev rotation and production Access config still OPEN | Access JWT key/aud/exp/iss and development cookie/session/rotation/fixation |
| 8D.12 | CSRF/Origin | 16 production parent mutation paths × 3 invalid Origin variants = 48/48 rejected, no writes, CI 41804788810; live Cloudflare/browser matrix OPEN | all mutating parent routes and upgrade requests reject cross-site |
| 8D.13 | Commands | P8D-016 one-shot location command revoked-device race RED→GREEN actual SQLite 2a3dd8ce, other command lifecycle/device-side confirm tests OPEN | parent→D1→child delivery→actual-state result audit, nonce/expiry/replay/wrong device |
| 8D.14 | Rate limiting | P8D-022 missing/blank OneMap coords rejected before provider calls CI GREEN; broader rate limits, shared IP and real Cloudflare controls still OPEN | login/pair/device/command/history/WS/OneMap, by source IP/key, SOS priority |
| 8D.15 | Secrets | SOURCE/CI PARTIAL — built public assets; Git history/CDN/logs pending | source, history, workflow, browser bundles, deployment/logs, no secret values published |
| 8D.16 | Backup/restore | P8D-002 old torn per-table D1 snapshot RED→transactional all-18-table batch GREEN 41809094309; true Cloudflare D1+R2+DO isolated restore, large data, rollback still OPEN P1 | real isolated D1 destructive restore with 016–018 state, R2/DO recovery/inventory |
| 8D.17 | Retention/deletion | Source setup ALREADY had 30/90-day R2 lifecycle rules; non-destructive GET+merge preserving unrelated rules now CI SOURCE only; real Cloudflare rule/legacy retention/expires still UNKNOWN P1 | history/raw/evidence/crash/commands/revoked/backup per-class timer and isolation |
| 8D.18 | Observability | P8D-023 round-robin cursor gives bounded 20 active devices per cron and covers 104 synthetic devices within 7 ticks; source/SQLite CI GREEN [41815897999]; real cron/provider/alert telemetry OPEN | offline/backend/auth/Queue/WS/provider fault separation without location logging |
| 8D.19 | CI/CD/migration/rollback | Immutable-pinned actions/accepted-branch/final PASS exact SHA+strict deploy tested SOURCE CI; branch protections, live migration and isolated rollback OPEN | current deploy entry/schema/branch parity, reproducible build, signed SHA, safe rollback |

## Evidence precedence
1. Runtime API + actual configuration & isolated fault test > executing CI/build log > exact-SHA source check > old prose docs.
2. Do not equate `worker-p8b.ts` template with actually deployed Worker.
3. Preserve 8C source and accepted APK. Phase 8D does not authorize prod deploy, credential rotation or touching user family data.
4. Findings first, fixes second; no inferred PASS.
5. An 8D final PASS requires no open P0/P1, unidentified public endpoint, unknown persistence boundary, unverified authentication path or unproven restore.

## Initial next execution targets
**P8D-001**, then **P8D-002**, then **8D.2 endpoint inventory + 8D.3/8D.6 trust boundaries**. Collect live Cloudflare identity in parallel using an authorized read-only action; until accessible keep 8D.1 blocked.