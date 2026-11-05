# Phase8D failed-work isolation — reproduction before correction

Baseline e829900424523d6510b26371bdf45035dff27b6a; protected-backup executable c3033e9e75b4c7b1eafa48a2fd51775f7f8a06eb. Formal8D NOT PASS. No live cloud/phone or family-data access.

## P8D-077 — scheduled enrichment errors report success

Local native D1/scheduler chain injects delayed failures at the actual semantic cleanup, per-device refinement, refined cleanup and commute refresh function entries. Every injection is reached; peer devices/commute paths are attempted. All four fail the assertion that scheduler maintenance must reject/report FAILED: actual result is success. RED: PHASE8D_ENRICHMENT_RED.txt. Scope: synthetic Miniflare fault seam, not actual provider outage. Initial harness reused a device key and failed setup at its uniqueness constraint; that setup failure is not product evidence and was corrected before these four reproductions.

Cause: worker-v9 catches semantic/per-device/refined errors; worker-p8b catches commute selection failures and transforms refresh rejection into fulfillment. Existing073 promise draining cannot observe errors already suppressed. No durable per-task failed-work receipt/backoff is present. Planned correction: bounded D1 receipts/leases, aggregate failure after independent peers run, retained scheduler failure/alarm and bounded retry. Do not remove the trackers' independent request/safety handling.

## P8D-078 — optional refinement prevents durable evidence ACK

Hypothesis evidence route awaits processRefinementsForDevice after signed raw records and normalized inputs commit, before returning exact ACK. The local native RED test injects an optional refinement error, confirms actual raw/normalized rows are durable and observes503 instead of200. Required raw/semantic persistence must remain fail-closed; optional derived processing moves to the existing automatic pending-frame scheduler. Full RED result: four false-success cases plus this durable-ACK case (0 passed/5 failed).

## P8D-079 — corrupted refinement input is silently treated as success

Before correction, actual local D1/object-adapter tests with trusted bounding endpoints reproduced missing object, malformed JSON, foreign envelope and invalid hypothesis: all four fail the expected failure assertion (no rejection). The no-endpoint case remains intentionally pending and passes. RED: PHASE8D_REFINEMENT_CORRUPTION_RED.txt (1 passed/4 failed). readFrame returns null on corruption and interval smoothing exceptions continue silently; a corrupt frame can also prevent healthy frames in its interval from processing. Planned correction: validate each frame independently, retain failed inputs for bounded retry, process healthy peers and report aggregate failure after progress. This does not establish fair processing beyond the existing100-frame cap.

## Implementation and local verification

The corrections use the existing reconstructible provider_cache operational table: fixed task namespace, active-device claim fence, compare-and-swap lease ownership,5-minute abandoned lease recovery,60-second success/waiting cooldown and failure backoff60/120/240/480/900 seconds (900 cap). Separate per-device receipts mean a failing device does not back off the global refinement scan. Receipt writes failing also reject maintenance; a stranded RUNNING claim expires after5 minutes. Claims fence receipts, not all derived side effects; do not claim exactly-once processing. Completed ticks do not erase prior success timestamps after failure. No-endpoint return0 is explicitly WAITING and does not invent a lastSuccessAt.

Each refinement/commute selection is reduced to4 devices per invocation to limit added D1 receipt overhead; durable cursors rotate, so waiting devices no longer monopolize the first20 positions. Refinement work still has100-frame/8-interval bounds. This is a source bound, not measured cloud query/CPU or fleet-latency acceptance. Provider cache receipts expire30 days after their last write via existing cleanup and are deliberately excluded from the existing structured backup; failure history is reconstructed, not restored. No new migration, service, secret or live write is needed.

Scheduler errors are aggregated after independent paths/peers run, and child commute rejections reach the existing scheduler-owned durable FAILED/alarm/retry path. Cached parent commute reads catch errors only after the task attempts to record failure; a receipt-store outage cannot promise a durable per-task record, but scheduled re-selection remains. Non-OK history reads now reject rather than claim created-zero success. The existing authenticated, active-device beta status response includes six bounded redacted task states (no lease, provider errors, payloads or coordinates); no new public route/UI redesign.

Evidence raw/semantic/normalized inputs still commit before exact ACK; optional refinement is handled from its durable pending-frame index by automatic scheduled processing, including either endpoint/upload order. Derived history can therefore appear on a later scheduled rotation rather than in the upload request. Required persistence failures remain fail-closed and existing signed evidence/DER/409 tests pass. Replayed signed uploads receive identical exact ACKs during optional outage.

Local GREEN suites:12 actual D1 receipt/backoff/concurrency/privacy/rotation cases;7 real local scheduler/ACK/cached-response/authenticated-status cases;5 actual D1/object corruption/healthy-peer cases. Existing refined-history, smoothing and signed evidence route regressions pass. RED/GREEN logs retained beside this report. Hosted status is recorded in the single current operations checkpoint; do not infer CI/live acceptance from local logs.

## Remaining boundaries

### P8D-077 follow-up: daily backup independence

The first corrected candidate7b19ddbc made minute faults truthful but also repeated derived work inside the inherited daily invocation. RED follow-up adds a native assertion that an independent completed daily backup retains its positive daily success lease: semantic/refined-cleanup faults fail this assertion (2 failures;5 other cases pass), proving that a persistent minute fault can repeatedly retry an already successful daily job. PHASE8D_DAILY_ISOLATION_RED.txt records this before correction. The daily cron must run its inherited backup/cleanup chain and skip minute-only derived work; minute enrichment failure remains durable and retryable independently. No original backup error is suppressed.

Poison-frame fairness beyond the100-frame window, automatic repair/quarantine for persistent corrupt inputs, Atlas provider task receipts and broader provider isolation remain open. Corrupt inputs are retained and reported with capped retry, not silently discarded. No complete failed-work/cloud/fleet acceptance is inferred. The525 canonical rows/classes and final acceptance reviews remain unchanged. Existing protected archive/source recovery must pass again in CI because the real scheduled chain changed. No APK, UI, deployment, reset, cloud mutation, family-data access or R2/card activation.


P8D-080 correction: earlier backed-up-receipt descriptions were wrong; provider_cache is in TRANSIENT_RECOVERY_TABLES. The actual encrypted disaster drill now proves exclusion and failure reconstruction from retained pending input. Historical evidence is preserved; no archive inventory was silently changed. Lifecycle updates supersede the original100-frame-window description with rotating8-frame pages, per-frame three-attempt quarantine and signed replay repair.
