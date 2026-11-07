# Group1 staged positive delivery receipt reconciliation

Group1 NOT READY; Phase8D NOT PASS; P8D-002 P1 OPEN. This extends the private backup monitor with signed positive receipt verification, not a real alert service, provider signer or verified notification recipient. No production keys, pin, route, endpoint, recipient or network capability is installed.

## Explicit trust configuration

Existing `brick-backup-monitor-config-v1` stores keep their exact configuration identity and behaviour; reconciliation is disabled. A new explicit `brick-backup-monitor-config-v2` adds `deliveryReceiptPin` with a canonical Ed25519 SPKI public key, authority epoch and opaque recipient digest. Those fields are covered by the monitor's persisted configuration digest. Existing stores refuse silent v1/v2 conversion, key rotation, epoch change or recipient substitution; no records are reset or migrated automatically. Provisioning, pin provenance and custody need separate review. Synthetic test keys are generated only in disposable fixtures.

`scripts/cardfree-backup-alert-receipt.mjs` performs pure verification. It imports no private key and has no signing service, default trust root, HTTP/CLI entry point or environment credential reader. Only canonical44-byte Ed25519 SPKI keys and64-byte signatures are accepted; unsupported algorithms, malformed/noncanonical encodings and unknown fields refuse. The signature domain is `BRICK-BACKUP-ALERT-DELIVERED-V1` followed by a newline and fixed-order canonical JSON. JSON member ordering does not change the signed meaning.

The payload binds format, monitor/config digest, authority epoch, recipient digest, event ID and canonical full-alert digest, plus delivered/issued/expiry times. It cannot be reused for another alert, recipient, monitor, configuration or role. Delivery cannot precede the alert observation; issuance cannot be future; expiry must be current and no more than24h after issuance. This is the adapter's deliberately strict protocol, not a claim that any external notification provider implements it.

## Read-only challenge and positive proof

`deliveryChallenges()` exposes only bounded metadata for STARTED/UNCERTAIN records: opaque event/message/config/recipient/authority digests and observation time. It does not read archives, reveal trusted backup context, configure a recipient or send anything. The eventual signer must have independently justified knowledge of actual delivery; the local helper does not confer that authority.

`reconcileDelivered(envelope)` accepts only positive proof for an already attempted STARTED/UNCERTAIN alert. It never marks a PENDING event delivered, requeues a failed/unknown send, expires ownership, sends again or creates a missing event. Valid proof moves that exact record to DELIVERED in a local SQL transaction and preserves the full canonical signed envelope, digest and verification time. Archive health remains unchanged. Invalid proof rolls back without changing uncertainty or counters. Identical current proof is idempotent; a different proof cannot overwrite retained evidence or callback-only confirmation.

On every state read/restart, stored signed receipts are checked again against the pinned key and exact saved alert/config at their original verification time. Expiration prevents a new reconciliation; it does not erase a previously valid historical confirmation. A recomputed outer SQLite checksum cannot make a forged stored signature valid. The signature authenticates the pinned key's specific statement, not the entire database, provider truth, host, clock or actual delivery to a person.

An in-flight sink may race a valid signed confirmation. Later callback failure cannot undo a retained valid positive receipt, and its completion cannot cause a resend. Store lock/write failure retains uncertainty; the same positive proof may be retried without retrying the send. Abrupt child-process loss after durable STARTED can be reconciled later without a second transport attempt.

Confirmed history keeps the existing bounded retention rule. Once a confirmed event has been pruned, replay cannot recreate it; unresolved events are never pruned by that rule. The sticky overflow blocker is not cleared by receipt reconciliation. No negative receipt, no-delivery attestation, manual clear/requeue, implicit trust rotation or global source-writer reconciliation is provided. Durable external audit retention and authorized operator workflows still require qualification.

## Verification and boundary

Tests use actual Ed25519, private SQLite transactions/restarts/multiple handles, synthetic B2 archives, synthetic sinks and a real disposable child-process exit. They cover binding/algorithm/domain/time/encoding errors, message tampering, unknown and pending events, expired proof, pinned-key continuity, receipt reauthentication after database tampering, positive/callback races, canonical ordering, storage failure, replay/pruning and legacy-store preservation.

The actual signed native41+4/deviceDO encrypted recovery drill also runs the optional monitor v2 against its full retained B2-fixture archive: forged proof stays uncertain; the correct exact-alert proof is retained across restart, no send is replayed, and the archive remains STALE. Existing50 monitor and91 B2 adapter cases remain required. The signer/provider/sinks are synthetic, so this is not real delivery, independently authenticated operator authority or custody acceptance.

Primary Node24.22.1 crypto API reference inspected:
https://nodejs.org/download/release/v24.22.1/docs/api/crypto.html

Open operational gates remain: complete source writer/operator/credential/lifecycle/deferred/process-tree coverage and started/legacy reconciliation; urgent-outage fallback NOT_IMPLEMENTED; installed source transport/bootstrap/key custody; actual independent private card-free storage/separate key/context; actual capture/monitor scheduling and signer/recipient/alert delivery/retention; current PITR and isolated cloud recovery/interruption/rollback/RTO/RPO. No partial fence activation, real messaging, source/user data or credential changes, R2/card/billing, APK/UI/phone changes, PR merge or deployment.
