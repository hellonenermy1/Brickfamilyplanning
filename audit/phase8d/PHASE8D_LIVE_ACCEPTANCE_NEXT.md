# Phase 8D — Remaining LIVE acceptance packet (no deployment or mutation authorized)

**Source of authority:** Brick V1 Phase 8 Full Audit Execution Plan pp.44–54, sections **8D.1 through 8D.19**. As of 2026-11-04, code and native SQLite tests last green [41822669148](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41822669148) at `1fd03dd970021532c00f14e0a9a06dcafad8f857`. **8D still NOT PASS.**

## Why Phase 8D cannot advance based on the existing CI

A GitHub pass verifies the branch source, **not the deployed Cloudflare account**. The current tool connection allows GitHub repository/source and CI access but **no Cloudflare account API or cloud browser**; GitHub deployment/environment endpoints were unsupported and branch protection returned HTTP 403. We cannot derive the currently serving Worker SHA, live binding values, Access policy, R2 lifecycle or D1 content from a Wrangler template.

## Next six acceptance operations, ordered by risk (read-only first)

### 1. 8D.1 / 8D.19 — Attest deployed identities and release protections, READ ONLY

Capture separately for production and development: exact active deployment ID and Git SHA, HTTP origins and Worker routes, compatibility date, Worker entry, actual D1 binding and schema migration version, R2 HISTORY and MAPS, DO class namespace, Queue+DLQ binding and retry/dead-letter settings, scheduled cron, public Worker.dev hostname, Access application/audience/issuer/policy metadata, rate limiter namespaces, environment variables and **secret names/presence only**. Do **not** read or paste secret values or user locations. Verify GitHub branch protection/rulesets and release gates through an authorized administrative read-only view. Any mismatch from audit branch or lack of an authoritative active SHA is **8D.1 FAIL/BLOCKED**, not a guessed pass.

### 2. 8D.16 — Prove real isolated destructive recovery of D1 + R2 + DO

Use entirely separate, **explicitly named and nonproduction** D1, R2 and Durable Object resources and synthetic child identities. Record a consistent snapshot/cutoff, integrity digest, 18-table inventory plus relationship/FK and revoked identity state; raw/trusted/evidence/history object inventory with checksums and retention settings; DO current truth and persistent revocation state. Back up, destroy/discard **only the isolated target**, restore fresh database and objects, rehydrate/reconnect DO as applicable, then compare hashes/counts/relationships and verify no expired command replays. Ensure recovery fails closed when an R2 history object is missing. Confirm app can read history and current state, and retry safely after simulated interruption. Prior [synthetic snapshot-to-restore CI](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41822669148) is a good regression **but does not satisfy this actual Cloudflare gate**. Require written RTO/RPO evidence instead of invented estimates.

### 3. 8D.6 / 8D.7 / 8D.9 — Fault seams with actual Queue, D1 and DO

In isolated Cloudflare environment with synthetic signed location and SOS packets: inject outage (a) before D1, (b) after D1 but before Queue, (c) after Queue but before DO, (d) during first R2 raw/trusted object write, (e) on Queue delivery retry and DLQ exhaustion, (f) during revocation and old/new packet interleaving. For each, record HTTP ACK/no ACK, D1 epoch sequence, raw/trusted R2 content, DO live state, safety incident, Queue ACK/retry/DLQ, and whether the device's persisted journal eventually converges after retry without manual intervention. Do **not** equate Queue producer success with R2 finished durable history.

### 4. 8D.2–8D.5 / 8D.10–8D.14 — Live hostile interface and command audit

Use only test identities and owned resources. Probe every candidate endpoint and method against the actual deployed Worker, valid/invalid/wrong-device/revoked P256 credentials, expired/replayed payloads, cross-family Access users, missing and cross-site Origin, wrong/expired command ID, late/wrong command response, WebSocket duplicate clients, subscription expiry, DO hibernation, logout and child revocation under reconnect. Capture exact request ID, response code and sanitized server trace; never put signing keys or location history in logs. Each new public route must be added to the 49-route source candidate inventory and mapped to actual method/auth/storage/rate/side effects. A parent API returning 403 without Access **does not prove per-family authorization**.

### 5. 8D.15 / 8D.17 / 8D.18 — Real secret, lifecycle and diagnostic attestation

Check actual CDN HTML/JS, deployment output and redacted logs (not only Git source) for server secrets; run an authorized Git history secret scan and resolve any exposed credential with careful rotation if confirmed. GET actual R2 lifecycle rules for `history/raw/`, `history/trusted/`, `evidence/raw/`, hypotheses/refined history, legacy prefixes, backups and multipart abort, check 30/90-day vs source policy and object-age boundaries. Verify actual D1 cleanup for crash/health/audit/commands, per-device isolation and revoked history, and that observable incidents distinguish phone offline, backend DB, Queue failure, bad auth, WS and provider outage without raw tracking payloads in logs. Missing policy or unrelated-bucket deletion risk is not PASS.

### 6. 8D.8 / 8D.19 — Real release, migration failure and rollback drill

On an isolated copy of a previously deployed schema: replay migrations 001–018 in actual order, fail midway and demonstrate rollback/no orphan rows, nonreplayed commands, no data loss, expected index/constraint fidelity and clean retry. Verify source SHA+lockfile, pinned actions, approvals/branch rules, deployment tag, and deployment reversal to a known prior healthy version with identical source schema compatibility. No production deploy or user traffic mutation is authorized by this checklist.

## Hard stop/no-pass criteria

No P0/P1 open; zero unknown public routes, unknown auth path, unexplained persistence/ACK boundary, backup without actual full isolated restore, unverified prod worker identity, or missing safety/retention/rollback evidence. Preserve accepted Phase 8C Android build. **Do not start Phase 8E/8F until all applicable 8D exit gates are met or explicitly verified unsupported under the approved plan.**

## Concrete access limitation

Only GitHub source and CI were available this turn. No direct Cloudflare read-only connector, no accessible GitHub deployment/environment metadata through the connector and no GitHub branch-protection administrative permission. These are genuine evidence blockers, **not** evidence that the resources are misconfigured.
