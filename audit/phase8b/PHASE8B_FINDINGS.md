# Brick V1 — Phase 8B Findings

Phase 8B status: **IN PROGRESS**

Finding severities:

- P0 CRITICAL — compromise/false safety/SOS loss/serious privacy/unrecoverable history corruption
- P1 HIGH — major reliability/security/correctness or required function absent/broken
- P2 MEDIUM — real defect/significant inefficiency with bounded impact
- P3 LOW — minor defect/cleanup
- INFO — observation/non-blocking debt

A finding is not closed merely by saying "fixed"; later closure needs exact fix commit + regression evidence + retest.

---

## P8B-001 — Android implementation is still an explicit disposable test/beta build

**Severity:** P1 HIGH

**Requirements impacted:** production/release identity and final APK requirements (`OPS-*`, `GOV-007..009`, applicable `PLT`/CUI release requirements)

**Expected:** source/config capable of producing the V1 release candidate without test-only/beta-expiry semantics being the normal production contract.

**Actual:** current Android manifest sets `android:testOnly="true"`; Gradle version is `0.8.0-phase8-beta1-test`, `BRICK_BETA=true`, and the runtime has automatic beta expiry/retirement behavior.

**Evidence:** `app/src/main/AndroidManifest.xml`; `app/build.gradle.kts`; `BetaSafety.kt` at Android head `3de76dc...`.

**Impact:** current Android head cannot be classified as the final production V1 implementation configuration. Successful hardening tests remain useful but do not close production release requirements.

**Required fix:** create/freeze the production/release build configuration with testOnly disabled, production version/channel semantics, permanent signing identity and no disposable-beta expiry behavior in normal production runtime, while keeping a separate safe test build if needed.

**Status:** OPEN

---

## P8B-002 — Hardening diagnostics/Device Owner retirement is directly exposed as a second launcher activity

**Severity:** P1 HIGH

**Requirements impacted:** `CUI-001..006`, `MAINT-001..003`, `DEPROV-*`, security/maintenance boundary requirements.

**Expected:** normal child UI remains minimal. Maintenance & Recovery Console is local-only and reached through the approved hidden sequence (7 logo taps -> wait >=10 s -> one further tap in the armed window); invalid sequences reset silently.

**Actual:** `DiagnosticsActivity` is `exported=true` and has its own MAIN/LAUNCHER intent filter. It visibly presents `BRICK PHASE 8 HARDENING BETA`, diagnostics export, Stage 1 Disarm, Stage 2 Release Device Management, Stage 3 Uninstall, and emergency Device Owner release.

**Impact:** internal maintenance/destructive management controls are directly discoverable from the launcher and the child surface is not the frozen V1 maintenance/child UX.

**Required fix:** remove diagnostics as a normal launcher surface; implement the approved hidden local maintenance entry; scope exported state/intent surface safely; preserve an explicit test-only harness only in a non-production variant.

**Status:** OPEN

---

## P8B-003 — Current Maintenance & Recovery Console contract is missing

**Severity:** P1 HIGH

**Requirements impacted:** `MAINT-001..007`

**Expected:** local Maintenance & Recovery Console with exact hidden-entry sequence, truthful System State Timeline, one-shot maintenance actions preserving later user override, capability-gated radio actions, privacy-reduced diagnostic export.

**Actual:** current Android source has the old hardening `DiagnosticsActivity`/test-session UI. `MainActivity` contains no approved hidden entry sequence. Existing diagnostics are not equivalent to the current Maintenance Console contract.

**Required fix:** implement and wire `MAINT-001..007` in the production Android path, with tests proving entry-state machine, truth sources, privacy reduction and child/user override semantics.

**Status:** OPEN

---

## P8B-004 — Provenance-aware Deep Off is not implemented

**Severity:** P1 HIGH

**Requirements impacted:** `DEEPOFF-001..005`

**Expected:** durable state snapshot + provenance, full Brick quiescence, reboot/day-long-power-off persistence, no automatic reactivation, and restoration only of Brick-caused changes not superseded later by user/system action.

**Actual:** `BetaSafety` has a monotonic beta-retirement `ACTIVE -> DISARMED -> MANAGEMENT_RELEASED -> UNINSTALL_REQUESTED`. DISARMED permanently blocks normal runtime. There is no current Deep Off snapshot/provenance/reactivation path.

**Required fix:** implement a distinct production Deep Off state with provenance-aware reversible restoration; keep final retirement/deprovisioning separate.

**Status:** OPEN

---

## P8B-005 — Five-stage deprovisioner / Policy Ledger contract is only partially represented by old three-stage retirement

**Severity:** P1 HIGH

**Requirements impacted:** `DEPROV-001..005`

**Expected:** `AUTHORISE/FREEZE -> QUIESCE -> UNDO DEVICE MANAGEMENT -> PURGE BRICK -> UNINSTALL`, with Policy Ledger and reversal of applicable Brick-created policies before Device Owner release.

**Actual:** `BetaSafety` and `DiagnosticsActivity` implement only `DISARMED -> MANAGEMENT_RELEASED -> UNINSTALL_REQUESTED`. Some legacy Location/date-time restrictions are cleared before Device Owner release, but there is no general Policy Ledger, explicit purge phase, current five-stage state model, or current production hidden entry.

**Credit:** existing fail-closed disarm-before-owner-release and Android-owned uninstall handoff are useful partial implementation evidence.

**Required fix:** replace/extend the beta retirement flow into the frozen five-stage production deprovisioner with durable policy provenance and complete reversal/purge semantics.

**Status:** OPEN

---

## P8B-006 — One-shot Location control still treats the historical command target as ongoing desired state

**Severity:** P1 HIGH

**Requirements impacted:** amended `SHZ-008`, `REL-010`, `REL-018`, `PORT-014`, `LOC1S-003`, `NOTIFY2-005`, related one-shot-control acceptance criteria.

**Expected:** while command is pending, compare target vs actual. After completion, last command becomes history. A later child/user toggle becomes current truth; it is not a repair mismatch and must not provoke repeated policy writes.

**Android actual:** every ~15 s the supervisor reads `ParentLocationStateStore.desired`, compares it to actual Android Location, and calls `ManagedPolicy.apply()` when they differ. The original command itself is consumed, so the phone normally does not re-toggle Location, but `ManagedPolicy.apply()` still repeats base Device Owner permission/policy writes. Health continues publishing `locationDesiredEnabled` and `locationControlMatches` against the historical command target.

**Cloud/portal actual:** `phase6-location-control.ts` persists `desired_enabled`; the parent API returns `desiredEnabled` and `matchesDesired`; `parent-v6.ts` renders `Parent setting` and reports `Phone matches the parent setting` / `Waiting for the phone to apply the new setting`.

**Impact:** a legitimate later child toggle is represented as an ongoing mismatch, violating current truth semantics and potentially causing needless repeated Device Owner writes/system disclosure noise.

**Required fix:** introduce explicit command lifecycle (pending/completed/failed + historical last command), stop desired-vs-actual reconciliation after completion, stop repeated policy writes caused only by historical mismatch, and update portal truth model.

**Status:** OPEN

---

## P8B-007 — Active measured-position reacquisition is incomplete and fallback can begin before ordinary repair

**Severity:** P1 HIGH

**Requirements impacted:** amended `LOC-008`, amended `FUS-001`, `REACQ-003..009`, Phase 9 reversible/latency matrix.

**Expected:** sampling-aware freshness; on unexpected callback/subscription gap enter bounded active reacquisition before fallback becomes authoritative; verify state/permissions/service/subscription; request fresh current/fused fix and recreate stalled subscription; old fallback cannot overwrite newer measured fix.

**Actual:** service fallback ticker begins fallback after approximately `max(8 s, interval*2 + 2 s)` while the ordinary supervisor only treats callbacks stale at `max(45 s, interval*3)` and then re-registers location updates. A fresh `getCurrentLocation()` is used for SOS but not the ordinary reacquisition path. There is no explicit REFRESHING generation/state barrier.

`PositionEngine.evaluate()` and `fallback()` are synchronized, which protects internal model mutation, but the service decides that fallback is needed before entering that lock. A measured callback can arrive after the stale decision but before fallback output is recorded; there is no generation/token recheck that invalidates the stale fallback decision after the newer measurement.

**Required fix:** implement explicit bounded reacquisition state/generation, current-fix request + subscription repair before fallback authority, sampling-profile-aware stale thresholds and post-computation freshness/generation check before publishing fallback.

**Status:** OPEN

---

## P8B-008 — Current OneMap-first Singapore map/provider contract is missing

**Severity:** P1 HIGH

**Requirements impacted:** amended `PORT-004/007/031`, `MAPSG-*`, `ONEMAP-001..007`.

**Expected:** MapLibre renderer + supported OneMap primary Singapore map/enrichment path + provider-independent Brick overlays + approved OSM/Protomaps-style fallback; authenticated OneMap access backend-owned with token lifecycle/rate-limit/cache/outage isolation.

**Actual:** current cloud/portal implementation serves one private R2 PMTiles archive `basemap/singapore.pmtiles` and `web/brick-map.ts` uses MapLibre + PMTiles + Protomaps/OSM attribution. No OneMap implementation/module/config/provider boundary was found in the current cloud source tree.

**Credit:** MapLibre rendering, private PMTiles hosting, local map-place resolution and provider-independent design foundations exist.

**Required fix:** add/wire OneMap primary provider and exact backend auth/token/rate/cache/fallback semantics while retaining current private-map path as approved fallback where appropriate.

**Status:** OPEN

---

## P8B-009 — Scheduled one-shot Wi-Fi control implementation not found

**Severity:** P1 HIGH

**Requirements impacted:** `WIFICTL-001..008`.

**Expected:** local scheduled one-shot Wi-Fi actions, actual-state confirmation, no persistent Wi-Fi lock, child override, reboot/offline/time-zone durability, stale-trigger grace, SOS/HIGH-fall OFF deferral and parent result after phone confirmation.

**Actual:** Android manifest requests `CHANGE_WIFI_STATE`, but current Android implementation tree contains no Wi-Fi schedule/control subsystem; `ManagedPolicy` implements Location command behavior, not scheduled Wi-Fi; no current cloud/parent Wi-Fi schedule path has been identified.

**Required fix:** implement the complete WIFICTL path Android + persistence/scheduler + protocol/backend/portal as required.

**Status:** OPEN

---

## P8B-010 — Fall detection / Emergency Evidence Bundle implementation not found

**Severity:** P1 HIGH

**Requirements impacted:** `SAFE-007..018` except forbidden `SAFE-013` absence remains desirable.

**Expected:** multi-signal local fall inference, LOW/MEDIUM/HIGH truth semantics, parent behavior, false-positive qualification, and protected privacy-minimized Emergency Evidence Bundle durable offline.

**Actual:** current Android implementation tree contains SOS/I'M SAFE safety delivery but no fall-detection subsystem/class/path was found. No fall-specific implementation is wired from `BrickApplication`, `BrickLocationService`, or child UI.

**Credit:** the forbidden automatic emergency-services dispatch path is not intentionally introduced by the inspected safety UI/runtime.

**Required fix:** implement SAFE fall inference, confidence/event state, protected evidence bundle, durable delivery and parent presentation; retain `SAFE-013` as forbidden.

**Status:** OPEN

---

## P8B-011 — Android hardening implementation has no ordinary JVM unit-test source set

**Severity:** P2 MEDIUM

**Requirements impacted:** broad algorithm/reliability verification quality; specific final classifications remain requirement-specific.

**Actual:** current `app/src` contains `androidTest`, `debug` and `main` only; no `app/src/test` source set is present. There is substantial instrumented test coverage, but pure deterministic algorithm/state-machine tests are not separated into ordinary host/JVM tests.

**Impact:** not every feature needs JVM tests, but deterministic parsing/state/algorithm logic is harder/slower to exhaustively fuzz/regress when all validation depends on instrumentation/workflow harnesses.

**Required fix:** where practical in later hardening, extract deterministic logic to host-testable units; this does not by itself fail a feature that already has stronger integration/device evidence.

**Status:** OPEN

---

## P8B-012 — Production cloud config still advertises the beta/test Android version

**Severity:** P1 HIGH

**Requirements impacted:** `GOV-007/008`, `OPS-005/011`, matching release identity.

**Expected:** backend production compatibility/version metadata matches the actual production candidate identity.

**Actual:** `wrangler.template.jsonc` points to production `src/worker-v9.ts` and full production bindings, but `CURRENT_APP_VERSION` remains `0.8.0-phase8-beta1-test`.

**Required fix:** freeze the final APK/backend/portal/schema/protocol versions together in the release candidate and ensure compatibility enforcement/audit metadata uses that identity.

**Status:** OPEN

---

## INFO-001 — `worker-v10.ts` is development-only and is not accidentally the production worker

**Severity:** INFO

`wrangler.template.jsonc` correctly points production at `src/worker-v9.ts`. `worker-v10.ts` wraps worker-v9 with the card-free development D1 runtime/PIN sessions and is therefore intentionally not production-reachable through the production template. Do not report v10's non-use as dead production functionality unless another requirement specifically depends on it.
