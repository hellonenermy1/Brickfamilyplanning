# Brick V1 — Phase 8A Current Requirement Amendments

Purpose: preserve stable Phase 1 IDs where still valid, while giving later approved requirements their own canonical IDs. Superseded Phase 1 IDs remain historical rather than being silently rewritten.

This is an **amendment ledger**, not yet the final merged Phase 8A master ledger. Phase 8A closure requires reconciliation of every base ID plus every amendment below.

---

# A. One-shot Location control

`LOC1S-001` — Parent Location ON/OFF is a one-shot command, not persistent desired state.

`LOC1S-002` — Device Owner is the primary actuator where supported; execute requested state, verify actual Android state, report result, then stop enforcing.

`LOC1S-003` — Do not create/use `parentDesiredLocationState` as a normal V1 enforcement mechanism.

`LOC1S-004` — Do not apply `DISALLOW_CONFIG_LOCATION` in normal V1 operation.

`LOC1S-005` — After successful parent ON, a later child/user OFF is legitimate and must remain OFF until another explicit command/action.

`LOC1S-006` — After successful parent OFF, a later child/user ON is legitimate and must remain ON until another explicit command/action.

`LOC1S-007` — Repair/retry may continue only while an actual command is pending/failed or a Brick subsystem itself is broken; later deliberate user state change is not a command failure.

`LOC1S-008` — Parent UI changes commanded state only after phone-side actual-state confirmation; it separately exposes current actual Location, last command, command result and confirmation time.

Supersedes old persistent-desired-state semantics in `MGT-003`, `LOCCTL-001..005` where they conflict.

---

# B. Scheduled Wi-Fi one-shot control

`WIFICTL-001` — Bedtime/morning Wi-Fi schedules are local one-shot actions, never persistent desired state.

`WIFICTL-002` — Device Owner may toggle Wi-Fi only where target-platform capability is proven and must verify the resulting actual state.

`WIFICTL-003` — Do not apply `DISALLOW_CHANGE_WIFI_STATE` for normal scheduled Wi-Fi control.

`WIFICTL-004` — A later child/user Wi-Fi toggle wins; Brick must not force the schedule's previous result back.

`WIFICTL-005` — Wi-Fi schedules persist locally for offline execution and recover across reboot/time-zone changes.

`WIFICTL-006` — Stale missed schedule triggers outside the configured grace window are skipped rather than replayed blindly.

`WIFICTL-007` — Scheduled Wi-Fi OFF is deferred during SOS/HIGH-fall critical emergency handling.

`WIFICTL-008` — Parent UI changes scheduled-action state/result only after phone-side actual-state confirmation.

---

# C. Measured-position continuity and active reacquisition

`REACQ-001` — Position freshness/degradation threshold must respect the active sampling profile; intentional 30–120 s stationary cadence cannot falsely trigger ESTIMATED/COARSE/LAST_KNOWN.

`REACQ-002` — A fresh accepted measured/fused fix outranks fallback/Atlas/particle/coarse outputs.

`REACQ-003` — An older fallback computation finishing late must never overwrite a newer measured fix.

`REACQ-004` — Unexpected location callback gaps enter an internal refresh/reacquisition path before fallback is declared authoritative.

`REACQ-005` — Reacquisition verifies Android Location state, permissions, tracker/service state and location-subscription health.

`REACQ-006` — Reacquisition requests a fresh fused/current fix and recreates a stalled subscription where appropriate.

`REACQ-007` — Reacquisition is bounded; fallback begins only when reacquisition genuinely fails rather than waiting indefinitely.

`REACQ-008` — Motion leaving a slow stationary profile requests fresh positioning immediately.

`REACQ-009` — Qualification target is zero false degraded-state transitions while acceptable measured positioning remains available for the active profile.

---

# D. Quiet notification / disclosure policy

`NOTIFY2-001` — An ordinary one-shot Location ON/OFF command does not create a separate Brick `GPS on` notification.

`NOTIFY2-002` — If continuous tracking requires foreground-service visibility, use one consolidated minimum-compliant notification.

`NOTIFY2-003` — Brick-created FGS status is low importance/silent: no sound, vibration, heads-up or per-position repost.

`NOTIFY2-004` — Android/ColorOS/device-policy privacy disclosures are system-owned and must not be hidden or programmatically dismissed.

`NOTIFY2-005` — If Brick's repeated permission/policy writes cause repeated system notices, remove unnecessary repeated writes rather than attempting to suppress the platform disclosure.

Supersedes old `NOTIF-001` requirement for a separate `Brick / GPS on` notification.

---

# E. Maintenance & Recovery Console

`MAINT-001` — Provide a local-only Maintenance & Recovery Console.

`MAINT-002` — Entry sequence: seven logo taps, wait at least ten seconds, then one further logo tap inside the armed window.

`MAINT-003` — Console entry has no PIN, key or backend dependency; invalid sequences reset silently.

`MAINT-004` — Console exposes truthful subsystem/device-policy state and a System State Timeline.

`MAINT-005` — One-shot Location/Wi-Fi/future radio actions launched through maintenance preserve the child/user-override invariant after the action completes.

`MAINT-006` — Mobile-data and SIM/radio actuators remain capability-gated until separately proven on each real target OPPO.

`MAINT-007` — Diagnostic export is privacy-reduced.

---

# F. Deep Off and deprovisioning

`DEEPOFF-001` — Deep Off creates a durable state snapshot plus provenance ledger before/while quiescing Brick.

`DEEPOFF-002` — Deep Off stops all active Brick work.

`DEEPOFF-003` — Deep Off survives reboot and day-long power-off without silently reactivating.

`DEEPOFF-004` — Deep Off never auto-reactivates.

`DEEPOFF-005` — Reactivation restores only Brick-caused temporary changes that have not been superseded by later child/user/system changes.

`DEPROV-001` — Final deprovisioning uses the five phases `AUTHORISE/FREEZE -> QUIESCE -> UNDO DEVICE MANAGEMENT -> PURGE BRICK -> UNINSTALL`.

`DEPROV-002` — Maintain a Policy Ledger for Brick-created policy changes.

`DEPROV-003` — Reverse Brick-created policies before relinquishing Device Owner/management.

`DEPROV-004` — Preserve a tested test-build/Device Owner escape path; qualification fails if that path is unavailable.

`DEPROV-005` — Real-device qualification covers hidden entry, Deep Off idle behavior, reboot persistence, state restoration/provenance, child override, policy reversal, Device Owner release and final uninstall handoff.

The legacy three-stage retirement state machine remains historical/implementation evidence and does not erase these current V1 requirements.

---

# G. Fast Live Path

`LIVE-001` — Current accepted position uses a dedicated fast path: accepted fix -> local persistence -> realtime packet -> authoritative current state -> WebSocket -> map render.

`LIVE-002` — History batching, Atlas learning, reverse geocoding, large-object/history work, route simplification and offline-backlog processing must not head-of-line block current live position delivery.

`LIVE-003` — Instrument at least source age, local persist time, phone send delay, backend delay, WebSocket delay and render delay.

`LIVE-004` — Preserve all points required by durable history even when obsolete intermediate live renders are coalesced because newer current state already exists.

`LIVE-005` — Real-device/browser qualification measures the approved 23R P95 live-latency budget rather than claiming low latency from code inspection.

`LIVE-006` — Map/enrichment work cannot turn a functioning tracker into a live-tracking outage.

---

# H. Singapore map and OneMap provider boundary

`MAPSG-001` — MapLibre remains the parent-map renderer.

`MAPSG-002` — Use the current supported high-detail OneMap Singapore map path as the primary Singapore basemap where the approved provider capability is available.

`MAPSG-003` — Progressive zoom detail should expose only provider-supplied planning/estate, road/transit/school/park, building/HDB and block/street detail appropriate to zoom; never invent labels.

`MAPSG-004` — All Brick overlays remain provider-independent: current position, heading, accuracy/uncertainty, live trail, history/playback, stops/trips, places/geofences, SOS/I'M SAFE/fall events and degraded corridors/particle areas.

`MAPSG-005` — OneMap failure is not a tracking failure; fail over to the approved OSM/Protomaps-style fallback while preserving Brick state/overlays.

`MAPSG-006` — Support normal mouse/trackpad/touch pan and zoom plus explicit Recenter/Follow.

`MAPSG-007` — Manual parent pan/zoom disables forced follow until the parent explicitly recenters/follows again.

`MAPSG-008` — Address enrichment is asynchronous; current coordinate renders first.

`MAPSG-009` — Address results are bound to the coordinate/time that produced them so a delayed older result cannot overwrite a newer position.

`MAPSG-010` — Detailed is default; clean may be secondary; satellite is optional only with a properly licensed/tested provider and is not a V1 dependency.

`MAPSG-011` — Required provider attribution is preserved and unrelated Brick history/evidence/family telemetry is not sent to the map provider.

`ONEMAP-001` — Token-free basemap capability is isolated from authenticated enrichment capability.

`ONEMAP-002` — Authenticated OneMap enrichment credentials/tokens are owned by the Brick backend and are not shipped in the APK or parent JavaScript bundle.

`ONEMAP-003` — Store provider credentials securely and implement the approved token lifecycle, including refresh before expiry.

`ONEMAP-004` — Token refresh/retry is bounded; provider authentication failure cannot deadlock Brick.

`ONEMAP-005` — Centralize provider rate limiting within the approved provider ceiling.

`ONEMAP-006` — Coalesce/cache enrichment so live tracking cadence does not cause matching reverse-geocode cadence.

`ONEMAP-007` — Token expiry, rate limiting or enrichment outage leaves map basemap capability where possible and Brick tracking overlays/current state operational.

---

# I. Parent Location presentation amendment

`PLOCUI-001` — Parent shows current actual Android Location state separately from command history.

`PLOCUI-002` — Parent shows last one-shot command target/result/confirmation time without representing it as persistent desired state.

`PLOCUI-003` — A later child/user Location change immediately becomes the actual state without `repair pending` merely because it differs from the historical last command.

---

# J. Phase 9 reversible-control / latency / notification qualification additions

`QUALREV-001` — Test parent ON -> verified ON -> child OFF; child OFF remains accepted.

`QUALREV-002` — Test parent OFF -> verified OFF -> child ON; child ON remains accepted.

`QUALREV-003` — Verify `DISALLOW_CONFIG_LOCATION` absent during normal V1 operation.

`QUALREV-004` — Test scheduled Wi-Fi OFF then child re-enables; later state remains ON until a new explicit/scheduled action.

`QUALREV-005` — Test scheduled Wi-Fi ON then child disables; later state remains OFF until a new explicit/scheduled action.

`QUALREV-006` — Verify `DISALLOW_CHANGE_WIFI_STATE` absent for normal schedules.

`QUALREV-007` — Verify healthy Location ON + acceptable measured fixes produce zero false ESTIMATED/COARSE/LAST_KNOWN transitions.

`QUALREV-008` — Verify stationary slow sampling does not falsely trigger degradation.

`QUALREV-009` — Verify stale callback/subscription invokes active reacquisition/repair before fallback.

`QUALREV-010` — Verify old fallback result cannot overwrite newer measured fix.

`QUALREV-011` — Measure Fast Live Path P95 against the approved 23R budget and prove history/Atlas/backlog work does not block it.

`QUALREV-012` — Verify zero separate Brick-created GPS-on notification and no repeated Brick-created Location ping during healthy operation.

`QUALREV-013` — Classify any remaining Location-related notice as Brick-owned or Android/ColorOS/device-policy-owned.

`QUALREV-014` — Verify required platform disclosures are not hidden/dismissed and remove needless repeated Brick writes if Brick triggers repeated disclosure.

---

## Amendment count

Current amendment IDs in this file: 88.

This count is provisional until automated/manual reconciliation confirms every later approved clause has exactly one current requirement mapping and no duplicate semantic requirement remains unresolved.
