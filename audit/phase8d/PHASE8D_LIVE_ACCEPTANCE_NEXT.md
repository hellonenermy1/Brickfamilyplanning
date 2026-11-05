# Phase 8D fixed acceptance queue — current operational checklist

Updated 2026-11-05. **8D IN PROGRESS / NOT PASS.** Authority: Phase 8 PDF pp.44–54, sections 8D.1–19, plus the recovered 525-requirement baseline. This file supersedes its earlier 18-table/live-access packet; the execution matrix and findings ledger retain historical evidence. Do not restart completed source work or treat this checklist as a final acceptance record.

## Evidence checkpoints and reuse

- Previously green executable: `cd5e50ca050a8afa8932434c590d923e3ade62a4`, [source CI 41869667667](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41869667667), all three jobs successful. Reuse unchanged scoped evidence; a green source suite does not attest a deployment.
- Latest read-only live check: [41839919454 attempt 5](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41839919454/attempts/5), completed failure. Attestor source remains `d74b30d97e97a01ce55171f1931c685d51f4d180`; it is not the audit branch HEAD. Sanitized results: `PHASE8D_LIVE_ATTEMPT5_2026-11-05.txt`.
- Current recovery batch: `PHASE8D_FULL_STORE_RECOVERY_2026-11-05.md`; local destructive D1/R2/DO evidence at executable `58285064fbf3d6b707dd15d8ef2fd3fb967ae47d`, [CI41952880677](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41952880677) all three jobs SUCCESS (source67/67). Not a live cloud pass. Exact proof `PHASE8D_SOURCE_CI_41952880677.txt`.
- D1 recovery scope is **38 durable tables**, four explicitly excluded transient tables and six development-only tables (48 total classified). Older 18-table prose is historical.
- Canonical requirements: `audit/phase8c/PHASE8C_RECOVERED_525_REQUIREMENTS.csv`. It is a requirement baseline, not a completed per-ID evidence/owner ledger. Full 525-ID applicability and evidence reconciliation remains pending.

## Ordered work batches

1. **Read-only account/access unblock.** Project owner/admin: extend the existing dedicated `CLOUDFLARE_AUDIT_READ_TOKEN` only with account/resource-scoped D1 Read, Workers R2 Storage Read and Access Apps & Policies Read. Never paste a token or substitute deployment credentials. Verify the intended account before any provisioning. Re-run the existing GET-only audit once access changes; repeating identical denied reads adds no acceptance evidence.
2. **Concrete infrastructure and Access repair proposal.** After reads identify the correct resources, prepare exact deployment/binding/Queue/Access/policy changes and rollback. Observed seven missing production bindings, two development quotas, absent expected Queue/DLQ, public production local login and unreadable active Git SHA stay open. Templates are not proof repairs are deployed. Existing scope does not authorize applying these changes.
3. **Isolated production-equivalent recovery and fault batch.** Requires explicitly authorized, named nonproduction Cloudflare resources and synthetic identities. Quiesce stores, capture inventory/checksums, back up, destroy isolated source, restore fresh D1/R2/DO, test missing/corrupt objects, revocation and command expiry, interrupted recovery, measured RTO/RPO, retention age and bounded large data. In the same isolated environment execute ACK/Queue/R2/DO/DLQ failure seams and schema migration/rollback.
4. **Live trust boundaries and operational policy batch.** Test family ownership, device credentials, WebSocket expiry/reconnect/revocation, Origin, commands, real quotas/NAT fairness, cleanup ages, diagnostics, secrets/rotation evidence and release protection. Use synthetic data, scoped redacted traces and exact deployed identities.
5. **Closeout reconciliation.** Link exact-source evidence to all 19 sections and all applicable 525 requirements, resolve every P0/P1 and unknown, verify actual release protections and rollback, then evaluate the strict final acceptance contract. No final PASS file exists or may be inferred from source CI.

## Fixed section checklist

Every row remains open or partial until its listed proof is recorded. “Local” includes source/native SQLite/workerd evidence only. The active section count is fixed at 19; new findings attach to a row rather than silently expanding acceptance scope.

| Section | Existing evidence to reuse | Outstanding acceptance proof / dependency |
|---|---|---|
| 8D.1 Deployment identity/config | Exact-source templates, read-only drift attestor | Active prod/dev source SHA, actual bindings/resources/account/Access; seven prod and two dev binding gaps; batches 1–2 |
| 8D.2 Every backend API | Recorded route/method inventory and source auth checks | Reconcile complete current inventory with deployed methods, auth, storage, rate and side effects; batch 4 |
| 8D.3 Device signatures | Synthetic P-256, identity canonicalization, replay/revoke tests | Actual deployed valid/invalid/wrong-device/revoked credentials and family separation; batch 4 |
| 8D.4 Input validation | Bounded payload/schema/coordinate and malformed body cases | Deployed hostile cases, body limits and absence of unintended writes; batch 4 |
| 8D.5 Sequence/epoch idempotency | Native ordering, immutable UUID content, marker and concurrency regressions | Actual service races, reordering, replay and identity boundaries; batches 3–4 |
| 8D.6 Durable ACK | Source failure injection and local D1→Queue→R2 chain | Actual pre/post-commit and enqueue faults, device retries and durable convergence; batch 3 |
| 8D.7 Current-state ordering | Native SQLite/workerd ordering and persisted DO revoke fence | Cross-service concurrent revoke, late writes and restart under real service timing; batch 3 |
| 8D.8 D1/schema | Current schema/constraints, 38-table recovery and migrations in CI | Actual isolated migration/interruption/rollback, query scale and constraints; batch 3 |
| 8D.9 Queue/DLQ | Poison/retry and R2-write fault cases, local actual Queue | Correct live Queue/DLQ configuration, delivery retries/exhaustion/replay; batches 2–3 |
| 8D.10 WebSocket | Local workerd JWT/lease/alarm/hibernation/revoke, client guards | Live Access, cross-family/session rights, logout/revoke/reconnect and browser timing; batch 4 |
| 8D.11 Parent sessions | Local dev expiry/fixation/rotation checks and Access contract | Correct live production Access-first behavior, issuer/audience/policy/session/ownership; batches 2,4 |
| 8D.12 CSRF/Origin | Recorded parent mutation rejection matrix, forged marker denial | Actual deployed mutation and upgrade matrix, no cross-site writes; batch 4 |
| 8D.13 Commands | Local one-shot, expiry, result finality/revoke and no-replay restoration | Real synthetic child delivery/nonce/result/actual-state confirmation and audit trail; batches 3–4 |
| 8D.14 Rates | Source fail-closed device/provider/parent quota boundaries | Deployed missing bindings, real quotas, shared-IP fairness and SOS priority; batches 2,4 |
| 8D.15 Secrets | Built-asset checks and bounded Git-history scanner/control evidence | Actual CDN/build/log checks, exposure triage/rotation proof where required; batch 4; no blanket scanner pass |
| 8D.16 Recovery | D1 v3, local destructive D1+R2+DO and rejection evidence | Full isolated Cloudflare recovery, consistent capture/manifest orchestration, interruption, scale/RTO/RPO; batch 3 |
| 8D.17 Retention/deletion | Source cleanup/lifecycle merge and boundary regressions | Actual lifecycle/read rights, per-class ages/legacy prefixes, restored R2 original-age handling and isolation; batches 1,3,4 |
| 8D.18 Observability | Local bounded cron sweep/incident dedupe/fault distinctions | Actual cron/provider/Queue/DO diagnostics and alerts with sanitized logs; batch 4 |
| 8D.19 CI/release/rollback | Pinned CI, accepted-branch/manual gate, strict hash-bound acceptance verifier | Actual admin policy attestation (main/audit unprotected; rulesets empty in prior reads), isolated rollback and exact deployed identity; batches 1,3,5 |

## Limits and stop conditions

No production deploy, Cloudflare resource/SQL write, account-policy change, credential rotation, family-data access, Android source edit or APK rebuild is authorized by this audit continuation. GitHub source commits/CI, existing GET-only checks and reversible synthetic local tests are authorized. Current private repository access works; GitHub Team alone does not prove branch protection.

No P0/P1, unknown route/auth/persistence boundary, unproven recovery or undocumented 525-ID gap may be hidden by a source test pass. Freeze accepted Android runtime source at `2c492efff01095e17f96af3c24ac07ac0b5c3739`; the previously documented 8C instrumentation test is not a runtime change. Do not begin 8E/8F or create a final PASS until required evidence is accepted.
