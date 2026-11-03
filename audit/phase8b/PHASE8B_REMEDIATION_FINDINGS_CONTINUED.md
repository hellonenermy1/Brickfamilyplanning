# Brick V1 — Phase 8B Remediation Findings — Continued

This file continues `PHASE8B_REMEDIATION_FINDINGS.md` from P8B-R007 onward. Same rule applies: finding first, separate fix commit, then successful retest before closure.

## P8B-R007 — Cloud parent-origin regression omits its compiled auth module

**Severity:** P1 HIGH — cloud remediation CI reaches current one-shot Location regression successfully, then stops before SOS/privacy/production bundle checks because the parent-origin harness is invoked without its required module.

**Observed baseline:** `v1-p8b-remediation-cloud` at `457ac5692a775463dcfea9ef3a797023c38226a4`.

**Evidence:** GitHub Actions run `41627088346` passes locked install, typecheck, parent assets, production wiring, all D1 migrations, history codec, Phase 5 live-state ordering and the one-shot Location control regression. `Regression — parent origin protection` then throws `usage: test-phase8-parent-origin.mjs <dev-parent-auth-module>` because the workflow runs the script with no argument. The script imports the supplied module and exercises `devParentOriginAllowed` against same-origin/cross-origin state-changing requests.

**Expected:** the regression must run against compiled `src/dev-parent-auth.ts` and prove same-origin mutation enforcement before later gates execute.

**Required correction:** compile `src/dev-parent-auth.ts` into a temporary ESM module with the locked esbuild toolchain and pass it to `scripts/test-phase8-parent-origin.mjs`.

**Status:** OPEN — finding recorded before CI correction.
