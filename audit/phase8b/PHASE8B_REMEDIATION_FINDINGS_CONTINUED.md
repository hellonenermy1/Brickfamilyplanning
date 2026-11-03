# Brick V1 — Phase 8B Remediation Findings — Continued

This file continues `PHASE8B_REMEDIATION_FINDINGS.md` from P8B-R007 onward. Same rule applies: finding first, separate fix commit, then successful retest before closure.

## P8B-R007 — Cloud parent-origin regression omits its compiled auth module

**Severity:** P1 HIGH — cloud remediation CI reaches current one-shot Location regression successfully, then stops before SOS/privacy/production bundle checks because the parent-origin harness is invoked without its required module.

**Observed baseline:** `v1-p8b-remediation-cloud` at `457ac5692a775463dcfea9ef3a797023c38226a4`.

**Evidence:** GitHub Actions run `41627088346` passes locked install, typecheck, parent assets, production wiring, all D1 migrations, history codec, Phase 5 live-state ordering and the one-shot Location control regression. `Regression — parent origin protection` then throws `usage: test-phase8-parent-origin.mjs <dev-parent-auth-module>` because the workflow runs the script with no argument. The script imports the supplied module and exercises `devParentOriginAllowed` against same-origin/cross-origin state-changing requests.

**Expected:** the regression must run against compiled `src/dev-parent-auth.ts` and prove same-origin mutation enforcement before later gates execute.

**Required correction:** compile `src/dev-parent-auth.ts` into a temporary ESM module with the locked esbuild toolchain and pass it to `scripts/test-phase8-parent-origin.mjs`.

**Status:** OPEN — finding recorded before CI correction.

---

## P8B-R008 — Cloud Wrangler dry-run relocates config and breaks relative production entrypoint resolution

**Severity:** P1 HIGH — all deterministic cloud regressions now pass, but the production bundle dry-run is invalidated by CI setup and cannot prove the selected Worker entry bundles.

**Observed baseline:** `v1-p8b-remediation-cloud` at `ace0b46196bcb7ab5ab951c86b9bc6fad44cb049`.

**Evidence:** GitHub Actions run `41627328570` passes typecheck, parent assets, production wiring, all migrations, history codec, live-state ordering, one-shot Location, same-origin mutation, SOS priority and privacy audit. The Wrangler dry-run copies `wrangler.template.jsonc` to `/tmp/wrangler-p8b.jsonc`; Wrangler resolves the relative `main: src/worker-p8b.ts` from the relocated config directory and fails with `The entry-point file at "src/worker-p8b.ts" was not found.` The source entry exists in the checked-out repository and already passed the preceding production wiring check.

**Expected:** the dry-run must use a generated config in repository context so all relative production paths resolve exactly as deployment would, while still replacing only CI placeholder values.

**Required correction:** create the temporary generated config in the repository root (or otherwise preserve config-relative resolution), run `wrangler deploy --dry-run`, verify bundle output, then remove the generated config.

**Status:** OPEN — finding recorded before CI correction.
