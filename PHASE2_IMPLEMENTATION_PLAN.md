# Brick V1 Phase 2 — Implementation Plan

Status: ACTIVE
Date: 2026-10-31

## Implementation branches

Phase 2 runtime work is intentionally split by canonical runtime ownership:

- Android implementation branch from `apk-download`: `v1-p2-evidence-android`
- Cloudflare/backend implementation branch from `main`: `v1-p2-evidence-cloud`

The branches are temporary. They are not production branches and do not change the release qualification state.

## Android deliverables

1. `EvidenceObservation` canonical immutable data model.
2. Enumerated evidence provider, family, capability, health and sampling states.
3. Independence-group identifier required on every observation.
4. `EvidenceProvider` interface with capability/health/current sampling contract.
5. Central `EvidenceSamplingCoordinator` that maps Brick operating state to bounded provider cadence.
6. `EvidenceProtocol` v1 binary batch encoding/decoding with strict size/count limits.
7. Separate encrypted `EvidenceJournal` with exact ACK semantics, quarantine of corrupt rows, stats and restart-safe persistence.
8. `EvidenceDispatcher`/network path below safety/live-location priority.
9. Dummy provider used only for deterministic verification, never silently enabled as real location evidence.
10. Health counters for pending evidence and provider state, without treating optional unsupported capability as tracker failure.

## Cloud deliverables

1. Strict Evidence Batch v1 decoder and validator.
2. Signed device-authenticated `/api/device/:id/evidence` ingest endpoint.
3. Bounded payload/count limits before storage.
4. D1 idempotency/replay ledger for batch IDs/record IDs.
5. D1 evidence metadata/index tables.
6. R2 storage foundation for encrypted/compressed detailed evidence payloads/model snapshots where later phases need it.
7. Provider-health, Atlas metadata, commands, witness/receiver and refined-history foundation tables only; no Phase 4/5/6 algorithms yet.
8. Exact ACK response containing the accepted batch and record identities.
9. Deterministic Phase 2 tests for valid, duplicate, malformed, oversized, out-of-order/replayed and unknown-version evidence.
10. Queue/event separation so evidence processing cannot block live-location state updates or safety handling.

## Priority invariant

The service upload order remains:

1. SOS / safety outbox
2. crash/critical diagnostic path where already applicable
3. live/current location and durable location backlog
4. evidence learning backlog

Evidence may be delayed indefinitely by safety/location backlog. Safety/location must never wait behind evidence.

## Phase 2 closure rule

Phase 2 can be marked `CI_VERIFIED`/`INTEGRATION_VERIFIED` only after source/build/test evidence exists for both runtime sides. It does not become `DEVICE_VERIFIED` or `PRODUCTION_QUALIFIED` in this phase.
