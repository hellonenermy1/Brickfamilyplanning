# Group 1 staged durable backup monitor

Group1 NOT READY; Phase8D NOT PASS; P8D-002 P1 OPEN. This is one-shot off-platform monitoring software, not an installed backup schedule, capture coordinator, production service or alert-delivery qualification.

## State and boundaries

`scripts/cardfree-backup-monitor.mjs` accepts an explicit private local directory, immutable monitor identity/cadence, a trusted backup-health policy and pinned exact B2 file receipt. It never uploads, captures, rotates keys, reads environment secrets, modifies source databases, starts a timer/cron loop or configures a real alert recipient. Every check requires the caller-held encryption key and archive-reader capability. The shared B2 receipt validator retains strict destination/hash/version checks and now canonicalizes receipt fields for both the adapter and monitor.

A dedicated SQLite file retains target/context/opaque receipt, next check time, failure backoff, last authenticated result and successful check time, active read claim, incident and bounded alert outbox. Encryption/provider keys and plaintext archive data are never persisted. Private target/context metadata needs separately reviewed custody before any installation. Snapshot and alert payloads omit target/context, filenames, source/parent/device data and provider tokens. No real credentials or account identifiers were used in this batch.

Local SQL transactions commit check ownership before archive reads and alert STARTED state before invoking a sink. Competing handles cannot run the same live check or send the same queued alert. Archive health uses the existing AES-GCM/two-read checker, not a caller-supplied healthy boolean. Freshness uses authenticated capture time; file timestamp, retries, publication time, process restart and newer receipts cannot refresh that age. Next-check time is capped by capture-age expiry. A missed check, active/interrupted check or new target cannot keep showing the previous stored FRESH result. Failures preserve the last successful check time and use bounded persisted backoff.

Read claims may be reclaimed after expiry because their only external action is bounded read-only verification. Claim IDs and target digests prevent a late old check from overwriting a newer failure or changed target. This exception does not apply to source writers, uploads or alert delivery; it is not an urgent-outage fallback or proof that remote side effects stopped.

Target changes are explicit. They retain destination pin/deployment identity, refuse capture-time rollback or substituted same-backup IDs, invalidate current health/read claims and require new authenticated verification. Old incident/delivery uncertainty is retained across target changes.

## Alert semantics

One redacted problem event is queued per incident; confirmed recovery queues a timestamped recovery event for that incident. These are historical observations, not claims about current health when eventually delivered. The optional injected sink receives an opaque event ID and must return an exact matching delivered acknowledgement. No real recipient/provider is present.

The outbox commits STARTED before the callback. Timeout, rejection, wrong/malformed acknowledgement, process exit or failed completion commit leaves STARTED/UNCERTAIN ownership. It never expires, auto-replays or becomes delivered merely because time passed. A late acknowledgement after timeout cannot silently change that status. The optional v2 positive signed-receipt reconciliation path is described in PHASE8D_GROUP1_ALERT_RECEIPTS.md. A real signer, pin provenance/key custody, authenticated recipient/provider delivery, negative-outcome/requeue handling and actual operator installation remain unqualified; a callback acknowledgement is not independently verified delivery to a person.

The outbox holds at most64 records, trimming only confirmed delivered history (retaining the most recent16 before appending). Pending/STARTED/UNCERTAIN records are never silently deleted. Overflow becomes a persistent visible blocker even if archive health later recovers; production retention and incident reconciliation still need review. Failure to write/read the store refuses healthy status and does not start external work. Corrupt state/schema/checksum is never silently reset.

## Private store and validation limits

The store uses a dedicated owner-private directory and0600 singleton SQLite file with FULL synchronous transactions and a25ms busy limit. It refuses symlinks, FIFOs, hardlinks, loose permissions, unexpected schema/configuration, database inode replacement, malformed singleton state, checksum drift and clock regression. Both the row identity and one-row update count are checked. There is no automatic migration or clearing of unknown state. The parent path, same-user host/process isolation and honest monotonic wall clock remain trusted duties. File checks/checksums do not authenticate a malicious same-user operator, remove filesystem races outside that trust boundary or establish power-loss/independent durability.

No SQLite file contains the encryption key. A private row does include trusted context and opaque receipt, so its location/key-context custody must not be equated with an independent provider backup. This monitor does not establish all-plane storage independence, alert authorization, secret rotation, availability or a real scheduler waking on time.

## Verification

The monitor suite exercises actual SQLite persistence/transactions/multiple handles, real crypto/health and the staged B2 synthetic provider, persisted backoff and age, wrong key, stale checks, target change, redacted alerts, overflow/retention, corrupted files/schema, private path refusals, busy/write failure, timeout/late ACK and abrupt child-process exits during read and send. Child exits prove committed read claims/STARTED alerts survive process loss; read checks can retry safely while unknown sends cannot replay.

The full signed native41+4/deviceDO encrypted recovery drill also uses the monitor against the actual retained encrypted B2-fixture version after source/local-archive loss. It verifies FRESH, age-based STALE, restart/last-success persistence and uncertain synthetic alert retention/no replay, alongside existing fresh D1/DO restoration, credential exclusions, populated relationship parity and interruption/restart tests. This is synthetic native integration, not real B2/cloud/recipient acceptance.

Node24.22.1 SQLite API reference inspected for DatabaseSync, bound statements, explicit transaction exec, timeout, extension disabling and close:
https://nodejs.org/download/release/v24.22.1/docs/api/sqlite.html

Remaining: complete source writer/operator/credential/lifecycle/deferred/process-tree coverage and reconciliation; urgent-outage fallback (NOT_IMPLEMENTED); installed trusted source transport/bootstrap/key custody; actual independent private card-free destination/separate key/context; actual capture/monitor schedule and alert delivery/retention/reconciliation; current least-privilege PITR and isolated cloud recovery/interruption/rollback/RTO/RPO. No partial fence activation, provider/storage/credential/family-data change, APK/UI/phone work, R2/card/billing, PR merge or deployment.
