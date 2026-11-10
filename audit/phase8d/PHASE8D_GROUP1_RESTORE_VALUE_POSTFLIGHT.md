# Group 1 — actual restore value postflight

Recorded before remediation, 10 November 2026 Singapore. Baseline: `176e65f5676db0dbd539fdda771d4e156f82fbcc`. Requirement: OPS-003; section 8D.16; supporting gap under existing P8D-002 P1 OPEN.

## Reproduction and impact

`restoreCardfreeD1` checks table row counts, excluded-state emptiness and foreign keys, but its actual success path does not compare all recovered values with the authenticated snapshot. The existing populated-recovery test has an independent exact-value oracle; that oracle is not a runtime postcondition.

The native test `scripts/test-phase8d-restore-value-parity.mjs --baseline-only` compiles the exact baseline recovery source and introduces controlled target drift after the data batches. Same row counts and valid foreign keys allow modified device names, place/configuration values, authorization flags, evidence values, equal-length object bytes, retention timestamps and diagnostic payloads to escape the old postflight. This is an isolated fault reproduction, not a deployed incident, authenticated-source compromise or proof that correct complete quiescence permits unrelated writes.

The gap matters while preparing the real isolated recovery drill: target verification must reject changed data, not rely on row counts. Complete writer quiescence is still independently required; a final value check cannot prevent a mutation after that check or establish cross-database atomicity.

## Required correction

- Compare every restored row and column in both stores with the authenticated capture, including object BLOB bytes and original timestamps.
- Preserve the documented normalization of equivalent device keys and retirement of pending commands; completed commands must retain their original results.
- Read values in bounded pages and reject missing, extra, malformed or altered rows without logging their contents.
- Treat any mismatch as an unqualified partial target; discard it and retry only into a fresh target.
- Keep capture wire formats, migrations, deployed routes and production installation unchanged.

Status at recording: SOURCE REPRODUCED; correction and regression verification pending. Cloud recovery and Group 1 acceptance remain open.

## Corrected and locally verified

The actual card-free restore now checks every recovered row/column as a multiset, including original object bytes/timestamps and diagnostic values. Reads are limited to64 rows and a conservative2MiB value envelope; a2.4MiB diagnostic fixture proves pagination. The base restore records one retirement timestamp and shares the existing pending-command policy with the postflight expectation, preserving completed results and canonical public-key normalization. Capture formats/migrations/routes and the90-file production runtime projection are unchanged.

The ten baseline corruptions are all refused after correction;12 focused native checks pass, including healthy populated parity and the byte envelope. The complete local card-free workflow run steps pass (typecheck, assets, inventories, admission/transport, operators, crypto/archive/monitor, schema/postflight, encrypted destruction/fresh restoration, ACK/retention/scheduler and legacy trust/recovery regressions). Evidence: PHASE8D_GROUP1_RESTORE_VALUE_POSTFLIGHT_EVIDENCE.json. Known native disposal warnings are retained.

This is SOURCE/LOCAL VERIFIED. Live writer control, cloud resource/SQL limits, isolated cloud interruption/rollback and operational RTO/RPO remain unqualified. Value comparison does not establish complete DDL equivalence, cross-store atomicity or prevent writes after postflight. Group1/P8D-002 remain open.
