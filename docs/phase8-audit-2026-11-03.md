# Brick V1 — Phase 8 Cloud Audit — 2026-11-03

Status: **REQUALIFICATION RUNNING**.

This audit re-checks the cloud branch independently of earlier closure wording.

Hardening added during this audit:

- pinned OSV vulnerability scan of the resolved `package-lock.json`, including build/deploy dependencies;
- production deployment runner pinned to Ubuntu 24.04;
- Cloudflare API token removed from job-wide environment and scoped only to credential preflight, setup, map installation, strict deployment and deployed-resource verification;
- production release audit upgraded from `npm audit --omit=dev` to all locked dependencies;
- tracked private-key material is rejected by the deployment workflow and ignored by Git.

Still requiring executed external evidence before formal Phase 8 closure:

- a real `Deploy Brick V1 Phase 8 Candidate` workflow run from `v1-p8-cloud-hardening` against the intended Cloudflare account;
- resulting schema-015 migration/resource/Access/deployment verification evidence;
- real Cloudflare operation/storage measurements;
- a real destructive restore rehearsal against an isolated disposable Cloudflare D1 target.

Local CI/contract tests are not substitutes for those live Cloudflare acceptance items.
