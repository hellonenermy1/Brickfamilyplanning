# Phase8D Group1 durable one-shot backup lifecycle

## 2026-11-10 — durable one-shot capture/publication/selection lifecycle qualified

Candidate `99494db53883d2ad1a0f52b62a4ca7d33bb8973f`, tree `4713d6fef99b83b28ee634b779d4a4cb57fd34e2`, baseline `6b4e88d8509ca5e7dd42b505475965b08faf3787`, unchanged integration base `141cbf42efaa61873c4fa87138ca5a0a19d404a2`. New inert cardfree-backup-run module composes capture -> verified publication -> retained recovery selection behind a private native SQLite phase journal. Previously primitives were individually staged and manually composed by the drill. Explicit initialization requires an empty private directory; reopen never auto creates missing/empty state. Configuration/schema/state/inode/mode/owner checks fail closed. No default network, timer, key persistence or production installer. STARTED phases never expire/replay; unknown completion remains operator-visible and blocked.

47 new checks pass: competing handles, actual committed SQLite checkpoint/lost replies at all4 transitions, failed/malformed capture, lost upload responses, record failure, close/restart, unsafe paths/corrupt metadata and fresh Node process. Positive reconciliation uses independently supplied trusted record digest/key and exact context/archive/receipt; no upload retry and priorAttemptProvenStopped=false. Late old continuation cannot overwrite confirmed metadata. COMPLETE is a record of prior local confirmation, not current archive health. No source-writer ownership is cleared. Full signed41+4/deviceDO drill runs actual encrypted-journal resume/capture, synthetic B2 upload/readback and private selection through lifecycle before source destruction; source/local archive loss plus journal reopen starts no repeated capture/publication. Exact33-row/16-table parity, revocation/credentials/nonces/expiry and persistence restart remain verified.

All26 local groups pass on exact source. Both hosted audits33/33; Phase2 14/14; portal10/10. Full decoded logs/exact checkouts/merge parents/tree verified, zero error markers. Fresh complete campaign used because off-platform/control-plane code changed outside unchanged90-file production Worker projection. See audit/phase8d/PHASE8D_GROUP1_BACKUP_RUN.md and audit/phase8d/PHASE8D_GROUP1_BACKUP_RUN_EVIDENCE.json.

Group1 NOT READY; P8D-002 P1 OPEN;8D NOT PASS; four-day forecast AT RISK. Durable one-shot lifecycle and positive local selection reconciliation are source-qualified, not an installed scheduler or proof unknown prior work stopped. Actual complete writer/operator/credential/raw bypass restrictions, trusted installer/TLS/failure domain, four external beta-tool installations, source STARTED/legacy reconciliation and authority install/rollback remain. Independent record/key/caller-digest/job-config custody, restricted B2 runtime credential, actual capture/monitor scheduler, real-recipient/signature delivery, current scoped PITR and isolated cloud restore/interruption/rollback/RTO/RPO remain open. Local SQLite/fsync is not power-loss/off-host/same-user isolation evidence. No live provider/cloud/family-data/credential/permission/billing/R2/card/APK/UI/phone changes, merge or deployment. All525 canonical acceptance/owner/review/disposition fields and214/311 mappings unchanged; reviewedSourceSha=null. No invented completion percentage.

### Hosted qualification

- pull_request Brick Phase 2 — Isolated Parent Portal Verification: run42774914208, job129691045265; 14/14; log SHA256 `55c190c75530f3a5fb19b0cb504aded3dae9304f10b01a360d8069f2b58f2faa`.
- pull_request Brick Beta Map and Portal Regression (no cloud writes): run42774914098, job129691041938; 10/10; log SHA256 `3fcadb9264f993f4ebb6dd6b4b434df09476a9f5e580f06e8686ab338756826d`.
- pull_request Phase 8D D1 storage and recovery audit (no cloud writes): run42774914246, job129691045483; 33/33; log SHA256 `6c391020ed576bbb312daa944e8ef02de095b2b0a5a04065f8d29ca7d4db2618`.
- push Phase 8D D1 storage and recovery audit (no cloud writes): run42774908014, job129691027110; 33/33; log SHA256 `6b3c7188ea3077bf2d4012d357de2f9c213a96ec6188acfead2197da11f0cc85`.

### Remaining gates

- Actual complete writer/operator/credential/raw bypass restrictions, trusted installation/TLS/failure domain and four beta-tool installations; STARTED/legacy source-writer reconciliation and authority install/rollback remain.
- Restricted B2 runtime credential and independent durable record/key/caller-digest/job-configuration custody. Private same-host SQLite/files do not prove off-host, power-loss or same-user isolation.
- Actual capture/monitor scheduler/service and real-recipient/signature custody/delivery; one-shot lifecycle is source capability, not an installed schedule. Unknown publication without positive selection proof remains blocked.
- Current scoped least-privilege PITR and isolated cloud restore/interruption/rollback with measured RTO/RPO.
