# Group 1 — independently supplied beta Durable Object namespace pins (2026-11-10)

## Evidence boundary

User independently supplied the two Cloudflare Durable Object namespace IDs with class labels `brick-family-beta_BrickDevice` and `brick-family-beta_BetaScheduler`. The inputs were mapped to the existing Worker bindings `BRICK_DEVICE` and `BETA_SCHEDULER`, respectively. Both supplied values are exactly 32 lowercase hexadecimal characters, distinct, and distinct from 64-character per-object IDs. The supplied values were SHA-256 hashed as UTF-8 strings and compared with **pre-existing** read-only observations in `PHASE8D_GROUP1_HISTORICAL_PITR_EVIDENCE.json`; the two hashes matched exactly.

| Binding | Independent supplied namespace ID SHA-256 | Previously observed active-binding SHA-256 | Outcome |
| --- | --- | --- | --- |
| `BRICK_DEVICE` | `fb8fccb5ec3e2c3d737ab7773c3f2158727d92c8fef21f75b699eb3cbc4986b2` | `fb8fccb5ec3e2c3d737ab7773c3f2158727d92c8fef21f75b699eb3cbc4986b2` | MATCH |
| `BETA_SCHEDULER` | `9662662badbf80ea628c1b0460ecf7ad6876ba0958cc55893feec42f4ac4134a` | `9662662badbf80ea628c1b0460ecf7ad6876ba0958cc55893feec42f4ac4134a` | MATCH |

Identifiers are intentionally **not** placed in this public repository file. Their SHA-256 digests alone do not authorize an operator to reconstruct or infer them; the operator must use the separately supplied exact private values. The comparison establishes a match between separately provided IDs and the active binding identities observed during the prior read-only run, **not** a new GET of live state, a provider-console screenshot, a signed provider attestation or a Cloudflare restore.

## Next permitted verification

Populate both exact IDs only in the private metadata plan fields `deviceNamespaceId` and `schedulerNamespaceId`, preserving the previously validated account ID, both D1 database IDs, host, worker name, expected source SHA and historical `asOf` target when still within the permitted window. Execute the existing GET-only `scripts/cardfree-beta-readonly.mjs` via the existing narrowly scoped workflow; do not write a private plan or raw IDs into this repository. Require `checksPassed=true`, `activeVersionBindingMetadataVerified=true`, `metadataReadCompleted=true`, `pitr.checksPassed=true`, source/deployment stability and an actual successful job. Retain log, sanitized JSON, workflow run/attempt, exact checkout SHA, artifacts and checksum. Do not suppress a failing gate.

## Status — still open

**NAMESPACE_INDEPENDENT_HASH_MATCH=PASS. LIVE_METADATA_WITH_EXPECTED_PINS=NOT_RUN_IN_THIS_BATCH.** Prior `DO_NAMESPACE_PINS_REQUIRED` job remains a historical failure; no false retroactive correction. Historical PITR bookmarks have been read, but no cloud restore, retention-window proof, measured RTO/RPO, signed installed full writer coverage, independent key/record/journal custody, approved restricted B2 runtime, schedule/recipient or independent operational acceptance has been established.

Group 1 remains `IN_PROGRESS_NOT_READY`; P8D-002 P1 OPEN; Phase 8D NOT PASS. PR #32 remains draft/unmerged. No application deployment, Cloudflare write, family-data query/export or credential change was executed for this evidence note.
