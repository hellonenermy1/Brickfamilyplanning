# Phase 8D continuation — immutable safety retries, priority order, release proof and retention

**IN PROGRESS / NOT PASS.** User-facing date5November2026 Singapore. Continued private `v1-p8d-backend-deep-audit` at28d8a73d82cb99c09ac3f3bf8bc9bff3912fd571. No restart, Android/source APK edit, schema migration, production deployment, Cloudflare data/resource write, repository policy change or family-data access.

## Previous queued source CI resolved

[Run41862396858](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41862396858) now reports overall completed SUCCESS for executable9b2601d9742c02bf55e45f5a2ddaf40e2661a916. Source job126687499457 has66/66 completed-success steps; actual source log fetched and all24 P8D-057–060 checks, native safety route, existing regressions and SQLite schema/destructive38-table restore passed. Deployment contract job126687500018 completed successfully. Backup job126687499802 list metadata briefly still reported in_progress/null although all7 steps, including Complete job, were completed-success; retain that metadata caveat rather than invent a per-job conclusion. Current new code still needs its own exact hosted CI.

## P8D-061 — duplicate identity includes immutable persisted incident content

Confirmed P2. Baseline falsely acknowledged same-device/same-kind UUID with changed captured timestamp, coordinates, accuracy or detail, despite retaining the original row. Eight signed negative cases reproduced.

Shared D1 identity classification now compares device, kind, captured timestamp, normalized coordinates/accuracy and semantic JSON detail. Iterative JSON comparison ignores object-key order, preserves array order/type and avoids recursive stack limits. Existing row remains unchanged on409 conflict. Fall early duplicate path and ordinary safety ignored-insert path share the same check; malformed stored detail fails closed. No raw payload/key value is logged or added to public assets.

Exact Android retries reuse persisted envelope bytes; test fixtures now hold createdAtMs fixed rather than creating a fresh timestamp for a supposedly exact retry. Reordered JSON keys remain a valid semantic duplicate. This is immutable incident-content identity, not byte-for-byte signature equality or uniqueness of the diagnostic eventSequence.

## P8D-062 — preserve legitimate priority-delivered falls

Confirmed P2. Baseline rejected an unseen valid older fall UUID after a higher fall sequence, including after DO reconstruction with a stored maximum.

Frozen source reviewed without editing:

- SafetyOutbox.pending SQL: ORDER BY priority DESC,id ASC.
- SafetyDispatcher gives SOS priority200 and HIGH fall100, with other events at lower priorities.
- Envelope includes signed UUID and sequence; counter allocation is a preference read/increment/commit without a visible enclosing synchronization boundary. This is a source-level concurrency concern, not a reproduced physical-device finding.

Therefore global sequence arrival order and globally unique allocation cannot be assumed for frozen Android. A new unique-sequence ledger would risk rejecting valid queued incidents; none was introduced. The fall route no longer uses the DO maximum to reject an unseen UUID. Existing positive sequence, signed-key ownership, revoked identity, kind/schema, UUID uniqueness/content checks and captured-time replay window remain. DO maximum still advances monotonically for diagnostics. Health/location strict ordering is unchanged.

A literal signed replay retains its UUID/content and is idempotent. Modifying the signed UUID/content requires a new valid device signature; this does not certify honesty of a compromised enrolled device. Client counter serialization/physical priority-drain testing remains a separately scoped follow-up, not a silently modified Phase8C closure.

## P8D-063 — structured fail-closed release acceptance

Confirmed P1 future-release control gap; no production exploit/deployment observed. Three invalid acceptance texts (qualified pending PASS, quoted example alongside NOT PASS, fenced example) passed the old substring grep.

Deployment preflight now calls `verify-phase8d-release-acceptance.mjs`. It retains manual-only workflow and separate accepted branch, and additionally requires:

- Real tracked final JSON record and one exact, unquoted/unfenced Markdown FINAL STATUS: PASS verdict.
-19 unique verified section records, explicit supported exclusion reasons, hash-bound tracked regular-file evidence, zero unresolvedP0/P1 and zero unmapped/unverified applicable requirements from525.
- Tested source commit is an ancestor; only permitted audit documents/release-evidence may differ afterward. Operational JSON, code, workflow, schema, CSV control inventory and scripts cannot change after testing.
- Authenticated actual GitHub Actions run: same repository/source SHA/workflow, exact current attempt, completed-success run and all required source jobs completed-success. Full paginated job inventory rejects missing/skipped/failed/duplicate/incomplete jobs; API denial or inconsistent metadata fails closed.

Read-only Actions permission/full checkout added for that verification. GitHub token never reaches Cloudflare or output.38 synthetic parser/API cases pass, including pagination and early rejection before network. Running real CLI now refuses because the final structured acceptance record is absent. **No genuine final-PASS record was created.** This structurally binds reviewed evidence/source/CI; it cannot manufacture truth of manual live evidence or replace branch protections/review.

Contract and record fields: `PHASE8D_RELEASE_ACCEPTANCE_CONTRACT.md`.

## P8D-064 — retention must outlast replay validity

Confirmed P2. At minimum30-day safety retention, a valid clock-ahead captured timestamp could remain inside its replay window after cleanup erased the UUID by server-received age. Native SQLite reproduced premature deletion.

Cleanup now requires both the configured server-time retention period and30-day captured-time replay window to have expired. Exact captured-time boundary remains retained because validation accepts equality. Tests cover future skew, inclusive boundary, deletion once fully expired, another device365-day policy and actual signed retry remaining duplicate with no new Queue/DO publication. Ordinary timestamps/per-device policy remain effective; no new permanent tombstone/table introduced.

## Current verification

14 new actual signed Worker/DO/native SQLite retry checks pass (eight content changes, semantic-key equivalence, two array order/type cases, two reordered fall cases and stale-window denial).38 release-verifier cases pass. Retention boundary suite and prior retention regression pass. TypeScript, source release/config contracts and native workerd integration pass. A broad source-build run executed55 command groups successfully with explicit CLI/install/build/native-step omissions recorded in `PHASE8D_LOCAL_REGRESSION_2026-11-05.json`; this is not a full local hosted-CI replacement. Earlier24 safety/evaluator cases remain passing.

Exact new hosted CI and fresh read-only Cloudflare outcome must be attached after commit. Real full Cloudflare D1+R2+DO recovery/cutover, live ACK/Queue/DLQ, deployed provenance/bindings/Access, ownership/rates/WS, retention/log/rotation, rollback and repository policy remain open. The prior inspected live run41839919454 attempt3 failed; do not relabel it from source tests. **No final Phase8D PASS; no8E/8F.**


## P8D-065 local retest and expanded history detector

Production release key grep matched marker-only synthetic source controls, reproduced by filenames only (no values). Replacement keeps key-container filename refusal and detects actual private-key material, escaped-newline/indented/encrypted blocks; marker-only/public-key controls no longer false-block. Seven focused cases and current tracked-source scan pass locally. Shared history detector now covers those encoded newline/indent cases too. Expanded local reachable-history scan at HEAD761655c5:2239 commits/2442 unique blobs/20,607,934 bytes;11 matching blobs, all known weak-verifier marker category among checked formats. Evidence `PHASE8D_GIT_HISTORY_ESCAPED_KEY_SCAN_2026-11-05.json`. This is not absence of arbitrary encoded credentials or rotation proof. No final acceptance record created, no deploy. Hosted exact-SHA verification pending for this follow-up.


## Fresh live read-only attempt4 — still NOT PASS

[41839919454 attempt4](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41839919454/attempts/4) reran the same old attestor source d74b30d, not a deployment. Logs fetched for metadata126703360991, parent126703361111, D1 catalog126703361268 (04Nov16:24Z =05Nov00:24Singapore): prod active/latest still missing HISTORY/MAPS/EVENTS plus four parent rate bindings; dev missing geocode/commute rates; expected Queue/DLQ absent from paginated account inventory; deployed source annotations unavailable; R2 lifecycle and Access policy read permissions blocked. D1 catalog401 requires D1 Read. Parent12 probes:9 expected,2 prod local-login redirects inconclusive,1 public prod login FAIL. No family response bodies/cookies/user rows, resource/SQL writes or secret values accessed. These live blockers were freshly reconfirmed; source changes did not repair deployment.

Next user/admin unblock remains scoped Workers R2 Storage Read, Access Apps & Policies Read and D1 Read on the dedicated existing audit token/account; no token value in chat and no substitution with broad deployment credentials. Only after read proof can infrastructure/Access repair and isolated recovery/cutover be made concrete. Full Cloudflare recovery, Queue/ACK/DLQ, live retention/rollback and required repository policies remain open. **8D NOT PASS.**
