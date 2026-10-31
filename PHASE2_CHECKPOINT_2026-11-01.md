# Brick V1 Phase 2 continuation checkpoint — 2026-11-01

User request: continue Phase 2 from the existing work without restarting.

## Exact staging pair at checkpoint

- Cloud `v1-p2-evidence-cloud`: `1d880b703dd5d0c5f581926426a0db29e6c67b8b`
- Android `v1-p2-evidence-android`: `9d1d04532abc52b679075fe2e330c3d2daafab3b`
- Cloud PR #6: draft/unmerged
- Android PR #7: draft/unmerged
- Latest checked hosted Phase 2 run: `41221221445`

Phase 2 remains **NOT ACCEPTED**. No Phase 2 source was merged into canonical `main` or `apk-download`. Phase 3 was not started as accepted work.

## Android hardening added in this continuation

1. Quarantine is now bounded automatically instead of growing forever:
   - rows older than 30 days by original record age are eligible for purge;
   - hard ceiling of 2,048 quarantine rows;
   - cleanup is rate-limited to a six-hour maintenance cadence;
   - pending/deliverable evidence is never age-purged;
   - sequence allocator state is retained, so cleanup cannot reuse a prior evidence sequence;
   - lifetime purge counter and last-cleanup time are retained in health preferences.
2. Health telemetry now runs evidence maintenance before reading evidence stats so the heartbeat reports post-maintenance counts rather than a stale quarantine count.
3. Health telemetry now includes quarantine-cleanup age and total purged-record diagnostics.
4. Exact ACK JSON parsing was hardened. A deletion-authorizing ACK now requires real integral JSON numbers for protocol/epoch/sequence within Brick wire bounds. String-coerced numbers, fractional numbers and out-of-range values are rejected.
5. New instrumentation source covers:
   - expired quarantine auto-purge without sequence reuse;
   - valid exact integral ACK parsing;
   - string/fractional/out-of-range ACK fields failing closed.

## Cloud hardening added in this continuation

1. The dedicated `test-phase2-evidence-link-integrity.mjs` test is now actually executed by Phase 2 CI. Previously the file existed but the workflow did not run it.
2. The real deployment workflow now requires all three Phase 2 Cloud harnesses before provisioning/deployment:
   - core protocol/persistence/idempotency;
   - batch-link integrity;
   - signed HTTP evidence route.
3. Deployment smoke testing now distinguishes:
   - invalid/non-v4 evidence path -> `400`;
   - syntactically valid fake v4 identity that is not paired -> `401` or requester rate-limit `429`.
   This prevents a correct worker from failing verification because path validation happened before auth.
4. D1 evidence identity was strengthened structurally:
   - `evidence_records` has an exact `(device_id, record_id, epoch, sequence)` unique key;
   - fresh `evidence_batch_records` tables have a composite foreign key to that full identity.
5. Migration reruns are also protected. Because `CREATE TABLE IF NOT EXISTS` cannot retrofit a stronger FK onto an evidence table created by an earlier interrupted Phase 2 setup, schema 008 now installs idempotent `BEFORE INSERT` and `BEFORE UPDATE` identity triggers. An already-created older Phase 2 table therefore receives the same exact-link rule on rerun instead of silently remaining weaker.
6. The link-integrity harness enables SQLite foreign keys to mirror D1, proves a fresh-schema mismatch is rejected, proves the rerun-safe trigger still rejects the mismatch with FK enforcement disabled, then deliberately removes only the test triggers to manufacture legacy corruption and confirms Brick's application-level retry validation still detects it before another raw R2 write.
7. Application-level batch-link readback validation remains in place as defense in depth even with the stronger database constraints/triggers.

## Reliability decisions preserved

- Evidence remains strictly lower priority than SOS, safety events, durable live-location backlog and crash reports.
- Healthy evidence catch-up stays fast; persistent Core backlog defers evidence; persistent upload/ACK/journal/identity failure uses bounded backoff.
- Quarantine is diagnostic retention, not an ACK and not a second infinite durable backlog.
- Permanent evidence conflicts cannot block later evidence indefinitely.
- Re-pairing cannot upload old pending evidence under the new device identity.
- No malformed server ACK may authorize local evidence deletion.
- Setup reruns must not silently produce a weaker evidence schema than a fresh install.
- Live-location V2 remains unchanged; Phase 2 evidence remains a separate BREV v1 stream.

## Verification truth

Latest checked hosted run `41221221445` again did not provide source execution:

- Cloud protocol/persistence/regression: failed before source steps;
- Android compile/lint/dependency-lock: failed before source steps;
- Android instrumentation: skipped.

This continues the existing hosted-runner infrastructure blocker. It is neither a source pass nor evidence of a source defect.

Earlier local Cloud/protocol/signed-route and targeted race/signature checks remain valid only for the exact invariants and earlier heads that actually executed. The exact checkpoint above includes newer quarantine-retention, strict-ACK, workflow/deploy-gate, composite-FK and rerun-safe trigger changes that still require real execution.

## Required continuation

1. Keep PR #6 and PR #7 draft/unmerged.
2. When a GitHub runner actually executes jobs, require the exact paired heads to pass Cloud typecheck, all three Phase 2 Cloud harnesses and retained Phase 6 regressions.
3. Require the exact pinned Android head to pass dependency-lock verification, app/instrumentation compilation, lint and emulator instrumentation.
4. Repair real failures rather than weakening gates.
5. Only after exact paired execution passes should canonical merge/post-merge verification be considered.
6. Live Cloudflare D1/R2/schema/retention deployment verification is still required before a live-integration claim.
7. Phase 2 must remain NOT ACCEPTED until the full dummy-provider durability -> signed upload -> durable server acceptance -> exact ACK -> local removal path is proven without degrading Brick Core.
