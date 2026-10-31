# Brick V1 Phase 2 — Current Checkpoint

Date: 2026-10-31
Status: **SOURCE IMPLEMENTED + FURTHER HARDENED / HOSTED CI BLOCKED / NOT ACCEPTED**

This file is the authoritative exact-head checkpoint when older long-form Phase 2 reports contain an earlier SHA snapshot. It preserves their historical evidence and updates only the current pair/latest hardening.

## Exact paired staging heads

- Cloud `v1-p2-evidence-cloud` / PR #6: `df0824ce7f8f0c863960b267067f721470e4af5a`
- Android `v1-p2-evidence-android` / PR #7: `c077a4a5bc7805dda81a55db52c33f73f0050626`
- Both PRs remain draft/open/unmerged.
- Cloud CI pins the exact Android SHA above; do not replace it with a moving branch ref for acceptance.

## Current Android Phase 2 hardening

- evidence DB v3 singleton `evidence_owner` binds durable evidence to the paired child identity;
- pairing change quarantines old pending evidence before rebinding, so old child-A evidence cannot upload under child B;
- canonical HTTPS API-origin validation runs before enqueue/drain and again in transport;
- evidence ACK/error response body is capped at 65,536 bytes;
- dispatcher independently validates the exact ACK identity set before local deletion;
- low-priority evidence defers at least 60 seconds behind persistent Brick Core backlog while healthy catch-up remains 2 seconds;
- persistent transport/auth/ACK/journal/config failures use bounded exponential backoff up to 15 minutes;
- authenticated server HTTP 409 is typed as `EvidenceUploadConflict`;
- multi-record 409 is isolated record-by-record so valid neighboring evidence can ACK and only independently conflicting records move to retained quarantine;
- conflict/re-pair/retry diagnostics are included in health telemetry.

## Current Cloud Phase 2 hardening

- signed route explicitly maps only `EvidenceConflict` to HTTP 409; generic persistence failures remain 503;
- signed-route integration source proves changed durable record content returns 409 with no additional D1 record/batch or R2 object growth;
- durable batch retry no longer trusts duplicated `evidence_batch_records.epoch/sequence` for ordering;
- retry joins batch links to authoritative `evidence_records`, orders by the authoritative record epoch/sequence and verifies every link epoch/sequence exactly matches the referenced durable record;
- a corrupted durable link therefore produces `EvidenceConflict`, never a false exact ACK;
- the mandatory `test-phase2-evidence.mjs` persistence harness now deliberately corrupts one batch-link epoch, requires conflict before another raw write, restores the link and proves exact duplicate ACK recovery;
- a focused `test-phase2-evidence-link-integrity.mjs` helper records the same invariant independently.

## Schema audit decision

The active Phase 2 evidence tables were reviewed for keys, foreign keys and replay/index use. No new schema migration was added for the duplicated batch-link identity because initial writes already hard-insert the correct values and the durable readback now explicitly verifies them. This avoids introducing a staging migration/table-rebuild solely for a corruption condition that can be detected safely at readback.

Phase 4/5/6/7 placeholder tables (`atlas_models`, witness/ground receiver, commands, refined history) remain foundations only. Their later semantic constraints were deliberately not guessed or frozen in Phase 2 because they are not active evidence-runtime paths yet.

## Hosted execution state

Latest run for the exact Cloud head:

- run `41218888600`
- head `df0824ce7f8f0c863960b267067f721470e4af5a`

Observed:

- Cloud protocol/persistence/regression: failure before steps, `runner_id: 0`, empty runner name, `steps: []`;
- Android compile/lint/dependency-lock: failure before steps, `runner_id: 0`, empty runner name, `steps: []`;
- Android instrumentation: skipped.

No source step executed. This is an external hosted-runner failure, not a source pass and not evidence of source failure.

## Evidence level

Earlier local protocol/persistence/signed-route checks and targeted race/DER checks remain valid only for what actually executed. The current Android conflict isolation and latest Cloud batch-link integrity hardening have been source-reviewed/exact-commit verified but have not received the final real hosted execution.

Do not mark Phase 2 `CI_VERIFIED`, merge either PR, deploy as accepted V1, or unlock Phase 3 acceptance until the exact paired heads receive real execution and the complete Phase 2 exit gate passes.
