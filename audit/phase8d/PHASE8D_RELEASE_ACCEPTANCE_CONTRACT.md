# Phase8D final release record contract

This documents a future acceptance format. It is not acceptance and does not authorize release. The real PHASE8D_FINAL_ACCEPTANCE.json and .md are intentionally absent until all applicable live/source exit gates have reviewed proof.

The manual production workflow still requires branch `v1-p8d-accepted-backend`. Preflight verifies tracked records at exact Actions HEAD, using the repository's read-only GitHub token for Actions provenance. Checkout needs full ancestry; missing token/API permission or incomplete/stale CI refuses release before provisioning.

| JSON field | Required value |
|---|---|
| format | brick-phase8d-release-acceptance-v1 |
| repository | hellonenermy1/Brickfamilyplanning |
| finalStatus | PASS only after actual final audit acceptance |
| testedSourceSha |40 lowercase hex commit SHA with successful source audit CI; ancestor of release HEAD |
| unresolvedP0 / unresolvedP1 | Actual counts, both0 at acceptance |
| requirements | total525, unmapped0, unverifiedApplicable0, actual deferredCrossPhase/carriedForward counts and a tracked ledger descriptor; all counts derived from per-ID data |
| sourceCi | Numeric positive runId and runAttempt for actual completed source audit workflow |
| sections | Exactly19 unique IDs8D.1–8D.19 |
| section.status | VERIFIED or VERIFIED_UNSUPPORTED |
| section.reason | At least20 meaningful characters for unsupported, backed by actual scope decision |
| section.evidence | Nonempty entries of tracked relative path and64-hex SHA256 |

Evidence paths must be under audit/phase8d with no traversal and refer to regular tracked files. Hash raw bytes, including binary artifacts. The verifier checks hashes, not the truth of document claims; independent review of live tests is still required.

After the tested source SHA, code/config/workflow/schema changes require a new CI-proven source SHA. Permitted documentation differences are Markdown/text/images/PDF under audit/phase8d, the actual final JSON record, and JSON/CSV documents under audit/phase8d/release-evidence. Operational lifecycle JSON, endpoint CSV, scripts and executable audit files are not allowed to bypass source testing.

Final Markdown needs exactly one line `FINAL STATUS: PASS` outside code fences and quotations, with no competing FINAL STATUS verdict. Qualified/pending markers and examples do not satisfy it. Do not copy an example PASS into the real file while any exit gate is open.

Required actual CI workflow: .github/workflows/v1-phase8d-backend-audit-ci.yml. Required job names remain the deployment/schema contract, backup coverage contract and full source build/security/recovery suite. Every job must be completed-success on the specified current attempt; a previously green attempt is not enough after rerun failure. Verification also rejects fork/mismatched repository, wrong SHA/workflow, pagination gaps and API denial. Only read requests are made by this verifier.

This gate cannot replace configured branch protection/admin bypass rules, safe Cloudflare credentials, live deployment validation, tested rollback or trusted human approval of evidence. It deliberately leaves production blocked now.


The separate tracked key-container filename ban remains unchanged. Content scanning now requires private-key material rather than a marker alone, with escaped-newline, indentation and encrypted-key controls. This prevents synthetic scanner fixtures from blocking a valid release while retaining material detection. Other credentials, arbitrary encoding, historical exposure and rotation remain separate audit work.


## P8D-067 canonical per-ID evidence contract

`requirements.ledger` must contain a tracked path under `audit/phase8d/release-evidence/` ending in `.json` and its raw-byte SHA256. Ledger format is `brick-phase8d-requirement-ledger-v1`, repository is the exact Brick repository, and reviewedSourceSha must match testedSourceSha. The pinned canonical baseline path/hash is read from the real tracked525-row CSV; IDs, classification, profile, title and full-row requirementSha256 must match exactly. Duplicates, unknown IDs, omissions or changed canonical text/classification refuse release before GitHub API calls.

Each row needs id, title, classification, profile, requirementSha256, scope, scopeReason, sections, status, disposition, implementationOwner, testOwner, review.reviewer/reviewedAt and nonempty evidence with kind/path/sha256. Evidence kinds are SOURCE_CI, LOCAL_INTEGRATION, LIVE_INTEGRATION, DEVICE, SCOPE_REVIEW, PROHIBITION_REVIEW, FUTURE_INTERFACE_REVIEW and UNSUPPORTED_PROOF. Candidate finding references are not evidence. Placeholder/unassigned owners, absent review, unresolved disposition, traversal, circular verdict/ledger proof and altered proof hashes refuse release.

PHASE8D rows require disposition VERIFIED_FOR_8D and status ACCEPTED or actually proven optional VERIFIED UNSUPPORTED. CROSS_PHASE rows require reviewed CARRIED_FORWARD from8A/8B/8C with accepted/proven unsupported plus scope/functional evidence, or plan-backed DEFERRED to8E/8F/9 with scope evidence, deferredReason, blockingPhase8D=false and truthful nonaccepted progress status. OPEN BLOCKER cannot be deferred away. The verifier derives/checks deferredCrossPhase and carriedForward totals (both0 when absent), and refuses unresolved applicable scope/status. Reviewed deferral is not feature acceptance or production qualification; current backend/security P0/P1 cannot be waived by relabeling scope. Evidence semantics and phase boundaries require independent review.

Optional unsupported requires a reason and UNSUPPORTED_PROOF; mandatory/forbidden requirements cannot use it. Applicable verified forbidden/future-interface rows require PROHIBITION_REVIEW/FUTURE_INTERFACE_REVIEW respectively. Evidence/reviewer hashes are provenance checks, not authentication or proof of the content's truth. Device-specific claims still require actual appropriate device evidence.

The real `release-evidence/PHASE8D_REQUIREMENTS_LEDGER.json` is a draft: all525 rows preserved,214 draft backend/shared scopes and311 cross-phase dependencies, zero missing IDs, but all525 final dispositions/owners/acceptance reviews pending. It intentionally cannot pass. C1–C4 worksheet prompts and unassessed severity remain explicit. Existing CI evidence is reusable; draft gaps do not reopen/reset completed work. See `PHASE8D_REQUIREMENT_RECONCILIATION_2026-11-05.md`.
