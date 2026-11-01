# Brick V1 Phase 5B — Pre-Phase-6 Closure Report

Date: 2026-11-01
Status: **ASSISTANT-SIDE SOURCE + AUTOMATED CLOSURE PASS / NOT AN OFFICIAL V1 PHASE / NOT PRODUCTION ACCEPTED**

## Purpose

Phase 5B is a closure checkpoint between official Phases 5 and 6. It does not change Brick's fixed nine-phase V1 plan. Its job is to finish every source, hosted-CI and audit task that can be completed without the physical OPPO/ColorOS phone, so Phase 6 does not inherit avoidable technical debt or fake proof.

## Final exact closure candidate

- Android branch: `v1-p5b-closure-android`
- Android SHA: `a09a273bf19e37e70d37077e3ac0ede6a69b2332`
- Android draft PR: #15 `V1 Phase 5B Android — pre-Phase-6 closure`
- Cloud/CI branch: `v1-p5b-closure-cloud`
- Cloud/CI SHA: `507b17c262e9eb2c135b79b7b5cdf6ffc317b634`
- Cloud draft PR: #14 `V1 Phase 5B — pre-Phase-6 closure`
- Exact-pair CI: `41295112045`

Final hosted verification:
- cumulative Phase 2-5 Cloud regressions: **PASS**;
- exact Android checkout, dependency lock, debug APK build, instrumentation APK build, lint and cumulative source guards: **PASS**;
- cumulative Android instrumentation: **PASS — 123/123 tests**;
- final Gradle result: **BUILD SUCCESSFUL**.

The instrumentation log explicitly records `Starting 123 tests` and `Finished 123 tests` on the pinned Android SHA.

## What 5B fixed or completed

### Hosted Android execution

The earlier Phase 5 workflow installed Android platform tools but did not put `adb` on a usable path and created an AVD outside the emulator's search location. 5B now uses explicit `ADB`, `EMULATOR` and `ANDROID_AVD_HOME` paths, verifies the named AVD before boot and successfully runs the full accumulated instrumentation suite.

### Coarse IP last resort

Brick consumes Cloudflare request geolocation only as a short-lived, low-trust coarse area. Device-side fusion applies a conservative 50 km-class floor and `COARSE` upper state. Coarse IP is not mixed into better current motion/Atlas/place/anchor evidence and cannot become building-level location truth.

### Historical radio-route prior

Current environmental context can reorder only route candidates that Phase 3 already considers plausible. Historical frequency alone cannot create a route or move the numerical position. The matcher is metadata-only and cannot directly shrink position uncertainty.

### Durable hypotheses and refined history

Phase 5 degraded fusion frames are recorded through the existing encrypted Phase 2 evidence journal and exact-ACK transport. The Cloud stores hypothesis frames separately, waits for trustworthy precise/assisted endpoints around a degraded interval, performs endpoint reranking, and writes results to a separate `history/refined/...` namespace with deterministic run/model identity. Raw observations and the original realtime estimate remain immutable.

### Learned-place semantics

Learned place definitions are owner-bound and encrypted on the child. A valid named place and its generic Atlas source share one independence group. 5B fixed a semantic-selection bug where a smaller generic Atlas cell could previously beat the safer named-place area. The named semantic interpretation now replaces the duplicate generic hypothesis rather than double-voting or losing to false precision.

### Witness, Ground and ranging

The current Phase 5 source line contains private rotating Witness identifiers, authorisation/revocation/freshness controls, conservative witness-area uncertainty, signed Ground receiver sightings, receiver-area rather than fake-range semantics, authenticated range constraints, and future-ranging capability abstractions. Unsupported target hardware remains `UNSUPPORTED` until measured on the real device.

## Real Android failure-driven hardening

A prior 5B emulator run genuinely executed 117 tests. 113 passed and four failed. 5B did not hide or bypass them:

1. **Learned place:** real fusion semantic-selection bug fixed; conservative named-place interpretation wins within the shared Atlas independence family.
2. **Atlas repeated visits:** brittle arbitrary trust threshold replaced with proof that trusted repeat visits increase trust and reach `DISTINCTIVE_STATIC`; production trust weights were not inflated.
3. **Range annulus:** test now accepts the deliberate tiny uncertainty tail outside the ring and proves the measured annulus scores vastly higher; production uncertainty was not hard-clipped.
4. **Wi-Fi RTT:** test strengthened so independent environmental evidence creates plausible nearby hypotheses and RTT only reranks them. The result remains ambiguous/`ESTIMATED`, never a made-up precise point or direction.

The final exact Android SHA contains all four repairs and the 123-test cumulative suite passes.

## Deliberate partials kept honest

5B deliberately does not add features that would make Brick worse merely to fill a checklist:

- no constant active pings for a fake always-on latency/packet-loss metric;
- no broad raw SSDP/UPnP/NAS probing without a justified permission/power/privacy case;
- no unvalidated stairs/lift/corridor/floor classifier;
- no time-of-day-only location truth;
- no assumption that RTT/UWB/Bluetooth Channel Sounding/NAN RTT is supported merely because an API exists;
- no production deployment of the Phase 5B `worker-v9` candidate through the old Phase-2-specific deployment workflow.

## What the green 5B result means

Run `41295112045` proves the latest integrated Phase 2-5 source passes the cumulative Cloud gate, Android dependency/build/lint gates and full emulator instrumentation on one exact pinned pair. This closes the known assistant-side source and hosted automated loose ends for Phases 2-5.

It does **not** mean Phases 2-5 are formally accepted or Brick is production-ready. Physical OPPO/ColorOS behavior, real radios/sensors/background/reboot/endurance behavior, multi-device Witness/Ground cases where applicable, and controlled deployed-cloud checks remain separate evidence layers.

## Phase 6 start rule

Phase 6 may now begin cleanly from this exact 5B baseline without pretending the physical-device gates have already happened. Formal V1 acceptance continues to respect the dependency and device-verification chain.
