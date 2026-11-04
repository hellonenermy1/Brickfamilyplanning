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
| requirements | total525, unmapped0, unverifiedApplicable0; requires reconciled ledger |
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
