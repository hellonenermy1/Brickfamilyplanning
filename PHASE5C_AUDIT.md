# Brick Phase 5C Hardening Audit

Status: Phase 5C implementation hardening. This document is not a Phase 6 production-qualification certificate.

## Scope

Phase 5C audits and hardens the existing Phase 1–5B design without replacing the proven tracking architecture. The child remains responsible for collection and encrypted local buffering; Cloudflare remains responsible for server-side state, history, safety evaluation, health, and the parent website.

This phase does **not** claim the real OPPO endurance/Doze/reboot/network qualification required by Phase 6.

## Branches

- Cloud/server/dashboard: `phase5c-hardening-audit`
- Android child: `phase5c-child-hardening`
- Application code has not been merged to `main`.

## Hardening completed

### Privacy and diagnostics

- Added first-party signed crash reporting to Brick's own backend.
- Crash payload is deliberately minimal: protocol, report ID, app version, module, exception signature, and device timestamp.
- Crash payload validation rejects location/coordinate/address fields, stack traces, raw exception messages, and unknown fields.
- Android crash signatures are hashes built from exception class plus a sanitized Brick frame; raw exception text and full stack traces are not persisted.
- Crash diagnostics are lower priority than location and safety data and are bounded to 500 pending local diagnostic records.
- Added source/CI guards against common external analytics/ad trackers and coordinate-bearing ordinary debug logs.
- Private map/browser paths continue to reject Google Maps, Nominatim, demo MapLibre tiles, and external MapLibre asset fallbacks.

### Parent authentication and mutation safety

- Parent routes authenticate the Brick parent session before entering the inherited core Worker.
- Added a regression test proving a forged `Cf-Access-Jwt-Assertion` header by itself does not authorize the parent interface.
- Parent mutations require same-origin requests.
- Added a sanitized parent audit log for login/logout and administrative mutations.

### Release and operational truth

- Parent Device Health now shows installed app version, current server release, and update state.
- No silent/self-update capability is claimed. Managed update behavior still requires real OPPO validation before it can be called automatic.
- Added minimal crash history and admin-audit history to the parent Health view.
- Added local journal write health to the parent diagnostics view.
- Local journal persistence failure is classified as `critical` / `local_journal_write_failed`; Brick must not call the device healthy when it cannot durably store new location records.

### Android local durability

- Location journal insert failure is no longer silent. It records `journalWriteHealthy=false` and the age of the latest local persistence failure.
- The location journal is **not** capped or discarded to hide storage pressure; unsent location evidence remains higher priority than diagnostics.
- On app-process startup, Brick reconciles the stored sequence counter against the maximum sequence already present in the SQLite journal for the current epoch. This prevents SharedPreferences write lag from causing reuse of an already-persisted `(epoch, sequence)` after a process crash.
- The child UI includes the required FIX recovery action when location needs attention.
- WorkManager/boot/package-replacement recovery remains intact.

### D1 free-plan reliability

A Phase 5C audit found that the original no-card D1 adaptation could exceed the D1 Free write budget under a continuous 3-second cadence when geofences or trips were active. That was a real reliability bug.

The hot path was changed so that:

- every unique location still receives exact dedupe and compact hourly history storage;
- delayed/out-of-order backlog packets are retained in history but cannot rewind geofence/trip safety state;
- a geofence that remains stably inside/outside does not rewrite its D1 state row on every fix;
- candidate/dwell transitions remain durable immediately;
- active trip state is persisted immediately for meaningful changes and otherwise checkpointed every 60 seconds;
- device sequence metadata is checkpointed every 20 sequence values instead of being rewritten for every point;
- free-plan Brick caps saved geofences at 8 per device to retain headroom under the per-invocation D1 query ceiling.

The CI budget model deliberately assumes the most expensive normal tracking cadence of 3 seconds for 24 hours:

- 28,800 location packets/day;
- 57,600 modeled base D1 row writes for exact dedupe + history append;
- 1,440 device metadata checkpoints;
- 8,640 modeled rows for 30-second health sampling and related indexed/device updates;
- 2,880 modeled rows for an active trip checkpointed every 60 seconds;
- approximately 70,560 modeled steady-state rows written/day before rare safety transitions.

The CI gate requires the modeled steady-state total to remain at or below 80,000 rows/day against the currently targeted 100,000-row/day D1 Free limit, leaving at least 20% modeled headroom for real events and maintenance.

This is a capacity model, not a substitute for Phase 6 runtime measurement.

### D1/runtime bugs fixed

- Removed an unbound `?13` SQL placeholder that could have broken active-trip evaluation at runtime.
- The fix is now in the D1 compatibility layer itself; the temporary downstream SQL guard was removed.
- CI asserts that the invalid placeholder cannot return.
- Added an 8-geofence cap to avoid pathological per-location query counts on the free plan.
- Fixed map-install deployment state so a successfully committed private map is recorded as installed instead of leaving a stale `installed:false` artifact.

### Reproducible deployment

- Added a real npm lockfile generated on GitHub's runner.
- Cloud validation, D1-budget validation, and Phase 5C deployment use `npm ci` rather than unconstrained transitive resolution.
- Deployment preflight runs the same important auth, privacy, crash, health, history, TypeScript, browser-module, and D1-budget checks before provisioning.
- GitHub Action dependencies used by the Android path were moved to current Node-24-capable releases (`setup-gradle@v6`, `upload-artifact@v7`).
- Android Kotlin JVM target configuration was migrated away from the deprecated `kotlinOptions.jvmTarget` DSL.

## Historical workflow failures converted into regression targets

Phase 5C reviewed prior failed runs instead of treating them as noise. The following failure classes now have fixes and/or explicit guards:

- R2 account/billing activation dependency;
- Queue/R2/Cloudflare Access reintroduction into the no-card runtime;
- non-root static asset `base_path` breakage;
- invalid Cloudflare cron shape;
- stale map asset-path assumptions;
- browser/Worker TypeScript regressions;
- forged Access-header authorization assumptions;
- missing deployment secret preflight;
- private-map deployment state lying after successful install;
- privacy scanner false positives from dead replacement-template strings;
- D1 write amplification from geofence/trip state;
- D1 per-invocation query risk from unlimited geofences;
- runtime trip SQL bind mismatch;
- silent Android location-journal persistence failure;
- location sequence reuse risk after process-crash preference lag;
- outdated GitHub Action Node runtimes;
- Kotlin compiler/deprecated Gradle DSL warnings found during Phase 5C builds.

## CI evidence

Cloud Phase 5C must pass both:

1. `Check Brick Cloudflare Phase 5C Hardening`
2. `Check Brick D1 Free-Tier Budget`

The cloud suite includes TypeScript checks, private-map bundle checks, tracker/privacy scanning, parent authentication tests, crash privacy tests, rendered parent-dashboard parsing, health-classifier tests, history codec tests, D1 schema/BLOB tests, map schema tests, and truthful deployment-state checks.

Android Phase 5C must pass `Build Brick Child Phase 5C`, including the privacy/crash/local-journal/sequence source contract, debug APK assembly, and Android lint.

Exact final run IDs and commit SHAs should be taken from the latest successful branch heads, not from an older green run after a newer commit.

## Not yet proven / intentionally unresolved

These are not to be reported as completed:

### Real-device production qualification

Requires Phase 6 on the actual ColorOS/OPPO target, including at minimum:

- 72-hour untouched run;
- 7-day untouched run;
- screen-off overnight;
- Doze;
- Wi-Fi/cellular transitions;
- 2-hour Internet outage and backfill;
- degraded indoor position and GNSS loss;
- battery saver, low battery, and charging transitions;
- process kill and recovery;
- Cloudflare unavailability;
- out-of-order/duplicate/corrupt payload testing;
- thousands of queued locations;
- ColorOS memory pressure;
- phone reboot;
- app update;
- Worker deployment during operation;
- zero manual intervention after every recoverable case.

### Backup beyond platform recovery

D1 platform recovery/Time Travel is useful protection, but Brick does not yet implement the longer independent encrypted export snapshot contemplated by the specification. Precise family location data must not be copied into ordinary third-party CI artifacts merely to tick a backup checkbox.

### Device revocation UX

The backend rejects uploads from a device with `revoked_at`, but the parent dashboard does not yet expose a complete revoke/archive workflow. A naive revoke button is intentionally not added because the inherited parent lookup also excludes revoked devices, which would make historical data disappear. Revocation needs archival/read semantics fixed together before exposing it.

### Silent managed updates

Not claimed. Must be experimentally validated on the real OPPO/ColorOS target before Brick says updates are automatic or silent.

### Map presentation limitations

The private map intentionally omits external glyph/sprite dependencies. Rich symbol/label assets should only be added when they are self-hosted. Private place lookup is not claimed to provide postal-quality address accuracy.

## Deployment status

A green branch/CI run proves the code and regression suite for that revision. It does **not** prove that the revision is currently deployed to Cloudflare or installed on the child phone. Deployment and installation must be verified separately.

## Phase boundary

When Phase 5C is green, the next step is a short pre-Phase-6 smoke test of the actual deployed Cloudflare build and installed APK. The long torture/endurance qualification remains Phase 6 and must not be silently folded into Phase 5C.
