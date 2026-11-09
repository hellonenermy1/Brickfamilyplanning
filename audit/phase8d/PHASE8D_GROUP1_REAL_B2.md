# Group1 — approved real private B2 transfer and fresh local recovery

9 November 2026. The user explicitly approved the previously proposed private bucket creation and encrypted synthetic upload/readback test. That approval was executed without a repeat permission request. Group1 remains NOT READY; Phase8D NOT PASS; P8D-002 P1 OPEN.

## Actual provider result

Created `brick-recovery-jayvian-20261107` as `allPrivate`. Fresh account reads verified the exact created bucket before publication and after readback. Provider metadata reports SSE-B2/AES256 by default. No public/bearer sharing, existing key/permission/retention/billing changes, deletion or production/family-data operation occurred.

The actual signed native recovery fixture generated a 3,260,838-byte AES-256-GCM archive covering 41 primary tables, four diagnostics tables and two device objects. The source D1/device persistence and original local archive were removed in the existing fixture. The operator transferred that same ciphertext through the actual connected B2 app, not the synthetic B2 fixture. The encryption key and trusted selection context remained in the running test process and were never exported or uploaded.

The connector caps a read at 1MiB. One archive was therefore split into seven opaque objects, each at most 512KiB. Every upload acknowledgement matched its expected bucket, name, size and SHA1. The operator downloaded every exact file ID twice: 14 actual provider reads. Both rounds matched every pre-publication part size/SHA1/SHA256 and reassembled to archive SHA256 `054be9f7ff2a5f20135a074421aad354f7854d9a730f6deed93def2633b6b729`. Seven additional exact-version metadata reads matched the publication receipts. Public evidence hashes the resource/version identities; raw account IDs, file IDs, private paths, keys and readback contents are not committed.

After the outbound local full-archive file was removed, the caller atomically supplied the two reassembled B2 readbacks to the waiting fixture. It authenticated them with the retained process-only key/context, then selected the B2-returned bytes for the actual fresh local restore. Wrong key, tamper and wrong context were rejected before target writes. Fresh 41+4 stores/device objects passed history/object-byte checks, exact 33-row/16-table configuration/relationship checks, credential exclusion, command retirement, revocation, interruption refusal and restart parity. The complete optional-mode process exited zero. The ordinary default fixture was separately rerun and exited zero.

## Failed local attempts are not hidden

1. The initial local handoff bound assumed the whole archive would fit a connector read; its 1MiB guard refused the larger archive before provider upload. The archive limit was reconciled with bounded chunk transfer rather than reducing the fixture data.
2. Seven parts then uploaded successfully, but the five-minute manual handoff window expired before reassembled readback/restore. That attempt is not counted as a restore pass. Its process-only synthetic encryption key ended with the process.
3. A new archive ran with a 30-minute operator-transfer window; all seven uploads, 14 reads, authentication and fresh local restore passed. The longer window applies only to this explicit local operator handoff, not writer ownership, capture safety, provider deadlines or production scheduling.

Fourteen private encrypted test objects remain across the two published attempts, totaling 6,521,676 ciphertext bytes. No deletion was authorized or performed. These are synthetic drill objects; their keys are not retained after the fixture process ends. They are not a production backup or a demonstration of durable key custody.

## Reproducible boundary

`test-phase8d-cardfree-recovery.mjs --provider-roundtrip-directory ABSOLUTE_PRIVATE_EMPTY_DIRECTORY` is an explicit local handoff mode. It requires a real, owned, private0700 directory with no symlink resolution or existing entries; emits only ciphertext and bounded redacted readiness metadata; and waits for two private readback files. The existing file reader refuses unsafe/nonregular/changed/unbounded files. The caller must remove the outbound full-archive file and supply complete atomic readbacks. The fixture performs no real provider network request or credential discovery itself. Unknown arguments refuse; no arguments preserve the ordinary CI mode.

Operator sequence: capture/seal the complete native fixture; read ready.json; split ciphertext into <=512KiB parts and pin their hashes; upload to the approved private bucket; retain exact receipts privately; download each exact version twice; validate/reassemble both copies; remove the outbound archive; atomically publish readback-1/readback-2; await native authentication/restore/parity/restart success; recheck exact metadata and bucket privacy. This uses the connected app's existing broader credential within the approved bucket, not an installed restricted runtime key. It does not qualify the staged single-object B2 adapter against the real provider.

`PHASE8D_GROUP1_REAL_B2_EVIDENCE.json` records the sanitized actual outcomes, identities/hashes and limitations. Required current source/CI qualification is recorded separately; hosted CI does not repeat real provider writes or contain account credentials.

## What remains open

This proves actual private B2 ciphertext availability/exact-version readback and provider-backed fresh **local** recovery. It does not prove installed runtime backup transport, a durable selection manifest/key custody arrangement, a restricted runtime key, scheduled capture/readback, real alert recipient delivery, current Cloudflare/PITR access, an isolated Cloudflare restore, scale or agreed RTO/RPO. The test uses a controlled health clock for package checks; it is not current-age monitoring or elapsed-time/SLA proof. Legacy synthetic adapter/monitor suites in the log remain synthetic; local stub-provider files also exist during their checks. No sole-copy or loss-of-all-local-material claim is made.

Complete writer/raw/operator/credential/lifecycle/deferred/process-tree coverage, started/legacy reconciliation and safe urgent authority/storage/transport-outage fallback remain incomplete. No partial production fence was enabled. Actual restricted runtime key creation/custody and Cloudflare resource mutation are outside the granted bucket/test scope. A fresh Cloudflare Workers/D1 plugin search again returned no matches (not exhaustive); unchanged denied login/token paths were not retried.

Only OPS-002/OPS-003 may gain this scoped integration evidence. All canonical classifications, criteria, status/disposition, owner/reviewer assignments and phase mappings remain unchanged. The four-day target remains AT RISK while the remaining operational prerequisites are unresolved. No merge, deployment, APK/UI/phone, R2/card or real family-data changes occurred.
