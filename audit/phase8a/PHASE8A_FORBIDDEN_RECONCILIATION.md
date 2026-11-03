# Brick V1 — Phase 8A Forbidden / Negative Requirement Reconciliation

Source baseline: 469-point Final Product AI Acceptance Checklist.

Total forbidden rows recovered: **24**.

Rule: a forbidden requirement is a real V1 contract item. It cannot disappear from the ledger merely because the intended implementation omits the feature; Phase 8B/8C/8D/8E must prove the forbidden path is absent where relevant.

## All 24 forbidden rows

| ID | Forbidden behavior | Current Phase 8A result |
|---|---|---|
| `ATL-031` | Invent/depend on barometer evidence when target phone does not expose/confirm one | CURRENT — FORBIDDEN |
| `ATL-039` | Public crowdsourced BLE/Wi-Fi/location fingerprint database | CURRENT — FORBIDDEN |
| `SHZ-005` | Generic remote shell / arbitrary Shizuku command surface | CURRENT — FORBIDDEN |
| `SAFE-013` | Automatic emergency-services dispatch from fall inference in V1 | CURRENT — FORBIDDEN |
| `SEC-006` | Hard-coded long-lived backend/master/signing/pairing secrets in APK | CURRENT — FORBIDDEN |
| `SEC-015` | External analytics/ad/marketing SDKs | CURRENT — FORBIDDEN |
| `SEC-018` | Raw location dumps to third-party crash service | CURRENT — FORBIDDEN |
| `SEC-023` | Microphone/ultrasonic or camera localization in safety/location pipeline | CURRENT — FORBIDDEN |
| `SEC-024` | Photo-library EXIF scraping as covert/location fallback | CURRENT — FORBIDDEN |
| `SEC-025` | Public Find-My-style crowdsourced tracking network | CURRENT — FORBIDDEN |
| `NO-001` | Camera visual localization | CURRENT — FORBIDDEN |
| `NO-002` | Microphone/ultrasonic localization | CURRENT — FORBIDDEN |
| `NO-003` | Custom absolute raw-GNSS pseudorange position solver | CURRENT — FORBIDDEN |
| `NO-004` | Constant normal Wi-Fi scan hack as Location-OFF locator | CURRENT — FORBIDDEN |
| `NO-005` | DIY carrier tower triangulation | CURRENT — FORBIDDEN |
| `NO-006` | Fake bus/train/car certainty from broad activity recognition alone | CURRENT — FORBIDDEN |
| `NO-007` | Long-duration pure inertial exact-position presentation | CURRENT — FORBIDDEN |
| `NO-008` | Barometer dependency | CURRENT — FORBIDDEN |
| `NO-009` | Permanent normal 1-second GPS/network updates | CURRENT — FORBIDDEN |
| `NO-010` | Blind duplicate-every-network-packet strategy | CURRENT — FORBIDDEN |
| `NO-011` | Root/custom ROM requirement | CURRENT — FORBIDDEN |
| `NO-012` | Family/parent car tracking | CURRENT — FORBIDDEN |
| `NO-013` | Brick Lost Phone mode duplicating Google Find Hub | CURRENT — FORBIDDEN |
| `NO-014` | Fake AI/ML precision / invented coordinates or unsupported labels | CURRENT — FORBIDDEN |

## Apparent conflicts checked

### Witness Mesh vs public crowdsourced tracking

No contract conflict.

Current Witness/Ground Network is explicitly private, family-authorised/authenticated and constrained to Brick's private infrastructure. It does not permit a public Find-My-style or crowdsourced fingerprint network.

`SEC-025`, `ATL-039` and `NO-013` therefore remain forbidden.

### Maintenance/Shizuku vs generic shell

No contract conflict.

The Maintenance Console and Shizuku enhancement remain typed/capability-gated. The latest master plan explicitly preserves `never run arbitrary shell` semantics.

`SHZ-005` remains forbidden.

### Emergency evidence/fall vs microphone/camera

No contract conflict.

Emergency Evidence Bundle may preserve approved sensor/GNSS/radio/connectivity/power/health evidence, but the final checklist explicitly excludes microphone/camera content.

`SEC-023`, `NO-001`, `NO-002` remain forbidden.

### Fast Live / SOS vs permanent 1-second tracking

No conflict.

SOS may temporarily target ~1-second critical updates and Live Track/faster movement may temporarily use aggressive cadence, but normal operation must not become permanent 1-second GPS/networking.

`NO-009` remains forbidden.

### OneMap/provider enrichment vs external analytics

No conflict.

A necessary map/geocode provider is not permission to add unrelated analytics/marketing tracking. Current OneMap requirements explicitly minimize provider data and keep credentials/backend enrichment controlled.

`SEC-015` remains forbidden.

## Result

- Forbidden rows recovered: 24
- Forbidden rows superseded/re-enabled: **0**
- Forbidden rows currently unexplained: **0**

Phase 8B onward must prove these are absent in actual source/build/deployment where applicable; Phase 8A only establishes that they remain part of the current contract.
