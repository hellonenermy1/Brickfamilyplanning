# Brick V1 — Phase 8B Fake / Dead / Wiring / Production-Config Audit

## Status

**COMPLETE for Phase 8B source/config scope**

This pass asks a different question from normal feature counting: could a file/class/UI card/test make Brick look implemented while the production path is absent, stale or unreachable?

## 1. Production entrypoints

### Android

The current Android head has real production-reachable application/service/receiver paths. Core tracking, journals, safety, Atlas, fusion and Witness are not merely orphan classes.

However, the same manifest also exposes `DiagnosticsActivity` as a second MAIN/LAUNCHER activity. That old hardening/beta surface is therefore **reachable**, not dead code. Its reachability is a defect because the current V1 maintenance contract requires the hidden local Maintenance Console instead.

### Cloud

Production `wrangler.template.jsonc` points to `src/worker-v9.ts`.

`worker-v9.ts` composes the production hardening layers and is the production worker baseline for this audit.

`worker-v10.ts` is the card-free development/PIN runtime wrapper. It is not selected by the production template, so Phase 8B does **not** accidentally grade v10 as deployed production behavior.

Verdict: versioned workers are not automatically dead code; v9 is production, v10 is intentionally development-only.

## 2. Legacy code that is real but semantically stale

The old beta retirement flow is real and reachable:

`ACTIVE -> DISARMED -> MANAGEMENT_RELEASED -> UNINSTALL_REQUESTED`.

It is not a placeholder. It performs meaningful fail-closed actions and Device Owner release/uninstall handoff.

But it is **semantically stale** versus the frozen V1 contract requiring Maintenance Console + Deep Off + Policy Ledger + five-stage deprovisioner. It therefore receives PARTIAL/MISSING verdicts rather than fake credit.

Similarly, the old persistent Location desired-state model is real code and is wired Android-to-cloud-to-portal. Its problem is not reachability; its problem is that it now implements the **wrong current semantics** after the 8A one-shot amendment. Those rows are classified BROKEN rather than MISSING.

## 3. Core feature wiring check

The following families were verified to have real reachable wiring rather than file-name-only presence:

- tracking service -> activity/motion/GNSS/PositionEngine;
- local durable Journal -> signed network delivery -> exact ACK deletion;
- safety outbox -> safety dispatcher -> backend event path;
- Phase 3 positioning engines invoked from PositionEngine;
- Atlas controller started from tracking service;
- isolated evidence providers -> sampling coordinator -> durable Evidence Journal;
- Evidence Journal -> EvidenceDispatcher -> backend evidence path;
- Phase 5 fusion invoked from PositionEngine/fusion adapter;
- Witness BLE provider started by Atlas/evidence runtime and emits private rotating-ID evidence;
- backend signed location ingest -> D1/Queue/DO current state;
- Durable Object -> WebSocket parent live state;
- parent worker v9 -> hardened parent-v8 UI layers.

These families receive `IMPLEMENTED — UNVERIFIED`, not automatic PASS.

## 4. Missing-feature false-positive check

The full current Android source tree plus current production cloud tree/entrypoints were checked for the newly frozen feature families.

No current production implementation path was found for:

- scheduled one-shot Wi-Fi control (`WIFICTL-*`);
- fall inference + Emergency Evidence Bundle (`SAFE-007..018` except forbidden SAFE-013);
- approved hidden Maintenance & Recovery Console (`MAINT-001..006`);
- provenance-aware reversible Deep Off (`DEEPOFF-*`);
- complete Policy Ledger/five-stage deprovisioner (`DEPROV-*`, partial legacy flow only);
- parent-to-phone Live Track activation/control path;
- end-to-end Fast Live stage latency instrumentation;
- OneMap primary/auth/token/rate/cache provider boundary (`ONEMAP-*`);
- screen-time collection/sync/portal;
- automatic commute summaries;
- explicit daily synthetic canary/retest subsystem;
- Android parent/guardian role and role migration;
- post-enrolment device rename API/UI.

These are not credited because adjacent files or permissions exist. Example: the manifest's Wi-Fi permission does not count as scheduled Wi-Fi implementation.

## 5. UI-only / backend-only mismatch checks

### Location control

Android actuator, backend desired-state table/API and parent UI all exist. This is not UI-only, but all three retain the stale persistent desired-state model. Classified BROKEN/PARTIAL via P8B-006.

### Map

MapLibre/private PMTiles map and local place resolver are real. They do not count as OneMap implementation merely because they satisfy an older map design. Current OneMap requirements remain MISSING/PARTIAL.

### Live map

WebSocket/DO current state and a `/location/live` preview endpoint are real. They do not count as a compliant dedicated Fast Live path because the normal accepted-fix flow still places Queue/D1 work ahead of DO current-state advancement and the phone only uses preview selectively under backlog.

## 6. Hard-coded/simulated success audit

No inspected critical live path was credited solely from a hard-coded success constant or display label.

Notable positive examples:

- Device Owner Location command verifies resulting Android state.
- Shizuku `setLocationEnabled` verifies resulting state.
- pairing consumes a real one-time token and creates a real opaque device ID.
- evidence delivery requires exact ACK tuples before journal deletion.
- Durable Object broadcasts stored current state rather than a fake UI value.
- parent freshness layer computes state from actual timestamps/data.

Where a requirement lacks the actual path, it is classified MISSING instead of accepting a UI label/config flag.

## 7. Shizuku generic-shell negative check

The Shizuku UserService does execute fixed shell command families internally, but its AIDL surface exposes typed fixed operations only. `runFixed()` is private and normal Brick callers cannot submit arbitrary shell text.

Examples are fixed command families such as:

- `cmd location ...`
- `cmd deviceidle ...`
- `cmd appops ...`

This supports the frozen prohibition against a generic remote shell. Later 8C must recheck exported/binder/package attack surface.

## 8. Production configuration mismatch

The largest production-config mismatch is explicit rather than hidden:

- Android manifest: `android:testOnly="true"`;
- Android version: `0.8.0-phase8-beta1-test`;
- beta runtime enabled with expiry/retirement logic;
- cloud production template's `CURRENT_APP_VERSION` still points to the beta/test version;
- Android and cloud newest implementations live on separate branch heads.

Therefore a large amount of real functionality exists, but the current baseline is **not yet a single production release candidate identity**.

## 9. Test-only / dev-only separation

Positive separation:

- cloud `worker-v10.ts` is development-only and not production-selected;
- Android has substantial `androidTest` coverage and successful exact-head GitHub Actions;
- permanent public signing identity exists and private signing material is not committed.

Weaknesses:

- Android production candidate itself is still testOnly/beta;
- diagnostic/beta management UI is in the main manifest as a launcher;
- no ordinary `app/src/test` JVM unit-test tree exists;
- cloud package has no generic `npm test` target and relies on workflow/script validation.

## 10. Forbidden feature check

All 24 current forbidden requirements are absent from the inspected intended production source/config. In particular no current intended path was found for:

- public Find-My/crowdsourced radio network;
- camera/microphone/EXIF localization;
- root/custom-ROM requirement;
- arbitrary Shizuku shell API;
- family-car tracking;
- unrelated ad/analytics SDK;
- automatic emergency dispatch from fall inference;
- fake exact inertial/network/AI precision.

This source/config negative check must be repeated against built APK/deployed network behavior in later phases.

## Phase 8B fake/dead verdict

The project is **not** a mostly fake shell. Its core tracking, durable data, Atlas/fusion, Witness, backend and parent foundations are genuine and substantially wired.

The main implementation-reality problem is different: the frozen V1 contract moved ahead of the current implementation in several important areas, while some older beta semantics remain reachable in production-facing source.

**FAKE/DEAD/WIRING AUDIT: COMPLETE**
