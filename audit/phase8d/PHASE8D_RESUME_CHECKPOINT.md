# Brick V1 — Phase 8D durable continuation checkpoint

**Current state:** Phase 8D STARTED, NOT PASS, opened 2026-11-04. Created branch `v1-p8d-backend-deep-audit` from `v1-p8c-android-deep-audit` at SHA `70a3c287425e9276585fbff85909dcf699dcf2f2`.

Read these before continuing:
1. User-provided **Brick V1 Phase 8 Full Audit Execution Plan(4).pdf**, 76 pages; 8D is pp.44–54; global no-inferred-PASS rules pp.1–9.
2. `audit/phase8d/PHASE8D_BASELINE.md`
3. `audit/phase8d/PHASE8D_FINDINGS.md`
4. `audit/phase8d/PHASE8D_EXECUTION_MATRIX.md`
5. `audit/phase8c/PHASE8C_RECOVERED_525_REQUIREMENTS.csv`
6. `audit/phase8c/PHASE8C_FINAL_ACCEPTANCE_2026-11-04.md`

Key current findings: **P8D-001** source-proven deploy script vs current Worker/template/schema drift; **P8D-002** old 12-table D1 backup inventory vs new migration 016–018 essential state; **P8D-003** public hash of reusable 6-digit development access code (live exposure unknown); P8D-004/005 unclassified audit targets.

Current software source: production `wrangler.template.jsonc` points `src/worker-p8b.ts`, but setup/deploy/verification still assert `worker-v9.ts`, schema 15, old release metadata. Development uses `src/worker-v10.ts`, D1 sessions. Backend inherits `worker-p8b.ts` → `worker-v9.ts` → `worker-v8.ts` → `worker-v7.ts` → `worker-v6.ts` → `worker-v5b.ts` → `index.ts`.

**Live Cloudflare account not verified**. Connector exposes GitHub repository files and workflows, **not** Cloudflare account API. Do not hallucinate deployment SHAs or secret presence, never request private values in chat, and do not perform production destructive actions.

**Next requirement IDs:** `OPS-011`, `OPS-012`, `OPS-002`, `OPS-003`, `SEC-013`, `BE-001`. Every subsequent session must record exact SHA, actual tests, finding status and next unresolved items.

To finish Phase 8D: all 19 sections 8D.1–8D.19 mapped/tested with evidence; 13/13 old Android findings stay closed at their frozen source; zero P0/P1 Cloud findings; every public endpoint/auth/persistence path accounted; real isolated backup→destroy→fresh restore demonstrated; final acceptance report with exact PASS logs. Phase 8E and Phase 8F are NOT automatically approved.
---

## Run continuation after first CI cycle (2026-11-04)

Branch `v1-p8d-backend-deep-audit` is now beyond its baseline due to **audit-only tests and backend deployment-tool fixes**; Android frozen source is not changed. First checked result: [original red 41776381607](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41776381607). After fixes, [41777166077](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41777166077): **source-build + migration replay PASS, deployment-contract PASS, backup-contract FAIL**. First fix source SHA `e62b301f3bd99ee3e10aab41134573dbb00c7165`.

**Do not claim P8D-001 fully CLOSED:** its source/CI correction passes, but live Cloudflare deploy/source/Access/schema is still UNKNOWN and explicitly blocked. The production deploy workflow intentionally requires non-existent `v1-p8d-accepted-backend` and PASS report to avoid deploying the audit branch.

**Next primary tasks:**
1. P8D-002: inventory every D1 table and R2/DO state, define explicit recoverable/excluded-state policy, version backup format with backwards compatibility, ensure no expired command/PIN replay on restore, revise real destructive isolated restore drill and test with nonempty new P8B tables.
2. P8D-003: remove/restrict published six-digit reusable development code hash and run independent session/origin/cross-environment tests. Live exposure must not be inferred.
3. Read-only live Cloudflare snapshot with safe credentials managed through trusted Actions secrets or authenticated connector; no repo plaintext secrets or unapproved production mutation.
4. 8D.2 full nested Worker API inventory, followed by 8D.3–8D.19 authenticated fault testing.
5. Update findings/matrix and keep exact SHAs after each test.

Current verdict **8D IN PROGRESS / NOT PASS; P8D-002 P1 remains OPEN**. 

---

## 2026-11-04 post-unknown-error continuation — VERIFIED, NOT PRODUCTION DEPLOYED

**Branch:** `v1-p8d-backend-deep-audit`. **Frozen Phase 8C Android source:** `2c492efff01095e17f96af3c24ac07ac0b5c3739` unchanged. Final tested production/backend source **`168b192f2912a44144d55ec2bae3bc64d1580e58`**. Later audit-document-only commits must never be confused with retested code.

**Source commits/evidence:**
- `5138b3c3` P8D-002 snapshot v2 covers 18 D1 durable tables, old 11/12-table v1 compatibility, no pending command resurrection.
- `4e7bd489` backup fixture and CI; full green [41783419493](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41783419493).
- `694d2094` real disposable SQLite source deletion / fresh restore; full green [41783806915](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41783806915).
- `b096a712` P8D-003 remove public development six-digit PIN hash and require private high-entropy token hash; full green [41784259743](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41784259743).
- `e1e6f9e1` P8D-006 negative regression deliberately **RED** [41784727728](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41784727728).
- `168b192f` P8D-006 revoked-device control mutation guard fix; exact same regression **GREEN** [41784886446](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41784886446).

**8D remains OPEN / NOT PASS:** P8D-001 only source/deploy contract tested, production Cloudflare ID and bindings UNKNOWN. P8D-002 source/real SQLite restored but Cloudflare D1/R2/DO full disaster recovery unverified; remains P1. P8D-003 production dev credentials/sessions not rotated/attested; provisional P1. P8D-004 ACK/Queue/R2 durability unverified. P8D-005 environment separation unverified. P8D-006 source/CI retested, live SQL/route race proof pending.

**Next substantive work:** finish 8D.2 exhaustive public/parent/device endpoint inventory (initial candidate register in `PHASE8D_ENDPOINT_INVENTORY_DRAFT.csv`), runtime auth/device revocation + cross-device tests, real Cloudflare read-only deployment attestation, R2/DO recovery/drill, coherent backup under concurrent writes. Then 8D.1–8D.19 closure and final 525-ledger mapping. Do not use production data for fault injection or perform deployment without explicit release approval.

**Dev beta migration requires operator-controlled `BRICK_DEV_PARENT_ACCESS_TOKEN`** (32 random bytes base64url minimum) and private Worker-secret provisioning, plus real old-session revocation/credential rotation on the affected development deployment. See `PHASE8D_SECURITY_REPORT.md`. Do not put the token in GitHub or in chat.

---

## 2026-11-04 later Phase 8D continuation — exact source and RED/GREEN receipts

**Active branch:** `v1-p8d-backend-deep-audit`. **Latest source pass:** `6ef174d366932e75852d50667e8c836108d653da` with ALL THREE jobs SUCCESS [41791862854](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41791862854). Subsequent audit-only commits do not change qualified code.

**8D.5/6/9 reliability discoveries:**
- P8D-007: original same-segment concurrent R2 sends can both ACK while last-write-wins loses one location. RED [41790943895](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41790943895), fixed with CAS/ETag conditional writes and retry on collisions, GREEN [41791153745](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41791153745).
- P8D-008: duplicate epoch/sequence changed prior R2 coordinate. RED [41791762934](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41791762934), first-write-wins fix, GREEN [41791862854](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41791862854).
- P8D-004: ACK/R2 partial failure matrix GREEN [41791370163](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41791370163); still not full Cloudflare durability qualification.
- 8D.3–5: real P-256 signed-health wrong key/device/revoked/tamper/replay/timestamp/size matrix GREEN [41791527844](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41791527844); other API handlers and 100–101–102/epoch matrix not yet tested.

**Mandatory remaining:** all 19 PDF sections 8D.1–8D.19 still require completion/mapping at appropriate scope. In particular 8D.1 actual deployed Cloudflare Worker SHA/bindings and dev secret rotation; 8D.2 full route probes/coverage; 8D.3–8D.5 all device and epoch paths; 8D.6/8D.9 live queue/DLQ; 8D.7 DO + history/fallback ordering; 8D.8 D1 concurrency; 8D.10 parent WebSockets; 8D.11–8D.15 session, CSRF, limits and secrets; 8D.16 D1+R2+DO isolated full-stack restore plus coherent snapshot under writes; 8D.17–8D.19 retention, observability, deployment and rollback. Do not advance to 8E or declare 8D PASS.

---

## 2026-11-04 subsequent Phase 8D durable handoff

**Last tested code SHA:** `d52fff68ffb29b4d99a35cc34f03ec78f4dc8e91`, ALL CI 3/3 GREEN [41794954253](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41794954253). Audit-document-only commits after this are not retested code. This branch is NOT deployed. Phase 8C Android code untouched.
- P8D-009 PIN cryptographic identity/body limit: [RED 41793189600](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41793189600) → [GREEN 41793357237](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41793357237); Origin/rate [GREEN 41794792235](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41794792235).
- P8D-010 duplicate confirmation false 500 (no ghost thanks to UNIQUE): [RED 41794274779](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41794274779) → [GREEN 41794488568](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41794488568) with true SQLite D1 schema.
- 8D.11 synthetic real RSA JWT Access [GREEN 41793555257](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41793555257).
- 8D.5/7 exact SQLite epoch/sequence/current order [GREEN 41793816979](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41793816979).
- 8D.15 built public asset secrets marker scan [GREEN 41794954253](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41794954253).
- **New P8D-011 P1 provisional**: WS active subscription expiry and session/device revocation enforcement not demonstrated. Requires negative test+design+live isolated Cloudflare DO/WS proof.
- **Still open:** 8D.1 actual Cloudflare deployment identity, P8D-002 full D1/R2/DO recovery, P8D-003 dev credential rotation and D1 session revocation, 8D.2 full route/method/authz inventory, 8D.9 real DLQ, 8D.10 WS, 8D.12 global CSRF, 8D.16 coherence and restore, 8D.17 retention, 8D.18 observability, 8D.19 live rollback.
- **Verdict:** Phase 8D NOT PASS, Phase 8E/8F NOT AUTHORIZED, no production deploys.

---

## 2026-11-04 P8D-011 handoff — tested security fix, NOT Phase 8D closure

- **Current audited branch:** `v1-p8d-backend-deep-audit`. **Last CI-tested source SHA:** `1af0ebb8497d4f2ce38eb342645292f00368c623`. Test-only failure [41797894520](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41797894520) → complete 3/3 source CI SUCCESS [41798531256](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41798531256).
- **P8D-011:** an unleased DO socket previously returned 101. New parent-auth-bound maximum 30-second WS lease, sanitized Worker/DO boundary, hibernation attachment, alarm/expiry checks, explicit persistent device-revocation socket fencing, and dev-session logout socket invalidation pass real bundled DO tests using a Node-only Cloudflare shim. No other backend finding is claimed closed.
- **Android code still frozen:** `2c492efff01095e17f96af3c24ac07ac0b5c3739`; permanent signed Phase 8C APK unchanged. **Production/development Cloudflare deployments unchanged and live binding/identity still UNKNOWN.**
- **Outstanding P8D-011 closure:** isolated Cloudflare DO real socket authentication expiry; session logout/device revoke while connected; worker upgrade Origin and cross-family isolation; hibernation; browser reconnect without stale state and proactive renewal before a 30-second lease elapses. A Cloudflare alarm may run late, so current browser reconnect-on-close alone needs 8E scrutiny. The source/CI test does not prove all of this.
- **Next source audit targets:** finish 8D.2 full 49-candidate endpoint inventory with actual routes/methods/auth/side effects and all source layers, 8D.12 browser mutation matrix, 8D.14 rate limits; separately investigate 8D.16 coherent cross-table backup and full isolated D1+R2+DO restore. 8D.1 real Cloudflare identity remains blocked without read-only connector evidence; P8D-003 live dev token/session rotation requires authorized operator action. No production deployment, credential changes or user data access.
- **Acceptance remains:** 8D IN PROGRESS / NOT PASS; 8E/8F NOT AUTHORIZED; P8D-011 P1 provisional remains open until runtime verification. Global PDF 8D.1–8D.19 still governs closure.
  
---

## Phase 8D.2 endpoint-matrix integrity checkpoint — 2026-11-04

- **Last complete three-job CI success:** `48e82f1e461ff9fe99ffea4613908c54211926fe`, [41799170739](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41799170739). Since the last P8D-011 source/test success `1af0ebb8`, later changes were a validator, CI definition, the 49-route endpoint audit CSV, and audit documentation only; Android source remained unchanged.
- **P8D-012:** observed 49 data rows with 12 fields vs 11-column header. RED [41799035064](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41799035064), fixed missing `source_evidence_level` header, GREEN [41799170739](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41799170739). P2 audit evidence integrity finding **VERIFIED CLOSED**. The 49 entries are SOURCE CANDIDATES, not exhaustive/verified deployed routes.
- **Next substantive 8D work:** enumerate ALL layered Worker methods/routes against 49 candidates, prove every public endpoint's auth/validation and mutation policy (8D.2/3/4/12/14), test parent WebSockets in isolated Cloudflare (8D.10), D1/R2/DO coherent backup restore (8D.16), observe actual live deployments securely (8D.1). **No Cloudflare account access or production deployment was performed.**
- **Verdict unchanged:** 8D NOT PASS, no 8E/8F authorization, Phase 9 still later.

  
---

## 2026-11-04 continuation — six audit streams + one negative backup reproduction

**Latest fully tested source SHA:** `711bc3c1e54fe63659ddab629d05ff89bfdb65ae`, all 3 Phase 8D CI jobs SUCCESS [41804788810](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41804788810). Subsequent changes to `audit/phase8d/` documentation/endpoint evidence do **not** alter executable backend code. Previous frozen Android source `2c492efff01095e17f96af3c24ac07ac0b5c3739` remains untouched.

**New test coverage:** 8D.2 49 source routes + 3 dev login/logout method records; 8D.12 48 invalid-Origin production mutation cases; 8D.8 18-table SQLite FK/constraints/indexes; 8D.9 six DLQ poison/outage/SOS cases; 8D.17 real D1 per-device cleanup/isolation; 8D.18 D1 audit path privacy (P8D-013 RED→GREEN). Each has exact CI logs, not live Cloudflare proof.

**New confirmed source concern:** P8D-013 raw device/session IDs leaked to D1 audit paths before `44e259c5`, now fixed and retested at source/CI only. **Reproduced OPEN backup defect:** P8D-002 can mix generation 0 `devices` with generation 1 `device_capability_profile` when table queries straddle one synthetic atomic DB write; this is evidence of absent coherent-snapshot guarding in source, NOT proof of live data loss.

**New open findings:** P8D-014 provisional P1 for production R2 raw/trusted 30/90-day retention unverified, pending actual lifecycle policies and end-to-end safe cleanup proof. P8D-015 provisional P2 for dedicated history/WS rate-limit source gaps, subject to edge-rule attestation. No speculative fixes or production mutation performed.

**Next required:** verify production+development Cloudflare deployment identity/bindings/rules READ ONLY; restore D1/R2/DO into truly isolated Cloudflare resources and solve backup snapshot coherence; live DO/WS/Access/revocation; full nested public route method/auth/storage probes; per-class R2 retention; resource-safe history, WS and geocode quotas; remaining 8D.1–8D.19 acceptance work. No Phase 8E/8F, no live production deploy, no Android audit reopening unless code changes.

  
---

## 2026-11-04 Phase 8D six-stream verified handoff — do not restart

**Exact last fully CI-tested code and workflow SHA:** `a00a9bd19dc74cbf369b37fb555bd7461d67daa7`, Phase 8D CI run [41810197849](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41810197849), **all 3 jobs SUCCESS**. Later documentation/endpoint-CSV commits are not a new code acceptance and do not require repeating closed source tests. At the time of this handoff the audit branch is **not deployed**; no Cloudflare live account access, resource mutation, credential rotation or Android source changes were made.

**Completed source/CI work this turn (6 areas):**
- **8D.16/P8D-002:** 18-table D1 backup now uses one documented transactional `DB.batch()` read, bounded at 500001 rows/table; source regression RED [41808902999](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41808902999) → GREEN [41810197849](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41810197849). Original full Cloudflare D1+R2+DO isolated restore/large backup/rollback **P1 OPEN**.
- **8D.13/P8D-016:** actual SQLite revocation interleaving previously created a location-control command after revoke (RED [41809158623](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41809158623)); conditional INSERT/UPSERT plus 410 and no overwrite now GREEN. Other command lifecycle/phone confirmation and native Cloudflare D1 concurrency still OPEN.
- **8D.17/P8D-014:** **CORRECTION:** setup already had raw 30-day/trusted 90-day/evidence 30-day R2 lifecycle rules. New pure merge and actual setup integration preserve unrelated bucket rules, deny overlapping unmanaged delete policies and fail closed if GET invalid. CI GREEN; actual lifecycle, legacy objects and end-to-end expiry remain **P1 OPEN**. New target JSON is informational, not applied.
- **8D.14/P8D-015:** parent history 60/min and WS 30/min separate Cloudflare bindings/guards in both templates and actual top Worker; bad Origin before rate, absent binding returns 503; CI GREEN. Live rate policy, shared-IP/real parent reconnection/other routes still OPEN.
- **8D.11:** development session exact-expiration inequality `>=` bug RED [41809656810](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41809656810) → strict `>` GREEN. Two-session independence, fixation, logout/Origin tested. Live dev credential rotation/P8D-003 OPEN.
- **8D.19:** source release-guard CI verifies SHA-pinned GitHub actions, separate accepted branch, 8D final PASS, exact Git SHA, locked npm and strict deploy; GREEN. Branch protections, actual deployment/migration/rollback NOT VERIFIED.

**Source status only, NOT release status:** Phase 8A–8C remain accepted within past scopes; Phase 8D **IN PROGRESS / NOT PASS**; no Phase 8E/8F authorization, no production deploy. **Critical future path:** authorized read-only Cloudflare deployment identity/lifecycle/rate/Access inventory (8D.1); isolated D1+R2+DO consistent restore (8D.16); real DO/WS expiry and revocation (8D.10); full device-auth and endpoint live probes (8D.2–8D.7); command delivery to real phone; live Queue/DLQ retry/poison; retention; 8D.18 observability; 8D.19 release rollback. Keep the 19-section PDF exit gate authoritative.


---

## 2026-11-04 P8D-011/017 WebSocket continuation — four workstreams

- **Last fully CI-tested executable code/workflow commit:** `86b6b9295b2d1a58d37ff0addf37de35a4d3d3d5`; all 3 Phase 8D jobs SUCCESS [41812573198](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41812573198). Audit-only documentation commits after this do not change the verified code.
- **8D.10 completed source test areas:** (1) full layered Worker authentication, same-origin and untrusted internal lease stripping, separate child DO routing; (2) generated production and development parent JS previous-socket message/close and delayed HTTP stale child isolation, with one active polling fallback; (3) terminal 4003 revoke/logout disconnect without retry flood and 4001 expiry with bounded reconnect; (4) 24-second proactive renewal before <=30 second server lease, plus previous DO hibernation/alarm test shim.
- **New P8D-017:** stale previous child's WS message rendered under newly selected device. Negative RED [41811596033](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41811596033), corrected in shared Phase 6 client source with stable socket/device guards and same code reused in development, GREEN [41812573198](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41812573198).
- **New P8D-011 client resilience proof:** original 30s-lease browser depended on onclose; no proactive timer RED [41812278224](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41812278224), now sets 24s guarded renewal, GREEN 41812573198. Bounded backoff and terminal stops proven with generated JS simulation. **Not zero-gap WS guarantee.**
- **Not done/NOT PASS:** no live Cloudflare Access+DO WS, delayed alarms, hibernation, browser tab suspension, actual session revocation races, multi-user/family isolation or real 72h unattended device trials. P8D-011 provisional P1 remains OPEN. Phase 8D is still IN PROGRESS; Phase 8E/8F NOT AUTHORIZED. The approved Phase 8C Android code and APK remain untouched, no production deployment or secret rotation occurred.
- **Next first action:** isolated Cloudflare account read-only deployment evidence, then WS upgrade/revoke/expiry tests with synthetic identities and real browser; do not redo the source/VM security tests unless their code changes.


---

## 2026-11-04 P8D-018–023 six-workstream verified continuation checkpoint

**Last CI-tested executable code SHA:** `938e3666e863f3836ac6ce64657d73c6a3b0d8c6`. [Phase 8D CI 41815897999](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41815897999) = ALL THREE jobs PASS, including existing audit regressions. Subsequent audit-document commits do not change this verified code. No Android source, production deployment, Cloudflare resources or credentials touched.

**Six new findings source/CI retested:**
- **P8D-018 8D.4:** oversized unauthenticated fall body now rejected before JSON parsing at 8192 bytes; rejects null/array/primitive roots, preserves signature gate. RED [41815113010](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41815113010) → GREEN [41815897999](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41815897999).
- **P8D-019 8D.3/.5:** signed daily screen time now strictly newer `capturedAtMs` first-write-wins with atomic D1 active-device check; malformed roots fail closed, stale/duplicate HTTP response leaves persisted total unchanged. Native SQLite/P256 RED [41815219163](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41815219163) → GREEN.
- **P8D-020 8D.3/.5:** health replay watermark update checks D1 revocation in same conditional INSERT/UPSERT; revoked→401 versus replay→409. Native SQLite/P256 RED [41815354577](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41815354577) → GREEN.
- **P8D-021 8D.5/.6/.7:** single and batch location ingress D1 event writes now have active-device predicates; D1 acceptance before Queue, Queue failures 503 for child retry, second D1 check before live-only preview; separate precise endpoint SQL also fenced. RED [41814765962](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41814765962) AND [41815827201](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41815827201) → GREEN. **P1 remains OPEN** for D1/Queue/DO cross-store race and retry after D1-before-Queue crash, no simulated test equates to live durable R2 history.
- **P8D-022 8D.4/.14:** missing/blank OneMap lat/lon no longer coerced to 0; valid literal (0,0) outside Singapore remains valid but triggers no OneMap call. RED [41815605625](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41815605625) → GREEN.
- **P8D-023 8D.18:** bounded, persistent rotating commute cron cursor via existing `provider_cache`, 20 candidates/tick; native SQLite test verifies all 104 active synthetic devices covered over 7 ticks and excludes 3 revoked. Previous source gate [41815445041](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41815445041) did NOT prove runtime bug, source had fixed first-100 selection. GREEN; actual cron cadence and failure/operational telemetry still OPEN.

**Scope:** Six code areas source/CI FIXED–RETESTED, not full Phase 8D section acceptance. Keep 8D.1 actual Cloudflare deploy identity, 8D.2 live endpoint/method inventory, 8D.3/4 real negative security, 8D.6 Queue/D1/DO partial-failure durability, 8D.9 live DLQ, 8D.10 WS, P8D-002 full isolated D1+R2+DO restore, P8D-014 actual R2 retention, 8D.18 live alarms, 8D.19 rollback OPEN. **Phase 8D NOT PASS; 8E/8F not started; Phase9 physical OPPO later.**


---

## 2026-11-04 P8D-024–029 — six-workstream strict CI acceptance and exact continuation

**Branch:** `v1-p8d-backend-deep-audit`. **Last fully CI-tested executable source/workflow SHA:** `07dcf73c9d8a3859a7b3ba43a88aa793149d9f4d`. [CI 41818648409](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41818648409): ALL 3 jobs SUCCESS, six new **strict blocking** gates, no temporary `continue-on-error` bypasses. Subsequent `audit/phase8d/` evidence docs/CSV commits do not change executable source. **No Android source, no production Cloudflare Worker deployment, no Cloudflare resource or secret mutations.** No real D1/Queue/R2/DO network integration was run.

**Do NOT repeat these completed source/CI tests unless related code changes:**
1. **8D.6/.7 P8D-024:** queue submission now precedes public parent-visible DO update for both single and batch signed location uploads. Failing Queue returns HTTP 503 and never publishes live; same signed packet replay repairs missing queue/live after preexisting D1 idempotency index. RED [41817926970](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41817926970), source/SQLite GREEN [41818648409](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41818648409). **Still P1 OPEN:** D1 write before Queue crash, non-atomic multi-store and async R2, live concurrent revocation.
2. **8D.18/.9 P8D-025:** backend incident alarms bounded 100/tick and persisted with deterministic `inc_<incidentId>` event id and INSERT OR IGNORE. Two concurrent cron snapshots produce one emitted safety alert when D1 writers serialize. GREEN 41818648409, all other alerts still need live verification.
3. **8D.18 P8D-026:** reject false packet loss percentage caused by absurd signed sequence gaps, report null + discontinuity evidence; normal 75% 3/4 pattern preserved. GREEN 41818648409. Real device sequence policy and metrics still open.
4. **8D.14/.18 P8D-027:** atomic active-device D1 claim limits on-demand R2 commute derivation to once/10m per child; parallel claims do not fan out; rotating cron retained. GREEN 41818648409, live freshness/cadence still open.
5. **8D.4 P8D-028:** commute `limit` and screen-time `days` now reject NaN/Infinity/negative/fractional before binding SQLite (HTTP 400); high positive integer request clamped to max. GREEN 41818648409, wider method/query input matrix remains open.
6. **8D.14 P8D-029:** production/dev config have distinct `PARENT_GEOCODE_RATE` (120/min) and `PARENT_COMMUTE_RATE` (30/min), with same authenticated-parent-first fail-closed route guard. GREEN 41818648409; actual Cloudflare per-colo fairness/NAT and deployed config not attested.

**Mandatory remaining (all approved Phase 8D sections must eventually close):** actual deployed Worker SHA/routes/bindings/secrets-present 8D.1; comprehensive live public endpoint methods and device auth 8D.2–4; 8D.5 epoch/replay cross-store; 8D.6/7 exact D1→Queue/DO→R2 crash windows; real DLQ replay/exhaustion 8D.9; WS Access/DO alarm/logout/revocation 8D.10; production auth/session/CSRF 8D.11/12; command lifecycle 8D.13; live rate rules 8D.14; Git history/CDN/log secrets 8D.15; full isolated D1+R2+DO destructive restore and rollback P8D-002/8D.16; real retention P8D-014/8D.17; real incident delivery 8D.18; release migration+rollback 8D.19.

**Verdict:** `Phase 8D = IN PROGRESS, NOT PASS`; P0/P1 live proof still missing. Phase 8E/8F not started, Phase 9 OPPO physical field tests later. Keep historical Phase 8C approved APK unchanged. Do not confuse source-level green tests with actual deployed runtime state.


---

## 2026-11-04 Phase 8D P8D-030–037 eight-target execution handoff (verified)

**Last tested executable source/workflow SHA:** `1fd03dd970021532c00f14e0a9a06dcafad8f857`. **All 3 jobs SUCCESS**: [GitHub CI 41822669148](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41822669148). New docs-only commits after that SHA are documentary, not a new executable audit. Exact baseline at start of this turn: `eafaddefb0dd1c0400390ec59ea5169a21fdc1d2`. No Android source/APK modifications or production/Cloudflare mutations.

**Eight work targets completed to source/CI scope (no real Cloudflare):**
1. **8D.13/P8D-030 location control:** terminal command result now cannot be changed or revived by later signed health, expired command excluded; native SQLite RED 41821975972 → GREEN 41822669148.
2. **8D.13/P8D-031 live-track:** completed/expired result immutable, exact command ID, pending TTL and active D1 predicate; RED→GREEN same.
3. **8D.13/P8D-032 Wi-Fi:** only current configured schedule/target and strictly newer attemptedAt accepted; revoked identities barred; RED→GREEN same.
4. **8D.3/.13/P8D-033 capabilities:** profile version and equal-version capturedAt monotonic with atomic revoked gate; RED→GREEN same.
5. **8D.9/P8D-034 Queue:** malformed/null/scalar/truncated/out-of-range/unknown poison ACK safely before R2, with separate strict Queue validator and permissive historical-R2 reader for migration compatibility. RED [41822194342](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41822194342) → GREEN 41822669148.
6. **8D.16/P8D-035:** executed actual `snapshotD1ToR2` (not hand-crafted backup fixture), verified compressed snapshot SHA and all 18 source-backed tables, isolated native SQLite fresh restore, FK, safety row retention and pending command retirement; copied actual generated raw/trusted history objects byte-identically to a synthetic recovery R2 and demonstrated D1-only restore is incomplete. GREEN. **Real Cloudflare D1/R2/DO restore, DO live truth reconstruction, real cutover and rollback still P1 OPEN**.
7. **8D.2/.3/.11/P8D-036:** 41 supported parent route/method combinations denied without production Access in actual bundled Worker; zero D1/DO/R2/Queue/background/rate side effects. GREEN; real Cloudflare auth/ownership/routes still unverified.
8. **8D.15/P8D-037:** rendered prod+dev parent/public asset scanner with positive synthetic control, six actual public artifacts inspected for high-confidence server secret signatures and private-key blocks. GREEN; Git history, real CDN, logs remain UNKNOWN.

**Access blockers explicitly tested, not guessed:** Direct Cloudflare tool not connected. GitHub deployment/environment API endpoints rejected by connector public-endpoint allowlist; branch-protection API returned 403 inaccessible to integration. Do not infer account configuration from source `wrangler.template.jsonc`. Isolated Cloudflare resource and real release rollback drills have NOT occurred.

**Exit gate remains:** Phase 8D IN PROGRESS / NOT PASS, full 19-section PDF acceptance requirements (pp.44–54). Most consequential OPEN: 8D.1 live deployed SHA/bindings, 8D.2 live route inventory, 8D.3 real auth/revoke/family, 8D.6 D1→Queue/DO→R2 crash seams and client retry/ACK, 8D.9 DLQ exhaustion, 8D.10 Access/DO hibernation and session revocation, 8D.13 real command nonce delivery/result, 8D.15 history/CDN secret scan, 8D.16 real full isolated D1+R2+DO restore, 8D.17 Cloudflare R2 lifecycle and legacy paths, 8D.19 migration/rollback. All old source tests MUST NOT be counted as live proof. 8E/8F remain NOT STARTED.

**Next best use of time:** Obtain authorized **read-only** Cloudflare account metadata and actual deployment identity before making more speculative backend changes; run destructive tests only against genuinely isolated pre-production D1/R2/Queue/DO resources. See `PHASE8D_LIVE_ACCEPTANCE_NEXT.md` for exact evidence checklist.
