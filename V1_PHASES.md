# Brick V1 Nine-Phase Program

Status: Phase 1 contract artifact
Date: 2026-10-31
Source contract: `Yes.docx` project file version 1

This is the fixed implementation program for the new Brick V1 contract. New discoveries should be assigned to the appropriate existing phase and requirement ID. Do not silently create a tenth phase unless the contract itself is deliberately changed.

## Global completion states

Every requirement uses these states:

1. `NOT_STARTED`
2. `IMPLEMENTED`
3. `CI_VERIFIED`
4. `INTEGRATION_VERIFIED`
5. `DEVICE_VERIFIED`
6. `ACCEPTED`

Hardware/API-dependent functionality may instead end in `VERIFIED_UNSUPPORTED` after real target-device testing proves the capability unavailable. `UNKNOWN` is not a valid final state.

No item becomes accepted merely because source code exists.

---

# Phase 1 — Contract, Baseline & Architecture Freeze

Purpose: establish one non-ambiguous truth source before implementation begins.

Deliverables:

- freeze exact current `main`, `apk-download`, and `audit-progress` heads;
- record proven Phase 6 source/build baseline and existing production blockers;
- convert `Yes.docx` into permanent requirement IDs;
- map every requirement to current implementation state and one owner phase;
- freeze architecture boundaries and cross-phase invariants;
- record V1 explicit non-goals;
- define the evidence/status model used for later audit closure;
- produce Phase 1 closure report.

No runtime feature implementation belongs in Phase 1.

Exit gate: every contractual requirement is represented in the ledger and has an owner phase; baseline identity and invariants are recorded; no source/runtime claim is upgraded without evidence.

---

# Phase 2 — Evidence Platform, Protocol & Durable Data Foundation

Purpose: create the common plumbing needed by all new evidence/Atlas/fusion features without destabilizing the existing live tracker.

Scope:

- canonical `EvidenceObservation` representation;
- provider capability/health model;
- evidence families and independence groups;
- shared sampling coordinator;
- evidence journal/outbox with encrypted durable local persistence;
- evidence sequencing, exact ACK/resend and idempotency;
- versioned evidence batch protocol separate from the compact live-location packet;
- schema validation, replay protection and bounded payloads;
- cloud storage/index foundations for evidence, Atlas metadata, provider health, commands, witness/receiver registration and refined-history metadata;
- dummy-provider end-to-end reliability test.

Exit gate: dummy evidence can be collected, durably persisted, survive process loss, transmit securely, dedupe on the server, receive exact ACK and be removed locally without degrading current location/SOS operation.

---

# Phase 3 — Motion Intelligence, Learned Odometry & Particle Positioning

Purpose: make short-term degraded/Location-OFF movement estimation structurally useful before adding environmental radio intelligence.

Scope:

- raw accelerometer, gyroscope, magnetometer, rotation-vector and step inputs;
- sensor freshness/health validation;
- stationary confidence and zero-velocity correction;
- phone-orientation/placement features where measurable;
- per-device/per-motion learned odometry for stationary, walking, running, bicycle and vehicle states;
- dynamic walking/running stride calibration;
- turn detection and motion sequence features;
- persistent particle/hypothesis state;
- motion propagation with growing uncertainty;
- local route/path graph constraints;
- integration with existing server route-corridor support;
- geomagnetic sequence provider;
- physical landmark sequence provider;
- no long-duration exact inertial claims.

Exit gate: controlled GNSS-loss journeys demonstrate growing uncertainty, route/turn elimination, stationary drift suppression and clean recovery when precise location returns.

---

# Phase 4 — Environmental Fingerprint Atlas & Signal Trust Engine

Purpose: learn useful environmental signatures only from trusted-position periods, then rank their future usefulness honestly.

Scope:

- Wi-Fi cluster fingerprints: privacy-reduced BSSID identity, semantic SSID hint, RSSI distributions, relative ordering, band/frequency/channel/capability, co-occurrence, gradients, opportunistic RTT data;
- all-permitted BLE environment fingerprinting and static/mobile/stale classification;
- LAN place signatures from legitimately visible gateway/service/device context;
- cellular radio fingerprints using only legitimately exposed Android/modem fields;
- richer geomagnetic vector fingerprints;
- GNSS sky/multipath/open-sky/urban-canyon fingerprints;
- network-context fingerprints;
- trusted companion/accessory and charging context as weak evidence;
- arrival/departure/building-entry sequence learning;
- zone/floor inference only where evidence validates it;
- time/dwell priors as weak priors only;
- Signal Trust / Uniqueness model: geographic spread, stability, mobility, freshness, measurement quality, repeatability, spoofability, correlation, source health, observation count and replacement history;
- independence/anti-double-counting enforcement;
- cautious negative evidence;
- automatic signal decay/relearning;
- privacy-reduced long-term identifiers and bounded raw evidence retention.

Exit gate: common/spoofed/transient/moved/replaced signals do not falsely anchor the device, and the Atlas automatically relearns changed environments without manual fingerprint maintenance.

---

# Phase 5 — Unified Fusion, Learned Places, Routes, Witness Mesh & Ground Network

Purpose: combine all independent evidence into one persistent hypothesis system and add authorised external observations.

Scope:

- full Parallel Evidence Engine;
- conflict-aware uncertainty expansion/shrinkage;
- learned Home/School/Grandparents/custom-place signatures;
- radio-route fingerprint matching;
- Wi-Fi Semantic Landmark Engine;
- opportunistic Wi-Fi RTT provider with runtime feature detection;
- private authorised-device BLE Witness Mesh with rotating identifiers;
- fixed Brick Ground Network receivers using the same authenticated sighting model;
- future ranging provider abstraction for UWB/Bluetooth Channel Sounding/Wi-Fi NAN RTT without assuming hardware support;
- uncertainty shapes/areas rather than forced points;
- backward smoothing when a new precise endpoint arrives;
- separate raw, original realtime estimate and refined estimate history.

Exit gate: every official position state can be produced honestly; weak evidence cannot create false precision; witness/receiver observations constrain uncertainty without treating RSSI as exact distance.

---

# Phase 6 — Device Owner, Parent Location Control & Optional Shizuku Enhancement

Purpose: add tightly controlled system-level capabilities without ever making Brick Core dependent on privileged tooling.

Scope:

- refactor unconditional Device Owner Location enforcement into a persistent parent desired-state model;
- desired vs actual Android Location state machine with phone-side confirmation;
- Device Owner as primary ON/OFF enforcement/repair mechanism where policy permits;
- authenticated, device-bound, nonce-protected, expiring, schema-validated parent command protocol;
- optional Shizuku bridge with typed local allowlist only;
- test Location-OFF privileged Wi-Fi evidence on the actual target OPPO/ColorOS build;
- test Location-OFF privileged BLE evidence;
- optional privileged cellular evidence where actually exposed;
- richer diagnostics and narrowly approved power-policy repair;
- child-initiated SOS-only emergency location-bypass experiment where supported;
- silent low-importance `Brick / GPS on` foreground notification behavior;
- explicit Shizuku health and graceful loss/reboot behavior;
- no generic remote shell execution.

Exit gate: parent Location commands are verified by actual phone state; duplicate/replayed/unauthorised commands fail safely; Brick Core remains fully operational through Shizuku loss/reboot/unsupported capability.

---

# Phase 7 — Cloud Intelligence, History, Parent Dashboard & Child UX Integration

Purpose: expose the new system clearly without weakening existing history/safety/user experience.

Scope:

- Durable Object current position/uncertainty/evidence/health/desired-state model;
- D1 structured indexes for Atlas/signals/witnesses/receivers/commands/audit/refined-history metadata;
- R2 compressed detailed history/evidence/model snapshots;
- Queue processing for Atlas learning, trust recalculation, decay/relearning and backward smoothing;
- preserve existing history, route playback, speed/mode history, stop detection, trips, geofences, arrival/departure and Trip Mode;
- ensure estimates do not cause dishonest geofence/trip events;
- parent map rendering for precise circle, assisted/coarse circle, corridor, heat/possible-area, anchor region, witness region and expanding last-known uncertainty;
- human-readable evidence explanations without fake probabilities;
- parent requested-vs-actual Location state display;
- provider-by-provider Device Health/capability UI;
- preserve intentionally minimal child UI.

Exit gate: every main UI state is exercised against precise, degraded, stale, offline, anchored, witness, revoked, unsupported-provider, SOS and I'M SAFE conditions.

---

# Phase 8 — Reliability, Security, Privacy & Operational Hardening

Purpose: aggressively break the integrated system before production qualification.

Scope:

- regression audit of encrypted journal, sequence, ACK/resend, idempotency, safety priority, Queue/DLQ and recovery;
- evidence-backlog prioritization so bulk learning cannot starve safety/live state;
- 7–14 day backlog/storage-pressure testing;
- provider crash isolation;
- network/Cloudflare failure isolation;
- security audit of keys, replay protection, commands, Access, WAF/rate limits, revocation and audit logs;
- privacy audit of environmental retention/privacy-reduced identifiers/no analytics/no public fingerprint database;
- backup **and actual restore** verification;
- battery, CPU, memory, wakeup, scan cadence, storage, mobile-data and cloud-usage measurements;
- remove/tune advanced functionality that produces negligible value for unacceptable reliability/battery cost.

Exit gate: no critical reliability/security/privacy defect remains open; target-device-dependent capabilities must be known as supported or verified unsupported, not left ambiguous where they are required for release qualification.

---

# Phase 9 — Real OPPO Qualification, Production Release & Acceptance

Purpose: prove the system on the actual target environment and freeze the production release.

Scope:

- stable production signing configuration and final signed APK;
- inspect final APK manifest, permissions, exported components, package/version, signing certificate, network config and dependencies;
- deploy the exact matching backend/browser/schema/protocol commit set;
- authenticated full parent-browser smoke test;
- original endurance/failure suite: 72h untouched, 7 days untouched, screen-off, Doze, network transitions/outages, GNSS degradation, battery saver/low/charging, process/network kills, Cloudflare outage, duplicate/out-of-order/corrupt data, backlog, memory pressure, reboot, app update and Worker deploy;
- Atlas real-device tests for repeated learning, common/spoofed SSIDs, moving/transient BLE, equipment replacement, LAN changes, LTE/5G transitions, GNSS-to-indoor transitions, zone/floor honesty, battery impact, retention and relearning;
- Location-OFF tests under walking/vehicle/known/unknown/indoor routes with and without available evidence sources;
- Witness Mesh rotating-ID/auth/replay/accuracy tests;
- Ground Network receiver online/offline/stale/replay/multi-receiver tests;
- Shizuku supported/blocked/lost/reboot behavior;
- final zero-manual-intervention recovery audit;
- final release tag/freeze/compliance report.

Exit gate: only after all mandatory acceptance evidence exists may Brick move from release candidate to `PRODUCTION_QUALIFIED`.

---

## Cross-phase rule

A later phase cannot silently change an earlier invariant. If implementation demonstrates that a contract requirement is technically unsound, the requirement ledger must record the evidence, proposed contract change, and explicit decision before architecture is changed.
