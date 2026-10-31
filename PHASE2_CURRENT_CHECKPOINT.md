# Brick V1 Phase 2 — Current Checkpoint

Date: 2026-10-31
Status: **SOURCE IMPLEMENTED + FURTHER HARDENED / HOSTED CI BLOCKED / NOT ACCEPTED**

This file is the authoritative exact-head checkpoint when older long-form Phase 2 reports contain an earlier SHA snapshot. It does not replace their historical evidence; it updates the current pair and latest hardening only.

## Exact paired staging heads

- Cloud `v1-p2-evidence-cloud` / PR #6: `e8a12f14894f3dca13a9dcb97d16c1a2c9a1b592`
- Android `v1-p2-evidence-android` / PR #7: `8bc21222a327e15e24503a1ec5ad20c5a4cbcdf7`
- Both PRs remain draft/open/unmerged.
- Cloud CI pins the exact Android SHA above; do not replace it with a moving branch ref for acceptance.

## Latest Phase 2 hardening

A source review found that the encrypted evidence journal was not durably bound to the paired Brick `deviceId`. If pairing changed while low-priority evidence was still offline, old records could otherwise be uploaded under the new child identity.

Android Phase 2 now uses evidence DB schema version 3 with a singleton `evidence_owner` table. Normal enqueue calls `appendNew(deviceId, epoch, observation)`, which binds journal owner, allocates sequence and inserts the encrypted record inside one SQLite transaction. Drain calls `ensureDeviceOwner(deviceId)` before reading pending evidence.

On a genuine paired-identity change:

1. old `acked=0` evidence is moved to retained quarantine (`acked=2`);
2. the journal is rebound to the new canonical v4 device ID;
3. old evidence receives zero upload attempts under the new identity;
4. fresh evidence for the new identity can continue without manual database cleanup;
5. identity-quarantine count/time are retained in local diagnostic preferences.

Local journal failures are now distinguished as `JOURNAL_FAILURE` and use the existing bounded persistent-failure backoff rather than being misclassified as remote ACK failure.

Instrumentation source includes `testPairingChangeQuarantinesOldPendingEvidenceBeforeNewIdentityCanUpload`, which asserts child-A pending evidence is quarantined with zero network calls after switching to child B, while fresh B evidence can subsequently upload.

## Cloud CI pairing

Cloud workflow `v1-phase2-evidence-ci.yml` now pins Android `8bc21222a327e15e24503a1ec5ad20c5a4cbcdf7` and statically checks the DB-v3 owner table, device-bound append, owner verification before drain, journal-failure handling and the re-pair regression source in addition to all prior Phase 2 Cloud and retained Phase 6 gates.

## Hosted execution state

Latest run for the exact Cloud head:

- run `41216812499`
- head `e8a12f14894f3dca13a9dcb97d16c1a2c9a1b592`

Observed:

- Cloud protocol/persistence/regression: failure before steps, `runner_id: 0`, empty runner name, `steps: []`;
- Android compile/lint/dependency-lock: failure before steps, `runner_id: 0`, empty runner name, `steps: []`;
- Android instrumentation: skipped.

No source step executed. This is an external hosted-runner failure, not a source pass and not evidence of source failure.

## Evidence level

Earlier local protocol/persistence/signed-route checks and targeted race/DER checks remain valid only for what actually executed. The new device-identity journal binding has been source-reviewed and raw-commit verified, but has not yet received a real Android SDK compile/emulator run.

Do not mark Phase 2 `CI_VERIFIED`, merge either PR, deploy as accepted V1, or unlock Phase 3 acceptance until the exact paired heads receive real execution and the complete Phase 2 exit gate passes.
