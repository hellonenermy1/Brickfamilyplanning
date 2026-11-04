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