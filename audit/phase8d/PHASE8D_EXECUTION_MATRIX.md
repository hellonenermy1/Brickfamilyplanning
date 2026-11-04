# Brick V1 Phase 8D — Live execution and acceptance ledger

**Started:** 2026-11-04, baseline `70a3c287425e9276585fbff85909dcf699dcf2f2`.
**Status vocabulary:** NOT STARTED / SOURCE REVIEWED / REPRODUCED FAILURE / FIXED — RETEST PENDING / CI VERIFIED / INTEGRATION VERIFIED / VERIFIED UNSUPPORTED / BLOCKED — LIVE EVIDENCE / VERIFIED CLOSED. **No UNKNOWN at closure.**

| PDF section | Scope | Initial status | Mandatory proof to obtain |
|---|---|---|---|
| 8D.1 | Actual deployment identity/config | BLOCKED — LIVE EVIDENCE | Active SHA+deployment ID, routes/domain, production/dev bindings, schema, flags and secrets-present without values |
| 8D.2 | Every backend API | 49/49 source candidate paths AST-matched + 3 development auth method records, CI 41804788810; full method/auth/live probes still OPEN | Exhaustive route inventory across worker-p8b→v9→v8→v7→v6→v5b→index, methods/authz/inputs/effects/storage/logging, public-surface probes |
| 8D.3 | Signed device authentication | SOURCE/CI PARTIAL — P-256 health and PIN claims; other signed paths unverified | Valid/wrong/missing/revoked/forged/replayed/expired signature and cross-device tests |
| 8D.4 | Input validation | SOURCE/CI PARTIAL — health and PIN malformed/oversized; full API pending | Malformed/oversized/truncated/duplicate/unknown payload and bounded errors |
| 8D.5 | Sequence/epoch idempotency | SQLITE/CI PARTIAL — ordered epoch/replay matrix; live ingest end-to-end pending | PDF 100,101,102 then 100,102,101,102,102; old/new epochs, huge jumps |
| 8D.6 | Durable ACK boundary | SOURCE/CI PARTIAL — R2 partial write/safety receipt fault tests; Cloudflare runtime pending | Fault seams between Queue, D1, DO, safety, R2, response; exact persisted/ACK invariant |
| 8D.7 | Current-state ordering | SQLITE/CI PARTIAL — current-state event-time policy; DO/WS races pending | Older backlog/fallback/history vs fresh measurement/DO/WS interleavings |
| 8D.8 | D1 schema/migration | SQLITE/CI verified 18 durable tables, FK/integrity/UNIQUE/CHECK/index/revocation history at 711bc3c1; upgrade/Cloudflare concurrency and rollback OPEN | all 16 migrations, upgrade from existing schema, clean install, FK/index/queries, rollback |
| 8D.9 | Queue/DLQ | Six actual synthetic DLQ replay/poison/D1 outage/SOS cases passed; R2 fault tests retained; live DLQ retry exhaustion OPEN | duplicate/poison/retry/exhaustion/replay, R2 two-object put failures |
| 8D.10 | WebSocket | P8D-011 RED→GREEN SOURCE/CI VERIFIED at `1af0ebb8`; LIVE DO/WS + browser reconnection pending; P1 open | parent auth before DO upgrade, family isolation, verified revocation, expiry/alarm across hibernation, proactive parent renewal, cleanup |
| 8D.11 | Parent sessions | SOURCE/CI PARTIAL — production RSA JWT, dev sessions; live Access pending | Access JWT key/aud/exp/iss and development cookie/session/rotation/fixation |
| 8D.12 | CSRF/Origin | 16 production parent mutation paths × 3 invalid Origin variants = 48/48 rejected, no writes, CI 41804788810; live Cloudflare/browser matrix OPEN | all mutating parent routes and upgrade requests reject cross-site |
| 8D.13 | Commands | SOURCE/CI PARTIAL — pairing and revoked controls; phone command proof pending | parent→D1→child delivery→actual-state result audit, nonce/expiry/replay/wrong device |
| 8D.14 | Rate limiting | Existing device/pair/PIN limit tests; P8D-015 history/WS distinct quota missing in source, live edge rules UNKNOWN; OPEN | login/pair/device/command/history/WS/OneMap, by source IP/key, SOS priority |
| 8D.15 | Secrets | SOURCE/CI PARTIAL — built public assets; Git history/CDN/logs pending | source, history, workflow, browser bundles, deployment/logs, no secret values published |
| 8D.16 | Backup/restore | Real SQLite fresh restore earlier PASS; additional synthetic concurrent snapshot tear REPRODUCED at CI 41804788810; P8D-002 P1 OPEN, D1+R2+DO restore blocked | real isolated D1 destructive restore with 016–018 state, R2/DO recovery/inventory |
| 8D.17 | Retention/deletion | Real SQLite per-device safety+crash+audit+health cleanup/isolation PASS; P8D-014 prod R2 raw/trusted 30/90d enforcement UNKNOWN/P1 OPEN | history/raw/evidence/crash/commands/revoked/backup per-class timer and isolation |
| 8D.18 | Observability | P8D-013 raw audit ID leak RED→GREEN source CI; wider backend/phone/Queue/WS/provider observability and live logging OPEN | offline/backend/auth/Queue/WS/provider fault separation without location logging |
| 8D.19 | CI/CD/migration/rollback | SOURCE/CI VERIFIED partial — no live deployment or rollback proof | current deploy entry/schema/branch parity, reproducible build, signed SHA, safe rollback |

## Evidence precedence
1. Runtime API + actual configuration & isolated fault test > executing CI/build log > exact-SHA source check > old prose docs.
2. Do not equate `worker-p8b.ts` template with actually deployed Worker.
3. Preserve 8C source and accepted APK. Phase 8D does not authorize prod deploy, credential rotation or touching user family data.
4. Findings first, fixes second; no inferred PASS.
5. An 8D final PASS requires no open P0/P1, unidentified public endpoint, unknown persistence boundary, unverified authentication path or unproven restore.

## Initial next execution targets
**P8D-001**, then **P8D-002**, then **8D.2 endpoint inventory + 8D.3/8D.6 trust boundaries**. Collect live Cloudflare identity in parallel using an authorized read-only action; until accessible keep 8D.1 blocked.