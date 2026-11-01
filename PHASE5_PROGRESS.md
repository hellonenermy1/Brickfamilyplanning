# Brick V1 Phase 5 / 5B Progress

Date: 2026-11-01
Status: **PHASE 5 SOURCE CLOSURE CANDIDATE — FINAL 5B EXACT-PAIR CI IN PROGRESS — NOT ACCEPTED**

Phase 5B is an internal pre-Phase-6 closure checkpoint, not a tenth V1 phase.

## Current exact closure candidate

- Android: `v1-p5b-closure-android` / `a09a273bf19e37e70d37077e3ac0ede6a69b2332`
- Cloud/CI: `v1-p5b-closure-cloud` / `507b17c262e9eb2c135b79b7b5cdf6ffc317b634`
- Draft PR: #14 `V1 Phase 5B — pre-Phase-6 closure`
- Exact-pair CI: run `41295112045`

At this document revision the Cloud cumulative Phase 2-5 regression job is PASS. Android dependency-lock/build/test-APK/lint and full cumulative instrumentation are still executing and must not be called PASS early.

## Source closure completed in 5B

- Fixed GitHub Actions Android SDK/`adb`/AVD plumbing so instrumentation can genuinely boot and execute.
- Added conservative coarse-IP fallback from authenticated Cloudflare request context; it is a short-lived 50 km-class COARSE area and is excluded whenever better current evidence exists.
- Added historical radio-route reranking that may reorder only already-plausible Phase 3 route candidates and cannot move the numerical position or shrink uncertainty by itself.
- Added durable Phase 5 fusion-hypothesis frames through the existing encrypted Phase 2 evidence journal and exact-ACK path.
- Wired backward smoothing end-to-end: trusted endpoints + stored hypotheses produce separate `history/refined/...` runs with deterministic run/model identity while raw and original realtime history remain immutable.
- Completed named learned-place runtime/cache integration and fixed same-family semantics so a validated conservative named-place area replaces, rather than competes with, the smaller generic Atlas interpretation.
- Implemented and tested private Witness Mesh, fixed Ground receiver ingestion, authenticated ranging/future-ranging abstractions, replay/revocation/privacy guards and conservative area semantics already present on the current Phase 5B source line.
- Preserved Phase 2 durability, Phase 3 uncertainty/route rules and Phase 4 Atlas/independence rules through cumulative regressions.

## Real instrumentation failures found and repaired

A prior 5B run successfully executed 117 Android tests and exposed four real/brittle assertions. 113 passed. The four were handled without weakening Brick:

1. learned-place/Atlas same-family selection: fixed a real semantic fusion bug by preferring the conservative named-place interpretation rather than letting a smaller generic Atlas cell win;
2. repeated-visit Atlas trust: replaced a brittle arbitrary numeric threshold with a test that proves repeated trusted visits increase trust and reach `DISTINCTIVE_STATIC`;
3. range annulus: retained the production uncertainty tail and tested that off-ring support is tiny rather than falsely requiring an impossible hard zero;
4. Wi-Fi RTT: strengthened the test so independent context creates plausible Atlas hypotheses and RTT only reranks them while the result remains ambiguous/ESTIMATED.

The final exact candidate above includes these repairs.

## Deliberate non-shortcuts

- No constant active ping workload was added merely to invent a packet-loss/latency metric. Passive network state, validated/captive status, IPv4/IPv6, privacy-reduced DNS and loss/recovery transitions remain the useful low-cost evidence.
- No broad raw SSDP/UPnP/NAS scanning was added without a justified permission/power/privacy case; the authorised Android NSD subset remains the conservative LAN implementation.
- No unvalidated floor/stairs/lift classifier or time-of-day-only location truth was invented.
- Unsupported target hardware/radio capabilities remain `UNSUPPORTED` until real device evidence proves otherwise.
- The old Phase-2-specific Cloudflare production deployment workflow is not being misused to deploy the Phase 5B `worker-v9` staging candidate.

## Remaining gates after automated closure

Even if the final 5B run passes, Phase 2-5 formal acceptance still requires the applicable physical OPPO/ColorOS and controlled deployment/integration evidence. A green emulator does not substitute for target-device radio, sensor, background, reboot, battery and OEM behavior.
