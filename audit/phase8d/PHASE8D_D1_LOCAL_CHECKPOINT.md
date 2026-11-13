# Phase 8D D1 audit batch — local verification checkpoint
Baseline beta488b34f2f2f807c107b4c1e9eee9dccff717011f; work branch audit/phase8d-d1-qualification.
Phase8D NOT PASS. This is a source/local checkpoint; hosted exact-source results are recorded separately when available.

Findings recorded on GitHub BEFORE corrections: P8D-068 object read integrity;069 ignored conditional writes;070 beta diagnostic state blocks DO recovery;071 supported20-point batch hits native D1 compound-SELECT limit;072 direct-history revoke race. P8D-002 full operational recovery P1 remains open.
- P8D-068/069: expanded baseline reproduction9 failures/3 controls; corrected suite12/12 actual Miniflare D1 cases.
- P8D-070: native real beta DO export fails after readiness probe; corrected bounded, validated diagnostic exclusion preserves live challenge and still rejects other unknown/malformed state.
- P8D-071: actual signed20-point route500 with D1 too-many-compound-SELECT terms; changed to VALUES-derived SELECT with active fence, now normal/partial-group retry passes.
- P8D-072: exact revoke interleaving previously returned401 but inserted1 history row; transactional history predicate now leaves0.
- Actual signed Worker/native D1 ACK tests: history commit failure yields503/no ACK; duplicate lost-response retry remains immutable; partial second10-row group has no20-point range ACK and retry fills holes; wrong signer denied; exact revoke denied/no history.
- Bounded internal recovery: primary41 tables +diagnostics4; captures history/object chunks/metadata, destroys actual source persistence, restores fresh stores and separate beta DOs, verifies original object age/content, historical record, command expiry, fresh auth/nonces and independent scheduler reconstruction; restart preserves revocation. Malformed stores/rows/BLOBs/object digests/bounds refuse before writes; interrupted target is explicitly partial and rejects in-place retry.
- Existing beta auth/map/history/WS integration, original production native trust boundaries and original38-table/R2/DO recovery regression were run; per-file raw receipts are adjacent. Historical R2 tests remain labelled R2, not proof of D1 replacement.
- TypeScript, parent asset build, JS syntax and diff whitespace checks passed. Existing P8D-021/P8D-024 native SQLite route tests and original ACK/Queue fault matrix passed after invoking their required bundles.
- Test harness initialization/conversion and one wrong CLI invocation were corrected; these are not product failures/passing coverage. Recovery test may print a Miniflare RPC disposal warning while completing assertions; no production resource-leak claim or suppression.

Source changes are confined to backend/recovery and synthetic tests/workflow. New recovery code has no production HTTP/scheduled call and requires isolated-restore mode. No Cloudflare resource was provisioned/reset/deployed, no family data accessed, no credentials rotated, no APK rebuilt. The original formal audit and beta branches remain separate.
Read PHASE8D_D1_RECONCILIATION_2026-11-05.md for all19 sections, exact supersession boundaries, recovery policy and proposed named isolated cloud drill. All525 canonical requirement IDs/classifications are retained; a14-ID partial evidence supplement is navigation, not acceptance or owner assignment.

Next: hosted exact-candidate CI; inspect results and update finding scope. Then scheduled/private off-platform D1 backup integration/PITR, retention-policy alignment, durable failed-work visibility/async isolation, exact deployed candidate metadata, cloud drill and per-ID ownership/review. Actual browser/phone/72h evidence stays unverified. No final PASS artifact.

