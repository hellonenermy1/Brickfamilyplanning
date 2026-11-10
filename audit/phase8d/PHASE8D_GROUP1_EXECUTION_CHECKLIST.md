# Phase 8D — Group 1 executable closure checklist
Updated: 2026-11-10 Singapore. Exact verified source+inventory SHA `18453da4c26e1e051d674b9b8bea5e7b1f21fb28`. Source: Group 1 activation/restart packet, canonical readiness and historical PITR/B2 evidence. **This is a tracking checklist, not a blanket PASS.**

Rules: [x] means the specifically named **bounded** evidence exists, not that the whole parent category is complete. Distinguish SOURCE/CI/PROVIDER/OPERATIONAL. Historical failures remain visible. Never use R2, card/billing, production family-data exports or destructive production drills. PR #32 remains draft/unmerged; source CI is not deployment.

## A. Source correctness and regression — current deliverable
- [x] SOURCE/CI: Signed V2 capture/broker, durable replay, authority, quarantined urgent fallback, encrypted 41+4+D1/DO local destruction/restore fixtures implemented and verified in prior successful source CI. **Not installed.**
- [x] SOURCE/CI: Current beta D1 and worker metadata GET-only verification has pinned source/resource identity, historical bookmark sampling, and a separate independent DO namespace ID hash match. **Not a new pinned live workflow run.**
- [x] SOURCE/CI: D1 metadata read refuses 201/206, redirect and changed final URL; exact-head source CI passed in run #42834351206.
- [x] SOURCE/CI: Setup and schema-maintenance Cloudflare management calls have 20-second deadlines, no redirect following, redacted response errors, strict JSON success envelope and status controls. Exact-head CI run #42836232612 succeeded with operator negative tests.
- [x] SOURCE/CI: Publish and live verification scripts require exact non-redirected D1 HTTP200 success/statement envelopes, fail before admission on missing credential/malformed DB target, and preserve signed STARTED ownership under uncertain provider responses. Fourteen new fault/preflight scenarios; actual external-writer suite 43/43, provisioner-ownership 24/24, full Phase8D source audit run #42839953809 SUCCESS on commit `18453da4` (no live account write, deployment or cloud restore).
- [ ] SOURCE: Complete all Worker/DO/D1/deferred/process/raw access writer paths and independently credentialed operator paths, including *all four* known external beta writers. Native helper hooks alone do not establish installation.

## B. Current provider identity and independent backup
- [x] PROVIDER READ: Prior current + one historical (~2026-11-06) bookmark observation on both D1s completed; original manual job failed with expected namespace pins null. Do not retroactively pass it.
- [x] INDEPENDENT INPUT: Exact beta `BrickDevice` and `BetaScheduler` Durable Object namespace IDs separately supplied; their hashes match previously observed binding hashes. No raw IDs in public repo.
- [ ] PROVIDER READ: **New** manually dispatched GET-only pinned source+worker+D1+DO metadata job finishes successfully, with exact private plan including both supplied DO IDs; artifact/log/checkout verified; live job was skipped in routine CI.
- [x] PROVIDER READ: Approved B2 bucket private, 14 retained encrypted synthetic drill object versions, 6,521,676 bytes. Prior provider-backed exact-version readback + fresh **local** restore verified; **not cloud restore or continuous archive.**
- [ ] OPERATIONAL: Create or select separately approved B2 runtime key limited to approved bucket, `brick-recovery/` prefix and `listBuckets`, `readFiles`, `writeFiles`, with secure non-chat custody; broad connected administrative key is not acceptable.
- [ ] OPERATIONAL: Establish and prove separate durable archive encryption key, trusted context, manifest/digest, exact-file identity, authoritative journal and runner-loss access; prevent stale rollback.

## C. Live capture safety and restore qualification
- [ ] OPERATIONAL: Validate trusted guard/replay TLS endpoint, independent failure domain, reviewed bootstrap, owner/role/epoch/key custody and guaranteed full writer coverage; require frozen source/database/DO identities and no untracked operator writes.
- [ ] OPERATIONAL: Demonstrate urgent/outage fallback without bypass, STARTED/legacy uncertain ownership reconciliation and correct source transition/rollback; test unknown remote/process completion.
- [ ] OPERATIONAL: Install and verify approved card-free capture schedule, bounded retries, independent readback, age and failure checks; evidence of real recipient/signer and authentic delivery receipts.
- [ ] OPERATIONAL: Agree exact isolated **synthetic-only** Cloudflare primary+diagnostic D1 and DO target identities, create/authorize those targets and explicit rollback, no family-data transfers or production mutations.
- [ ] PROVIDER RESTORE: Run isolated cloud destruction/fresh restore, interruption and rollback proof, schema/relationship/device/history parity and measured real elapsed RTO/RPO.
- [ ] ACCEPTANCE: Independent accountable owner/tester/reviewer, actual recovery objectives and signoff against the canonical 525 requirements (214 mapped to 8D; 311 other phases). No invented 8D percentage or blanket pass.

**Current gate:** `IN_PROGRESS_NOT_READY`, P8D-002 `P1_OPEN`, Phase8D `NOT_PASS`. 4 external beta mutators remain not fully production-fenced; zero production controller installations proven. Do not merge/deploy or promote an item from source proof to operational proof without a real recorded qualification.
