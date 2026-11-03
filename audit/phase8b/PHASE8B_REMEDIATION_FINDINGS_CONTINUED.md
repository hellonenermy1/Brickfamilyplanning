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

---

## P8B-R009 — Cloud placeholder scan has broken shell quoting and cannot execute

**Severity:** P2 MEDIUM — the production Worker now dry-runs successfully, but the final fake/placeholder source scan fails in the shell parser instead of inspecting source.

**Observed baseline:** `v1-p8b-remediation-cloud` at `c0c6bcb1b68f684b23cde5e035924ce065031aea`.

**Evidence:** GitHub Actions run `41627528964` passes install, typecheck, parent assets, production wiring, all migrations, every deterministic regression, privacy audit, and Wrangler production bundle dry-run. The final `No production placeholders or obvious fake handlers` step exits with shell error `unexpected EOF while looking for matching` quote because the YAML/bash command nests single- and double-quote fragments inside one extended-regex literal.

**Expected:** the final source scan must actually inspect `src` and `web` for unresolved TODO/NotImplemented/placeholder/hardcoded-success markers and fail only when a real prohibited marker is found.

**Required correction:** replace the fragile compound shell-quoted regex with a small deterministic Node source-scan script or equivalently quote-safe checks; keep the same prohibited marker intent.

**Status:** OPEN — finding recorded before CI correction.

---

## P8B-R010 — Fall pipeline violates LOW-only-local semantics and emergency evidence is incomplete

**Severity:** P1 HIGH — the frozen safety contract is source-level incomplete even though Android/cloud compile and CI gates are green.

**Observed baseline:** Android `710fad287ad9088b1c275ee19abff4bb4a9b5160`, cloud `3e58c33104e04831446b08ab58e7cf5757bb6b32`.

**Evidence:** `FallDetectorRuntime.evaluateCandidate()` calls `SafetyDispatcher.enqueue(..., "fall_detected", ...)` for LOW, MEDIUM and HIGH confidence; LOW therefore leaves the phone and enters the durable cloud safety pipeline. The frozen SAFE contract requires LOW to log locally without parent spam. The emitted detail currently contains impact/gyro/post-impact-motion/activity aggregates, while the frozen emergency evidence bundle also requires available accepted/raw position quality, speed/mode, motion context, GNSS quality, connectivity/power and repair/health context. `SafetyDispatcher` enriches battery/current position but not the remaining available evidence classes.

**Expected:** LOW stays local-only; MEDIUM/HIGH may enter the durable safety pipeline according to policy. HIGH is critical. The event detail must carry a privacy-minimized bounded emergency evidence summary from already-available Brick state, never raw indefinite sensor streams, mic or camera.

**Required correction:** make LOW diagnostic-only; enrich MEDIUM/HIGH with bounded motion/activity, position age/quality, speed/mode where available, GNSS/provider/connectivity/power/recovery health summaries; preserve durable offline outbox/ACK and critical priority for HIGH.

**Status:** OPEN — finding recorded before fix.

---

## P8B-R011 — Deep Off does not fully quiesce process-local work and restoration can overwrite a later component-state change

**Severity:** P1 HIGH — source does not yet satisfy the frozen Deep Off stop-all-work/provenance rule.

**Observed baseline:** Android `710fad287ad9088b1c275ee19abff4bb4a9b5160`.

**Evidence:** `DeepOffManager.quiesce()` stops `BrickLocationService`, cancels `RecoveryScheduler`/Wi-Fi work and disables the service component, but does not stop the already-running `FallDetectorRuntime` or `DiagnosticMonitor` started by `BrickApplication`. `reactivate()` unconditionally restores the snapshotted service component state instead of first verifying that the current component state still equals the value Brick itself applied during Deep Off; a later external/user/system change could therefore be overwritten.

**Expected:** entering Deep Off halts all Brick active runtime work that can continue in-process, survives reboot, never auto-reactivates, and restores a Brick-caused temporary state only if that state has not been superseded since Brick applied it.

**Required correction:** add explicit process-runtime quiesce/restart hooks for fall monitoring and diagnostic sampling, persist the Brick-applied component state in the snapshot, and restore the original component state only when current state still equals Brick's Deep Off value.

**Status:** OPEN — finding recorded before fix.

---

## P8B-R012 — Android ordinary JVM unit-test source set is still absent

**Severity:** P2 MEDIUM — CI invokes `testDebugUnitTest`, but there is no `app/src/test` source tree, so the task does not provide meaningful local JVM regression coverage.

**Observed baseline:** Android `710fad287ad9088b1c275ee19abff4bb4a9b5160`.

**Evidence:** the repository tree contains instrumentation tests under `app/src/androidTest` but no `app/src/test`. `app/build.gradle.kts` has `androidTestImplementation` only and no ordinary unit-test dependency. A passing empty unit-test Gradle task is not evidence for the pure logic introduced by 8B.

**Expected:** at least the pure, deterministic safety/control state-machine logic added for 8B has ordinary JVM tests that run in CI.

**Required correction:** add locked JUnit dependency and focused JVM tests for the pure hidden-maintenance entry state machine (including invalid-sequence reset, exact seven taps + >=10s wait + final tap, and armed-window expiry), then keep `testDebugUnitTest` in the full Android gate.

**Status:** OPEN — finding recorded before fix.

---

## P8B-R013 — OneMap reverse-geocode path can still follow Live Track cadence while moving

**Severity:** P1 HIGH — ONEMAP-006 requires enrichment coalescing so approximately 2-second Live Track updates cannot create approximately 2-second reverse-geocode provider calls.

**Observed baseline:** cloud `3e58c33104e04831446b08ab58e7cf5757bb6b32`.

**Evidence:** `web/brick-map-p8b.ts` calls `/parent/api/onemap/reverse` for each `resolveBrickPlace(lon,lat)`. Backend caching uses a key rounded to five decimals (roughly metre-scale). A moving device can therefore produce a new cache key on each ~2-second location update, and `reverseOneMap()` has no minimum enrichment cadence/coalescing guard beyond the broad 240-calls/min provider ceiling.

**Expected:** provider enrichment is spatially/temporally coalesced independently from Fast Live rendering; coordinates/current marker render immediately while reverse geocoding runs at a bounded slower cadence and stale responses cannot overwrite a newer point.

**Required correction:** add a bounded browser-side reverse-geocode coalescer/cache keyed to movement/time and stale-request generation, while retaining backend cache/rate limits and private fallback.

**Status:** OPEN — finding recorded before fix.
