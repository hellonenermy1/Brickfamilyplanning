# Current local publication policy

P8D-089 adds private input/parent checks, nonblocking/no-follow file reads, directory fsync and authenticated published readback.22 new actual-filesystem/CLI cases plus inherited13 protected-format cases pass locally; see PHASE8D_PRIVATE_ARCHIVE_PUBLICATION.md. Keep plaintext capture/context files0600 and capture/archive directories0700. These controls do not configure independent custody or a live backup. P8D-088 separately hardens capture cancellation and release; actual live prerequisites are explicit in PHASE8D_LIVE_RECOVERY_PREREQUISITES.md.

---

# Protected card-free backup — operator contract

Status: off-platform source primitive and synthetic destruction/restore drill only. P8D-002 remains P1 OPEN. No live schedule, capture endpoint, cloud resource, secret or destination is configured by this change. Existing scheduled backup still covers 38 legacy tables in the same D1 store.

## What is implemented

`scripts/cardfree-backup-package.mjs` seals the full existing `exportCardfreeD1` output (41 primary +4 diagnostics tables) together with exactly one DO snapshot for every registered device, including revoked devices. AES-256-GCM uses a freshly generated 96-bit nonce, a dedicated 256-bit key and an authenticated format header. All component names, sizes, SHA-256 values and identity/context metadata are encrypted and authenticated. The key never goes in the package.

The trusted restore selection pins deployment, exact source SHA, backup ID, capture time and key ID. Wrong context, wrong key, changed/truncated/extended bytes, missing/duplicate/foreign device components, device-key mismatch and unknown/malformed durable device state fail before a restore caller receives inputs. A matching archive can be reopened repeatedly; this is not a global anti-replay registry. Keep the trusted selection receipt independently protected: taking it from an untrusted archive defeats rollback selection checks. A shared-key holder can produce archives; this is not independent digital-signature provenance.

Limits: 16MiB decoded D1 JSON, 64KiB per DO snapshot, 1,000 devices, 32MiB total encrypted envelope. Base64/JSON and crypto copies consume additional Node memory. These are rejection bounds, not demonstrated production capacity. This whole-archive operation belongs off-platform; do not call it inside a Free Worker invocation. Full schema/row/BLOB/object validation and empty isolated target checks remain in `restoreCardfreeD1`; every target DO rechecks identity and empty state. Failures between stores can leave a partial target: discard it and restore to another fresh isolated target. No resumable distributed transaction is promised.

## Explicit local packaging and verification

Generate a dedicated key using a cryptographically secure random source (32 random bytes, canonical Base64). Keep it out of repository files, command arguments, chat and logs, and preserve it in an independent secure recovery location. Key creation/rotation and production secret setup are not performed by this source change. Supply the key only through `BRICK_BACKUP_ENCRYPTION_KEY` in the operator process environment. A password or Cloudflare API token is not a backup key.

Prepare `capture.json` privately, using actual completed quiesced capture outputs, with this shape:

```json
{
  "context": {
    "deployment": "brick-family-beta",
    "sourceSha": "<exact 40-character lowercase Git SHA>",
    "backupId": "<fresh 16 random bytes as 32 lowercase hex characters>",
    "capturedAt": 1,
    "keyId": "<operator key identifier>"
  },
  "d1Path": "/private/capture/d1.json",
  "devices": [{"id": "<registered device ID>", "path": "/private/capture/device.json"}]
}
```

`capturedAt` must equal the actual D1 export's `createdAt`; 1 is only a placeholder. `devices` must cover every device in that export. Quiesce device uploads, maintenance and other writers across both databases and DOs externally throughout capture; an input assertion is not proof of quiescence. Snapshot times are retained per component, not claimed to be a distributed atomic timestamp. Plaintext capture files are sensitive temporary operator inputs; the CLI neither captures them nor removes them.

```sh
node scripts/phase8d-protected-backup.mjs seal /private/capture/capture.json /private/archives/backup.brickbackup
node scripts/phase8d-protected-backup.mjs verify /private/archives/backup.brickbackup /private/receipts/trusted-context.json
```

`trusted-context.json` is the independently selected context object. Seal requires private regular no-follow inputs and a private nonsymlink destination directory. It creates a mode-0600 exclusive temporary file, fsyncs/readbacks it, hard-links without overwrite, fsyncs the destination directory, compares published bytes and authenticates them again before reporting PRIVATE_LOCAL_FSYNC_READBACK. Source inputs, encrypted archives and trusted-context files must have no group/other permission bits. FIFO/nonregular/symlink inputs refuse. Linux local semantics are tested; actual hardware power-loss durability and independent storage are not qualified. A post-link failure may leave private ciphertext and returns failure without deleting an existing artifact. Verify decrypts in memory and emits context/device count only; it does not extract plaintext or modify any database. Failures redact paths, data and exception text. Environment inspection, process memory, swap and filesystem security remain operator responsibilities; buffer zeroing does not guarantee elimination of JavaScript/OS copies.

## Required to close operational protection

1. A scoped, authenticated, bounded capture transport/coordinator for both actual D1 stores and all device DOs, with a demonstrated writer pause/fence and resume on error. No public recovery endpoint is supplied here.
2. A specifically configured card-free private off-platform destination, independent key custody and trusted manifest retention, expiry and failed-upload retry/visibility. Key/destination configuration is currently unverified, not asserted absent. Do not reuse the same D1 account as the only disaster copy or activate R2/billing.
3. Read-only scoped proof of actual resource identity, D1 PITR window/bookmarks and quota limits; do not substitute broad deployment credentials after denied audit-token calls.
4. Authorized disposable cloud capture/destroy/restore/interruption/rollback drill with exact source/config/schema and measured RTO/RPO, without touching family/beta data. Synthetic local/CI evidence cannot close this item.

Automated evidence: `test-phase8d-protected-backup.mjs` exercises 13 adversarial/CLI groups. `test-phase8d-cardfree-recovery.mjs` writes only the protected package as its recovery input, discards plaintext restore inputs, deletes actual local source persistence, reopens the file with the separate ephemeral test key/context, rejects bad packages before target writes, and restores both D1 stores/device DOs. Plaintext expected values retained by the test are comparison oracles, not restore inputs. The isolated test key is ephemeral and is never a production backup key.
