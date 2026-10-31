# Brick V1 Architecture Freeze

Status: Phase 1 contract artifact
Date: 2026-10-31
Source contract: `Yes.docx` (project file version 1)

This file freezes the architectural boundaries and non-negotiable invariants for the nine-phase Brick V1 program. It does **not** claim that every component below is implemented yet. Implementation/verification state lives in `V1_REQUIREMENTS.md`.

## 1. Product objective

Brick V1 is an appliance-like family safety tracker: install/configure once, then ordinary recoverable failures must heal without routine app reopening, manual sync, service restarts, storage clearing, phone reboots, or periodic babysitting.

A normal recoverable network/process/server/location failure that requires manual intervention is a Brick defect.

## 2. Canonical branch roles

Runtime work remains separated by responsibility:

- `main` — Cloudflare/backend/browser/runtime source and deployment tooling.
- `apk-download` — Android application source and APK build source.
- `audit-progress` — documentation, audit evidence, project memory and requirement state only.

Temporary implementation branches may be used, but canonical runtime truth remains the branches above. A feature is not accepted merely because it exists on a temporary branch.

## 3. Frozen top-level architecture

```text
CHILD ANDROID / OPPO
  Brick Core
    - Foreground Safety Service
    - Fused Position Provider
    - Activity / Transport Engine
    - Motion / Sensor Engine
    - Position Acceptance Filter
    - Evidence Provider Framework
    - Evidence Normalizer
    - Signal Trust / Uniqueness Engine
    - Particle / Hypothesis Engine
    - Environmental Fingerprint Atlas client
    - Reliability Supervisor
    - Encrypted Local Journals / Outboxes
    - Network + ACK / Retry Engine
    - Device Health Monitor
    - Device Owner management
    - Optional Shizuku Enhancement Bridge

          HTTPS/TLS + device-signed, replay-protected protocols

CLOUDFLARE
  - WAF / rate limiting / schema validation
  - Worker API
  - per-device Durable Object for current state
  - WebSockets for live parent updates
  - Queues + DLQ for durable/asynchronous processing
  - D1 for structured metadata/indexes/audit/model metadata
  - R2 for detailed/compressed history, evidence windows, model snapshots and backups
  - observability

PARENT WEBSITE
  - Cloudflare Access protected
  - live map and current state
  - honest uncertainty rendering
  - history / trips / places / device health
  - parent Location desired-state control
  - no arbitrary privileged command surface
```

## 4. Positioning architecture boundary

Android Fused Location Provider remains the primary normal position source. Brick does not replace Android/Google positioning with a custom GNSS solver.

Every non-fused technique produces **evidence or constraints**, not an automatically trusted exact coordinate.

The pipeline is:

```text
RAW PROVIDERS
GNSS / fused / motion / magnetic / steps / Wi-Fi / BLE / cell / LAN / RTT /
trusted witnesses / fixed receivers / route geometry / network context
        ↓
EVIDENCE NORMALIZER
        ↓
SIGNAL TRUST + INDEPENDENCE GROUPING
        ↓
PERSISTENT PARTICLE / HYPOTHESIS ENGINE
        ↓
BEST-SUPPORTED POSITION OR AREA + UNCERTAINTY + STATE + EXPLANATION
```

A provider must never directly promote itself to PRECISE/ANCHORED/ESTIMATED without the central position/fusion rules.

## 5. Official position states

The V1 external states remain:

- `PRECISE`
- `ASSISTED`
- `ANCHORED`
- `ESTIMATED`
- `COARSE`
- `LAST_KNOWN`
- `UNKNOWN`

These labels are user-facing quality categories. Internal model weights are not exposed as calibrated probabilities unless real calibration evidence exists.

## 6. Evidence-provider boundary

Every evidence provider must expose at minimum:

- capability state;
- provider health;
- freshness / monotonic timestamp;
- measurement quality;
- evidence family;
- independence group;
- uncertainty/constraint representation where applicable;
- privacy/retention classification.

Provider capability states must distinguish at least:

- supported/healthy;
- supported/degraded;
- temporarily unavailable;
- permission required;
- unsupported;
- failed.

`UNSUPPORTED` is not automatically a device-health failure.

## 7. Independence and anti-double-counting

Correlated observations cannot multiply confidence as if independent. Examples:

- SSID + BSSID + RSSI from one Wi-Fi scan belong to one Wi-Fi evidence family/group.
- Multiple advertisement fields from one physical BLE transmitter remain one physical-source family.
- A server-derived feature calculated from one underlying child measurement must not be re-counted as independent evidence from that original measurement.

Conflicting independent evidence expands uncertainty; the engine must not simply choose the most convenient answer.

## 8. Environmental Atlas boundary

Atlas learning follows one direction:

```text
TRUSTED POSITION
  → observe permitted environment
  → learn compact fingerprint tied to trusted area/route
  → estimate distinctiveness/stability/freshness/mobility/spoofability
  → use later only as supporting evidence with honest uncertainty
```

The Atlas may learn permitted Wi-Fi, BLE, LAN, cellular, magnetic, GNSS-sky, network, companion/accessory, route and arrival/departure features.

The Atlas is not a permanent raw-surveillance database. Long-lived identifiers should be privacy-reduced/keyed where practical; raw environmental evidence has bounded retention.

## 9. Motion / dead-reckoning boundary

Learned inertial odometry and particle propagation are short/degraded-position tools, not permission to claim indefinitely exact inertial location.

Required rules:

- uncertainty grows without external correction;
- zero-velocity correction prevents stationary drift;
- map/path constraints remove physically implausible hypotheses;
- magnetic/landmark/radio matches affect hypothesis weights rather than generating exact coordinates alone;
- raw evidence is preserved independently of realtime/refined estimates.

## 10. Witness and Ground Network boundary

Authorised witnesses and fixed Brick receivers may constrain a child position using rotating privacy-preserving BLE identifiers.

Rules:

- no permanent public child BLE identifier;
- no public crowdsourced tracking network in V1;
- only paired/authorised Brick relationships may resolve/report sightings;
- RSSI is proximity/pattern evidence, never exact ranging;
- receiver/witness location uncertainty must be included in child uncertainty;
- sightings are signed/authenticated, fresh, replay-protected and auditable.

## 11. Future ranging boundary

The evidence interface must permit future authenticated range/direction providers such as UWB, Bluetooth Channel Sounding or Wi-Fi NAN RTT without redesigning the fusion engine.

Unsupported hardware stays `UNSUPPORTED`; current Reno hardware must never be assumed to support a ranging technology merely because Android has an API for it.

## 12. Device Owner / Shizuku boundary

Device Owner remains the primary management mechanism.

Shizuku is optional enhancement only. Brick Core must continue tracking, journaling, retrying and reporting health if Shizuku is absent, killed, blocked, or unavailable after reboot.

No remote generic shell endpoint is permitted.

Privileged operations must be typed and allowlisted locally, e.g.:

- set requested Location state;
- request supported privileged Wi-Fi/BLE/cellular evidence;
- read privileged diagnostics;
- perform explicitly approved power-policy repair;
- enter a child-initiated SOS emergency mode where supported.

Each privileged parent command must be authenticated, device-bound, nonce/replay protected, short-lived, schema validated and audited.

## 13. Parent Location desired-state model

The parent portal stores a persistent desired state (`ON` or `OFF`) separately from the phone's actual Android Location state.

The phone must confirm the actual resulting state. The parent portal must never show success merely because a command was sent.

Device Owner is primary enforcement; Shizuku may be a secondary repair path only where validated.

## 14. Durability invariants

These rules are frozen for all phases:

1. **Persist before transmit.** A safety/location/evidence record that requires durable delivery is stored locally before network transmission.
2. **Exact acknowledgement before deletion.** Local durable data remains pending until the expected server ACK is verified.
3. **Idempotent server processing.** Duplicate uploads must be logically harmless.
4. **Ordered identities.** Durable events use device epoch + sequence + monotonic time where applicable.
5. **Priority separation.** SOS/critical safety traffic cannot be trapped behind bulk history/evidence backlog.
6. **Backlog survival.** Normal tracking target remains at least 7 days, preferably 14 days, subject to measured qualification.
7. **Raw truth preserved.** Rejected raw GPS/evidence is not silently rewritten to make algorithms look correct.
8. **Refinement is separate.** Backward-smoothed/refined estimates never overwrite raw observations or the original realtime estimate.

## 15. Reliability invariants

- A failed evidence provider must not crash Brick Core.
- A stalled location subscription should be recreated, not require phone reboot.
- Network failure should trigger durable backlog/retry, not data loss.
- Cloudflare failure should not stop local data capture.
- WorkManager remains secondary persisted recovery/housekeeping, not the main live tracker.
- Cloud watchdog and phone-side supervisor remain independent failure detectors.
- Device Health must explain actual provider/permission/service/queue conditions rather than output a fake score.
- Production qualification requires real OPPO/ColorOS evidence, not emulator/source-only claims.

## 16. Security invariants

- TLS for device/cloud traffic.
- Device-specific asymmetric keys generated/kept through Android Keystore.
- No hard-coded shared API secret in the APK.
- Replay protection and schema validation.
- Parent authentication through the approved Cloudflare parent-auth path.
- Device revocation blocks future trusted uploads without destroying historical records.
- WAF/rate limiting on relevant public/device endpoints.
- No arbitrary Cloudflare-to-shell execution.
- No location coordinates in ordinary debug logs.
- No external ad/marketing analytics SDKs.

## 17. UI honesty invariants

Child UI stays minimal. Normal state exposes safety status, `I'M SAFE`, `SOS`, and only actionable repair guidance when needed.

Parent UI must distinguish **device health** from **position quality**.

Degraded positioning must render uncertainty honestly using the appropriate geometry: accuracy circle, larger coarse circle, route corridor, possible-area/heat region, known-place/anchor region, witness region, or expanding last-known uncertainty.

Never display a single exact marker merely because it is visually convenient when the model only supports an area.

## 18. Privacy invariants

- No camera visual localisation for V1.
- No microphone/ultrasonic localisation.
- No photo-library EXIF scraping.
- No public crowdsourced BLE/Wi-Fi tracking database.
- No fake carrier tower triangulation.
- No permanent family-car tracker.
- No root/custom-ROM dependency.
- No unlimited max-rate Wi-Fi/BLE/environment scanning.
- Collect only evidence with a defined reliability purpose, retention class and health state.

## 19. Release truth invariant

Until the final real-device qualification passes, Brick is a **release candidate**, not production-qualified.

Source/build checks, a deployed Worker, a browser smoke test and physical OPPO reliability testing are separate acceptance layers. Passing one does not imply the others passed.
