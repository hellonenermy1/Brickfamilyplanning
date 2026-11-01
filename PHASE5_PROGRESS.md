# Brick V1 Phase 5 / 5B Progress

Date: 2026-11-01
Status: **PHASE 5B ASSISTANT-SIDE SOURCE + AUTOMATED CLOSURE PASS — PHASE 5 NOT FORMALLY ACCEPTED**

Phase 5B is an internal pre-Phase-6 closure checkpoint, not a tenth V1 phase.

## Final exact closure candidate

- Android: `v1-p5b-closure-android` / `a09a273bf19e37e70d37077e3ac0ede6a69b2332`
- Cloud/CI: `v1-p5b-closure-cloud` / `507b17c262e9eb2c135b79b7b5cdf6ffc317b634`
- Cloud draft PR: #14 `V1 Phase 5B — pre-Phase-6 closure`
- Android draft PR: #15 `V1 Phase 5B Android — pre-Phase-6 closure`
- Exact-pair CI: run `41295112045`

## Final hosted proof

All jobs passed on the exact pair above:

- cumulative Phase 2-5 Cloud regressions — **PASS**;
- Android exact checkout + dependency lock — **PASS**;
- Android debug APK + instrumentation APK build + lint — **PASS**;
- cumulative Phase 2-5 source guards — **PASS**;
- full cumulative Android instrumentation — **PASS, 123/123 tests**.

Final instrumentation log records `Starting 123 tests`, `Finished 123 tests`, then `BUILD SUCCESSFUL`.

## Source closure completed in 5B

- Fixed GitHub Actions Android SDK/`adb`/AVD plumbing so instrumentation genuinely boots and executes.
- Added conservative coarse-IP fallback from authenticated Cloudflare request context; short-lived, 50 km-class COARSE area, excluded whenever better current evidence exists.
- Added historical radio-route reranking that may reorder only already-plausible Phase 3 route candidates and cannot move the numerical position or shrink uncertainty by itself.
- Added durable Phase 5 fusion-hypothesis frames through the existing encrypted Phase 2 evidence journal and exact-ACK path.
- Wired backward smoothing end-to-end: trusted endpoints + stored hypotheses produce separate `history/refined/...` runs with deterministic run/model identity while raw and original realtime history remain immutable.
- Completed named learned-place runtime/cache integration and fixed same-family semantics so a validated conservative named-place area replaces, rather than competes with, the smaller generic Atlas interpretation.
- Retained private Witness Mesh, Ground receiver security/area semantics, authenticated ranging/future-ranging capability abstractions, replay/revocation/privacy guards and conservative uncertainty behavior.
- Preserved Phase 2 durability, Phase 3 uncertainty/route rules and Phase 4 Atlas/independence rules through cumulative regressions.

## Failure-driven hardening

A prior 5B run genuinely executed 117 Android tests: 113 passed and four failed. 5B did not hide them.

1. Learned-place/Atlas same-family selection — fixed a real semantic fusion bug by preferring the conservative named-place interpretation instead of a smaller duplicate Atlas cell.
2. Repeated-visit Atlas trust — replaced a brittle arbitrary threshold with a test proving repeat trusted visits increase trust and reach `DISTINCTIVE_STATIC`; production trust was not inflated.
3. Range annulus — retained the deliberate uncertainty tail and tested that off-ring support is tiny rather than falsely requiring a hard zero.
4. Wi-Fi RTT — strengthened the test so RTT only reranks already-plausible nearby Atlas hypotheses and the result remains ambiguous/ESTIMATED rather than manufacturing precision or direction.

The final 123-test exact-pair run passes all of these.

## Deliberate non-shortcuts

- No constant active ping workload merely to invent packet-loss/latency metrics.
- No broad raw SSDP/UPnP/NAS scanning without a justified permission/power/privacy case.
- No unvalidated floor/stairs/lift classifier or time-of-day-only location truth.
- Unsupported target hardware/radio capabilities remain `UNSUPPORTED` until real device evidence proves otherwise.
- The old Phase-2-specific production deployment workflow is not misused to deploy the Phase 5B `worker-v9` staging candidate.

## What remains

There are no known assistant-side Phase 2-5 source/hosted-CI loose ends left from 5B.

Formal Phase 2-5 acceptance still requires the applicable physical OPPO/ColorOS, real-radio/multi-device and controlled deployed-cloud/integration evidence. Emulator CI cannot substitute for target-device background, reboot, sensor, battery, OEM or real-radio behavior.

Phase 6 may start from this exact 5B baseline without pretending those physical acceptance gates have already passed.
