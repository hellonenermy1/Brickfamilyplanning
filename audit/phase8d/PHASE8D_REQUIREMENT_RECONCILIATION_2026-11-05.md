# Phase 8D — canonical per-ID acceptance and scope reconciliation

**Phase8D IN PROGRESS / NOT PASS.** Continues clean `113f38c9f0751b17fdbb300019e76c43f68fad7c`, preserving executable58285064 and green source CI41952880677. No backend runtime, Android, APK, Cloudflare resource, repository policy or family data is changed by this batch.

## P8D-067 reproduced and corrected

The old final gate accepted requirements.total525/unmapped0/unverifiedApplicable0 without reading a per-ID ledger. Its synthetic positive fixture contained no requirement rows. A new missing-ledger negative case failed RED with `Missing expected rejection: actual requirement ledger absent`. This demonstrates an acceptance-control gap, not a production exploit or live deployment.

The verifier now reads the tracked JSON ledger and actual canonical CSV, checks the ledger hash and pinned baseline hash, and requires all525 exact unique IDs. Every row binds its original title, classification, profile and the digest of all seven canonical fields (including requirement text and authority). A counter cannot substitute for missing, duplicated, invented or downgraded requirements.

The new module checks reviewed source SHA, assigned implementation/test owners, reviewer/date, reviewed phase scope, mapped8D sections, status/disposition, evidence kind/path/hash and meaningful scope rationale. It refuses traversal, circular final-verdict/self evidence, candidate references passed as proof, unknown statuses at acceptance and unreadable/untracked files. Repeated per-ID proof reads are cached; the existing independent19-section checks remain. Any local ledger refusal happens before GitHub requests. Independent review still determines whether the content actually proves a claim; file hashes and reviewer strings are not authentication or truth.

A mandatory or forbidden item cannot be waived as unsupported. Optional unsupported needs rationale and explicit proof. A verified prohibition requires prohibition evidence, and a verified future interface requires interface-review evidence. These are scoped structural checks, not new hardware/capability claims.

## Phase boundaries: no circular dependency on future qualification

The Phase8 plan separates backend8D from portal8E, release/package8F and actual OPPO Phase9 qualification. Its8C exit allows device-only questions to proceed pending real-device verification. This batch re-read the backend exit/CI and subsequent phase boundary, rather than turning all525 global production criteria into prerequisites for closing8D.

The final ledger distinguishes:

| Scope/disposition | Required final phase-disposition evidence |
|---|---|
| PHASE8D / VERIFIED_FOR_8D | ACCEPTED, or explicitly proven optional VERIFIED UNSUPPORTED; correct mapped sections and reviewed appropriate evidence |
| CROSS_PHASE / CARRIED_FORWARD | Accepted/proven unsupported evidence from8A/8B/8C plus scope review; never silent inference from an old prose pass |
| CROSS_PHASE / DEFERRED | Reviewed plan-backed target8E/8F/9, nonblocking8D declaration, explicit reason, truthful nonaccepted progress status, owners/reviewer and scope evidence; cannot be an OPEN BLOCKER waved away |

The gate derives and checks deferred/carried counts as well as applicable verification gaps. Future-phase deferral is not acceptance, unsupported proof or production qualification. Current backend/security P0/P1 and applicable8D obligations cannot be waived by a scope label: the independent reviewer must assess the boundary and no-P0/P1 final gate still applies.

## Real draft ledger — every source row read, no invented passes

`release-evidence/PHASE8D_REQUIREMENTS_LEDGER.json` contains **525 exact rows** anchored to `audit/phase8c/PHASE8C_RECOVERED_525_REQUIREMENTS.csv`, SHA256 `1c435a1b481a27457a5848637160d40cab0620ef123f1a5c40d601e1ef913228`. All525 canonical current requirement descriptions were read for this scope-only review, including corrections with nonconsecutive IDs such as LOC1S-003/004, REACQ-003–009 and LIVE-001/003–005; no numeric-range reconstruction or title-only inference was used.

| Measure | Current draft |
|---|---:|
| Canonical rows / unique IDs |525 /525 |
| MANDATORY |485 |
| OPTIONAL-IF-SUPPORTED |14 |
| FORBIDDEN |24 |
| FUTURE-INTERFACE |2 |
| Draft PHASE8D scope |214 |
| Draft CROSS_PHASE scope |311 |
| Unmapped scope rows |0 |
| Rows with navigation to explicitly mentioning finding entries |23 |
| Rows with recorded, hash-checked evidence in this new ledger |1 |
| Unresolved final dispositions |525 |
| Rows without assigned implementation/test owners in this ledger |525 |
| Rows without complete per-ID acceptance review |525 |

The one evidence entry is OPS-003: actual local destructive workerd D1/R2/DO recovery at58285064/CI41952880677. Its scope and remaining live-cloud requirements are explicit. The rest of the existing source/CI artifacts remain intact and reusable; the counts above mean **not yet individually reconciled into this ledger**, not that525 features are newly broken or that earlier audit work has been reset.

Every row preserves source classification, a scope reason and explicit backend section links or cross-phase dependency. Cross-phase rows are not accepted or automatically deferred. All rows retain OPEN BLOCKER for *this per-ID acceptance worksheet*, unresolved disposition, null assigned owners/review and C1–C4 NOT REVIEWED prompts. Severity is UNASSESSED rather than inventing525 P1 findings. Blocker/remediation fields explain the actual review gap; C1–C4 meanings are not reinterpreted or declared passed. Only scopeReview records the audit's completed applicability review.

The draft reviewedSourceSha is null, so it cannot be mistaken for an approved ledger. Candidate finding links are navigation only, derived from actual explicit IDs in the findings ledger; they never establish functional coverage. Recorded proof hashes and candidate references are checked by the inventory command.

## Reproduction and validation

- `node scripts/test-phase8d-release-acceptance.mjs`:39 cases, including missing ledger, existing source/CI/19-section gates and negative final-PASS controls.
- `node scripts/test-phase8d-requirements-ledger.mjs`:61 cases, including real525 baseline, optional/forbidden/future handling, cross-phase carry/deferral and false counters, changed canonical content/IDs/class/profile/title, missing owners/review/evidence, malformed CSV, unreviewed/unassigned variants of the real inventory refusing acceptance, no network on invalid records and no overwriting an existing ledger.
- `node scripts/audit-phase8d-requirements.mjs`: inventory/reference integrity only; prints all remaining gaps. A successful inventory command is not a release pass.
- `node scripts/audit-phase8d-requirements.mjs --require-accepted`: refuses the real draft, as intended. No network or cloud writes.
- `--initialize` is only for an absent inventory and refuses an existing ledger, preserving later reviewed work. It does not regenerate or erase completed scope reviews.
- `PHASE8D_REQUIREMENTS_LOCAL_2026-11-05.txt` records the local RED/GREEN and expected real-draft refusal.
- Existing release-contract tests, TypeScript and source checks are run; full hosted exact-SHA result appended after completion. A new blocking CI step runs per-ID adversarial controls plus the real draft inventory validation.

## Changed files and purpose

| Files | Purpose / requirements |
|---|---|
| scripts/phase8d-requirements-ledger.mjs | Canonical525 and structural acceptance checks; GOV-001/002/004/005/006/011/015, COV-011 |
| scripts/verify-phase8d-release-acceptance.mjs | Invoke actual ledger validation before network/provisioning; GOV-001/011/013,8D.19 |
| scripts/audit-phase8d-requirements.mjs | Non-destructive inventory/reference validation and guarded initialization; GOV-001/011/014 |
| scripts/phase8d-release-fixture.mjs | Synthetic525 fixture separated from actual evidence; GOV-002/006 |
| scripts/test-phase8d-release-acceptance.mjs; scripts/test-phase8d-requirements-ledger.mjs | Existing provenance controls plus new61 adversarial/positive cases; GOV-002/006/011/015 |
| .github/workflows/v1-phase8d-backend-audit-ci.yml | New blocking per-ID/inventory step;8D.19 |
| audit/phase8d/release-evidence/PHASE8D_REQUIREMENTS_LEDGER.json | All525 exact entries, explicit scope and unresolved per-ID acceptance gaps; GOV-001/004/005/011, COV-011 |
| Acceptance contract, findings, operational queue and checkpoint/evidence documents | Preserve findings-first lineage, current scope and exact validation; GOV-006/012/013/014 |

The most recent live evidence remains41839919454 attempt5 failure. No claim that token access/configuration has changed; identical denied reads were not repeated. Correct account/scoped Cloudflare reads, concrete binding/Access repairs, authorized isolated cloud recovery/fault/rollback, actual ownership/WS/rates/retention/diagnostics and appropriate per-ID evidence reviews remain. Do not create final acceptance or start8E/8F implementation from this scope-only mapping.
