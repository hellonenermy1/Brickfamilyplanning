# Brick V1 — Phase 8C.19 Race/Concurrency Audit (2026-11-04)


**FINAL RACE AUDIT UPDATE — PASS on the frozen Android software boundary.** The last direct held-writer tests (production `purgeBrick` vs service, diagnostic sampler, fall HandlerThread, pre-existing signing task, independent deprovision-origin migration and post-purge late Binder/crypto callbacks) completed successfully as part of [120-test Android 15 emulator run 41769491366](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41769491366). Final source `2c492efff01095e17f96af3c24ac07ac0b5c3739`. P8C-008 and other original race findings now **VERIFIED CLOSED in the final closure matrix**. The old `RETEST IN PROGRESS` statements in the preserved chronological report below are historical. OPPO-specific lifecycle/Binder timing remains device verification in Phase 9. [Final decision](PHASE8C_FINAL_ACCEPTANCE_2026-11-04.md).


**Scope:** `hellonenermy1/Brickfamilyplanning`, branch `v1-p8c-android-deep-audit`. **State:** RETEST IN PROGRESS, not unconditional PASS. Source identity must be read from the exact test run; docs-only commits do not certify new source. Original Phase 8 PDF 8C.19 and its strict no-P1 exit rules apply.

## Real high-risk races investigated

| Race | Failure control | Observed direct evidence | Residual status |
| --- | --- | --- | --- |
| SOS event vs SOS active state | One SQLite safety-outbox atomic transaction; reject torn write | `Phase8DurabilityTortureInstrumentedTest` atomicity and reopen/fault scenarios, earlier 95+ test run | Test passed; formal P8C-001 ledger reconciliation |
| HIGH fall vs safety interlock | Event + protection deadline same durable transaction; no false inactive state | `Phase8DurabilityTortureInstrumentedTest` HIGH fall fault and reopen | Test passed; P8C-011 ledger reconciliation |
| Old Location/Fused/fallback vs new accepted GPS | Measurement `elapsedRealtime`, mocked/stale rejection, `MeasuredFixGate` used by real service | `Phase8FusedFreshnessInstrumentedTest`: 40 rejected callbacks + later genuinely fresh measurement; [Android emulator run 41765452362](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41765452362) **PASS, 113 tests** | Repeated-callback direct decision boundary passed; service supervisor scenario needs honest scope |
| Remote privileged reply vs deprovision | Permanent Shizuku shutdown fence, reject stale generation, serialize privacy-key reductions | `Phase8ShizukuStaleReplyAfterPurgeInstrumentedTest` and `Phase8ShizukuDeprovisionFenceInstrumentedTest`, [run 41765068718](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41765068718) **PASS** | Direct Shizuku late-callback race passed |
| Late crypto signing vs purged identity | `DeviceKeys.getOrCreate` and fault writes fail closed after deprovision | `Phase8CryptoPostPurgeIsolationInstrumentedTest`, ten post-purge calls, [run 41765068718](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41765068718) **PASS** | Direct crypto rematerialization race passed |
| Corrupted/missing purge stage vs process restart | Fail-closed `INVALID` and independent no-backup origin marker | Android 15 cold start after bad stage and missing entire stage XML [run 41765068718](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41765068718) **PASS** | Source-verified for tested corruption/removal cases; total destruction of all independent markers cannot be distinguished from fresh install |
| WorkManager cancel vs in-flight job | Cancel, wait for terminal, prune, prove no Brick WorkInfo | `Phase8WorkManagerDrainInstrumentedTest` [run 41765068718](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41765068718) **PASS** | Scope covers registered Brick chains |
| Location service shutdown vs running journal/network/health writer | Active-instance gate waits for all five executor pools to **terminate**, bounded fail-closed timeout in `purgeBrick` | `Phase8ServiceWriterDrainInstrumentedTest` added, intentionally uninterruptible writer | **LATEST RUN PENDING** — a source fix alone is not closure |
| Diagnostics `cancel(false)` vs current sampler write | `DiagnosticMonitor.awaitQuiescent` accounts for running samples after cancellation | `Phase8AuxiliaryWriterDrainInstrumentedTest` and `Phase8AuxiliaryProducerDrainInstrumentedTest` registered in emulator CI | **LATEST RUN PENDING**; second test holds real sampler via lock |
| Fall `quitSafely()` vs in-flight evidence handler | Retain old HandlerThreads and join before purge, never restart Deep Off fall updater | Same two auxiliary tests, including held handler work | **LATEST RUN PENDING** |
| Network validated vs offline Brick API | Failed Live upload uses capped 2–60 sec backoff, no immediate retry recursion; durable queue separate | 183-second refused-endpoint run [41764035200](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41764035200): mean CPU 1.693%, peak 9.818%, no process death | **PASS** for specified source `74e6e6d1`; exact final-source budget rerun pending |
| Android 10 Wi-Fi action vs real hardware state | Command success requires actual state; hard-reject remains `failed` | Actual Device Owner emulator [41762063429](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41762063429): platform refused OFF, `actual=true`, `status=failed`, correctly persisted | **CAPABILITY-UNSUPPORTED** on this Android 10 emulator; OPPO hardware pending |

## Correctness and privacy boundaries

- Never mark a failed radio request `completed` merely because a command was issued; a platform refusal is a factual unsupported capability.
- Work cancellation, `stopService`, `Executor.shutdownNow`, `quitSafely`, and a returned Binder call are **not** themselves proofs that writers are finished. Each writer path needs its own completion fence.
- The first persisted deprovision state must prevent post-purge state recreation. The only retained provenance is the non-sensitive stage XML and its static independent no-backup marker, until Android uninstall.
- Fall/SOS safety durable outbox and Location Journal remain independent of best-effort Live UI previews, so Live backoff cannot suppress urgent events.
- The 3-minute emulator CPU/RSS/storage test is not evidence of OPPO physical battery, RF, or GNSS performance.

## Remaining 8C.19 acceptance condition

A passing exact-source emulator run must include **all** three producer-drain regressions and the unchanged post-purge tests. A passing deep-audit, signed release and resource test must reference the same final production source. P8C-008 stays OPEN while any asynchronous writer or original reproduction lacks verified coverage. The original `PHASE8C_FINDINGS*` records remain immutable.
