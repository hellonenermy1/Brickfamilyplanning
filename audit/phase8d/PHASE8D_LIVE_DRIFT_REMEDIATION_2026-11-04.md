# Brick V1 Phase 8D — 2026-11-04 live Cloudflare drift remediation and release constraints

**SOURCE OF AUTHORITY:** Approved Brick V1 Phase 8 plan §8D.1–8D.19 and existing execution matrix. **Audit branch:** `v1-p8d-backend-deep-audit`. **Status:** IN PROGRESS / NOT PASS. This is an evidence-based remediation runbook, not authorization to circumvent the Phase 8D final PASS release gate.

## Confirmed Cloudflare read-only evidence, not inferred

Most recent full seven-part live metadata attempt [41835091894](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41835091894) had a **successful synthetic audit job**, **failed LIVE account job**, seven checks as follows:

1. **8D.1 Production version provenance — BLOCKED:** Active deployment exists; active version metadata did not expose a verifiable Git SHA annotation. The original audit incorrectly used deployment-object annotations; fixed P8D-038 to inspect the active Worker **version** and refuse to invent SHA. No evidence the deployed code is defective from missing annotations alone.
2. **8D.1 Development version provenance — BLOCKED:** Same issue, even though the original naive checker had called its deployment tagged. Corrected to unknown, not an arbitrary PASS.
3. **8D.1/.6/.9/.14 Production binding drift — CONFIRMED:** Cloudflare Worker settings are missing seven named bindings expected by current `wrangler.template.jsonc`: `HISTORY`, `MAPS`, `EVENTS`, `PARENT_HISTORY_RATE`, `PARENT_WS_RATE`, `PARENT_GEOCODE_RATE`, `PARENT_COMMUTE_RATE`. Static source config declares all. Deploying the new Worker without preparing bindings/Queues/R2 would hard-fail protected routes or ingestion. Do not deploy blindly.
4. **8D.1/.14 Development binding drift — CONFIRMED:** Worker settings missing `PARENT_GEOCODE_RATE` and `PARENT_COMMUTE_RATE`; D1 dev/prod isolation is separately checked in source and live API. Development deployment workflow had also been locked to extinct Phase 6C branch and obsolete PIN check; see P8D-042.
5. **8D.9 Queue/DLQ — CONFIRMED NOT VISIBLE under current account's paginated Queue list:** Expected `brick-family-v1-events` and `brick-family-v1-dlq` absent after paged GET with scoped token. This does not establish any history/data loss or that queues were never created in another account. Do not create until target account and intended consumption/storage are confirmed.
6. **8D.16/.17 R2 lifecycle — BLOCKED (HTTP 401/403 in read-only audit):** Token lacks access to one or more R2 metadata GETs. Bucket existence/lifecycle cannot be marked missing or correct.
7. **8D.10/.11 Cloudflare Access — BLOCKED (HTTP 401/403 in read-only audit):** Token lacks permission to list Access apps. Access policy/JWT/parent WS are not certified.

**Read-only audit remediation implementation:** P8D-038 corrected Worker **version** annotations and Cloudflare Queue pagination (20-page bounded GET-only); exact source/model tests included. P8D-040 added source config parity tests; P8D-041 wrote a 7-target nonmutating remediation action planner with strict fail-closed evidence checks and a separate workflow artifact; P8D-042 repaired the **manual-only development** deployment workflow for current audit branch, high-entropy `BRICK_DEV_PARENT_ACCESS_TOKEN` secret, required new rate bindings and D1 isolation. [Strict source CI 41835676509](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41835676509) **ALL 3 jobs PASS**, including existing regressions. No production deployment, Cloudflare account mutation, device/APK/Android or user-data changes were performed.

## Ordered fix procedure (minimum six independently verified acceptance operations)

**A — R2/Access least-privilege permission repair (blocked until token owner acts):**
Cloudflare API token `CLOUDFLARE_AUDIT_READ_TOKEN` needs Account **Workers R2 Storage Read** (bucket metadata/lifecycle) and **Access: Apps and Policies Read** (Access application metadata), restricted to correct account. Do not grant Write, rotate production deployment token, share tokens in chat or place secrets in Git. After updating token, rerun seven-part GET-only audit and verify no permission blocker.

**B — Verify actual version provenance without guessed SHA:**
Record active production and development *deployment ID + active version ID + traffic split*, then compare tag/message on active version with known Git SHA. Untagged old versions remain `UNKNOWN`; no fabricated source match. Cross-check actual Worker entry/route and current binding inventory. Do not assume latest Git branch is deployed.

**C — Restore REAL isolated Queue/DLQ safety chain, not by blind production switch:**
Confirm account inventory and required queues/consumers. Provision only under explicit approved staged production or **separate synthetic isolated test** plan. Verify `EVENTS` producer, delivery retries, poison message behavior, DLQ, R2 raw/trusted conditional merge, SOS persistence, D1→Queue crash and no false ACK. Set bounded retry and safe alerting. All history/alerts acceptance remains OPEN until this works on Cloudflare.

**D — Qualify DEVELOPMENT only before production:**
`.github/workflows/deploy-brick-development.yml` is updated for manual Phase 8D development deployment. It uses the existing deployment token **only when manually dispatched**, requires a separate high-entropy secret `BRICK_DEV_PARENT_ACCESS_TOKEN`, checks development D1 and absence of production R2/Queues, uses `setup:development` (no production setup), and validates actual parent/forged session denial. No deployment has been executed in this audit round; the dev/live missing rate bindings remain real until independently verified on deployed development Worker.

**E — Full backup and identity-safe migration rehearsal:**
Before production resource changes, complete **real isolated** D1 + R2 + Durable Object disaster recovery to migrated schema 018 with object inventory/hash, pending command expiry, revoked identity immutability, no cross-family contamination; perform failed schema migration and rollback drill. Source-only native SQLite restoration (P8D-035) does not count as this.

**F — Access and parent WS verification:**
After access-token permissions allow reading policy, validate `/parent*` application, exact audience/issuer/team, allow/exclude/require and real valid/invalid identities. Using synthetic test parents: verify WS upgrades, logout/revoke/expiry/hibernation, parent child selection and cross-family isolation. A Cloudflare Access app appearing in a list is not enough.

**G — Production release only after final Phase8D acceptance:**
`.github/workflows/deploy-brick.yml` intentionally requires **`v1-p8d-accepted-backend`** plus `PHASE8D_FINAL_ACCEPTANCE.md` containing FINAL STATUS: PASS; the accepted release branch was not present in the 100-branch read during this run. Do not weaken this gate or trigger `npm run setup` on the audit branch (it can modify live D1 identities, migrate schema and recreate resources). Once required live evidence has passed and safe backup/rollback exists, use exact-SHA tag, complete source bindings/Queues/R2, smoke checks, and guarded rollback.

## Explicit remaining limitations

No Cloudflare R2/Access read privilege, no real isolated destructive restore, no actual Queue failure injection, no live API/WS child/family security proof, no production migration/rollback. **Phase8D not PASS, Phase8E/8F not authorized.** The limited real metadata audit is useful progress, not readiness to depend on current production for safety-critical tracking.
