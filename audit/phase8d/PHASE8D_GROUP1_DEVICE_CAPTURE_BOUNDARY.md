# Group1 — protected device snapshot capture boundary

12 November2026, Singapore. Source667e9e6b042dcec05e91e7a1b93013c3201a803d, treee793224dc2338e9d21c4def0250a3f3e2df62851. Source correction only; no real provider, family-data, target-restore or runtime activation.

## Reproduction and correction

At immutable5083a148, an otherwise valid encrypted package could combine D1 captured at boundaryT with a correctly hashed same-device snapshot atT-1. `sealBackup` and `openBackup` accepted it, and authenticated archive health returned `FRESH`. A separate immutable-before/after test uses the exact old-code-produced AES-GCM ciphertext: the new validator refuses it at open, refuses equivalent new sealing, and health fails after its first read. Ciphertext bytes remain unchanged.

The capture coordinator already checks `snapshot.capturedAt >= context.capturedAt`. The shared protected-package validator now enforces that same lower bound. Both seal and authenticated open use it, so private CLI packaging/verification, health, staged B2 publication and retained exact-version recovery selection inherit the refusal. Invalid packages cannot pass the B2 local-authentication phase or publish a selection record. A formerly accepted selection with a valid MAC and caller digest cannot release the invalid archive.

Same-boundary and later device timestamps remain accepted with exact D1/device bytes preserved. Empty device inventory still works; missing inventory coverage still refuses. Archive format, encryption, identity checks, provider protocol and target code are unchanged. No timestamp is rewritten to manufacture compliance. Authenticated historical packages with pre-boundary device timestamps now refuse; no real stored provider archive was inspected or reclassified here.

## Verification

20 new local cases cover stale snapshots at three positive ages, authenticated old payloads, same/later snapshots, multi-device coverage, empty inventory, trusted-context substitution, health age behavior, zero-request synthetic B2 refusal, private selection retention/read, and both CLI entrypoints. Existing package13, health40, selection40 and B2 destination91 cases pass. Companion evidence records exact hosted source/merge qualification and its scope; no new full-exact-source local workflow campaign is claimed.

Exact-source qualification: push43181998333/job131059979933 and PR43182005815/job131060003390 audits33/33 each; portal43182005512/job131060002688 10/10, Phase2 43182005617/job131060002801 14/14. Complete decoded logs verified with zero errors,20 new boundary cases, existing health/selection/B2 and native populated encrypted41+4/deviceDO recovery success. Mergea9800d94089cb4adea6c3131e610e2e71e9629ff has expected base141cbf42/source667e9e6 parents and identical source tree. No new full-exact-source local workflow campaign is claimed; focused local/regression evidence and exact hosted campaigns are separate.

This is a timestamp-consistency lower bound. It does **not** prove state freshness from a timestamp alone, actual distributed quiescence, trusted clocks, a full cloud restore, complete writer installation or independent key/context/journal custody. It adds no upper timestamp bound or clock-skew allowance beyond the existing coordinator contract.

## Outstanding operational boundary

The fresh two-new-D1 drill remains the already prepared, unapproved scope in PHASE8D_GROUP1_FRESH_SYNTHETIC_DRILL_2026-11-12.md. Its executable/workflow and the original uncertain live-attempt record are unchanged. No Cloudflare/B2 request or new name lookup occurred during this source batch. Do not retry the original uncertain create, repeat old metadata observations, ask for known namespace IDs again, or infer fresh write permission from generic continue.

Group1 stays `IN_PROGRESS_NOT_READY`, P8D-002 `P1_OPEN`, Phase8D `NOT_PASS`. Full live encrypted41+4/deviceDO recovery/interruption, complete runtime/operator/raw-credential bootstrap, independent guard/runner/custody, installed restricted B2 schedule/recipient and genuine acceptance roles remain open. Canonical525 and full acceptance ledger are unchanged.
