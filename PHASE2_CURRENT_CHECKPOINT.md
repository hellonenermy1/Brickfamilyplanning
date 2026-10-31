# Brick V1 Phase 2 — Current Checkpoint

Date: 2026-10-31
Status: **SOURCE IMPLEMENTED + FURTHER HARDENED / HOSTED CI BLOCKED / NOT ACCEPTED**

This file is the authoritative exact-head checkpoint when older long-form Phase 2 reports contain an earlier SHA snapshot. It does not replace their historical evidence; it updates the current pair and latest hardening only.

## Exact paired staging heads

- Cloud `v1-p2-evidence-cloud` / PR #6: `c98d8aad6f63699984bd88394539b7c78efcab0b`
- Android `v1-p2-evidence-android` / PR #7: `82ac7f6b0279ac6a3740bc788515bd65af0478f4`
- Both PRs remain draft/open/unmerged.
- Cloud CI pins the exact Android SHA above; do not replace it with a moving branch ref for acceptance.

## Latest Android integrity/reliability hardening

### Device-bound evidence journal

Phase 2 DB schema is version 3 with singleton `evidence_owner`. Normal enqueue uses `appendNew(deviceId, epoch, observation)` so journal owner binding, sequence allocation and encrypted insert occur transactionally. Drain calls `ensureDeviceOwner(deviceId)` before reading pending evidence.

A real paired-identity change quarantines old unsent evidence before rebinding; old evidence receives zero upload attempts under the new child identity and fresh evidence for the new identity can continue without manual cleanup. Local persistence failures are classified as `JOURNAL_FAILURE` and use bounded persistent-failure backoff.

### Canonical API-origin boundary

`EvidenceApi.normalizeBase()` is now the single HTTPS-origin validator used before evidence is journaled and again before transport. Brick refuses to create a low-priority evidence backlog when stored `apiBase` is HTTP, malformed, contains userinfo, a non-root path, query or fragment.

`EvidenceApi.sendBatch()` also validates canonical v4 device identity, caps response/error-body reading at 65,536 bytes and disconnects the HTTP connection in `finally`.

Instrumentation source includes:

- `testPairingChangeQuarantinesOldPendingEvidenceBeforeNewIdentityCanUpload`
- `testCorruptApiOriginCannotCreateUnsendableEvidenceBacklog`

## Cloud CI pairing

Cloud workflow `v1-phase2-evidence-ci.yml` pins Android `82ac7f6b0279ac6a3740bc788515bd65af0478f4` and statically checks the DB-v3 owner boundary, device-bound append, owner verification before drain, canonical API-origin validation, bounded Android response reading, journal-failure handling and both pairing/origin regression sources in addition to all prior Phase 2 Cloud and retained Phase 6 gates.

## Hosted execution state

Latest run for the exact Cloud head:

- run `41217632543`
- head `c98d8aad6f63699984bd88394539b7c78efcab0b`

Observed:

- Cloud protocol/persistence/regression: failure before steps, `runner_id: 0`, empty runner name, `steps: []`;
- Android compile/lint/dependency-lock: failure before steps, `runner_id: 0`, empty runner name, `steps: []`;
- Android instrumentation: skipped.

No source step executed. This is an external hosted-runner failure, not a source pass and not evidence of source failure.

## Evidence level

Earlier local protocol/persistence/signed-route checks and targeted race/DER checks remain valid only for what actually executed. The current device-owner/API-origin Android hardening has been source-reviewed and exact-commit verified, but has not yet received a real Android SDK compile/emulator run.

Do not mark Phase 2 `CI_VERIFIED`, merge either PR, deploy as accepted V1, or unlock Phase 3 acceptance until the exact paired heads receive real execution and the complete Phase 2 exit gate passes.
