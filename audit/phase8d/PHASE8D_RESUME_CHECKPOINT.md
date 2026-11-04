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
