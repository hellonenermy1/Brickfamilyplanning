# Brick V1 Phase 3 — Controlled Early Start

Date: 2026-11-01

User decision: Phase 2 real OPPO/ColorOS qualification cannot be performed until Monday. Continue Phase 3 development now rather than idle, without weakening Phase 2 acceptance truth.

## Sequencing rule for this exception

Phase 3 **development may proceed on top of the frozen Phase 2 staging source**, but:

- Phase 2 remains NOT ACCEPTED until its real Android/OPPO + hosted/live gates pass;
- Phase 3 must not be marked ACCEPTED while Phase 2 remains open;
- no Phase 3 runtime code is merged to canonical `apk-download`/`main` before the dependency and Phase 3 gates are satisfied;
- if Monday's Phase 2 OPPO test exposes a defect, repair/rebase Phase 3 deliberately rather than hiding the dependency.

## Phase 3 Android base

Frozen Phase 2 Android base:

`9d1d04532abc52b679075fe2e330c3d2daafab3b`

Planned staging branch:

`v1-p3-motion-positioning-android`

## Phase 3 owned scope

Primary requirements include:

- DR-001/002/003;
- PF-001..006;
- MAG-001..005 (Phase 3 portion);
- LAND-001..003;
- ODO-001..007;
- Phase-3 portions of POS-003/004/005, FILT-004/005/006/007, EVD-003/004 and ARR-002.

## Honesty boundary

Brick currently ships no routable map asset on Android. Phase 3 must not claim wall/barrier or pedestrian-only/vehicle access enforcement until actual map geometry/properties are available locally. A learned-route graph and/or cached private-map route graph may constrain known paths, but unknown map coverage is not treated as proof that a path is impossible.

## Acceptance dependency

Phase 3 exit gate remains controlled GNSS-loss journeys demonstrating:

- growing uncertainty;
- route/turn elimination;
- stationary drift suppression;
- clean recovery when precise location returns.

Physical-device evidence remains required before acceptance.
