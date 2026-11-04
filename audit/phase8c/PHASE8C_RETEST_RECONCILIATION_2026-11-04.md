# Phase 8C retest reconciliation — 2026-11-04

**FINAL RETEST STATUS (2026-11-04): 13/13 original findings VERIFIED CLOSED for tested Android source/emulator scope; CPU hot loop also VERIFIED CLOSED.** Frozen production SHA `2c492efff01095e17f96af3c24ac07ac0b5c3739`; [120-test emulator retest](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41769491366), [deep audit](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41769474692), [signed APK](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41769396317), [Android 10 Device Owner](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41769396337) and [resource gate](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41769396389) all PASS. See [final acceptance decision](PHASE8C_FINAL_ACCEPTANCE_2026-11-04.md) and [finding-by-finding closure](PHASE8C_FINDING_CLOSURE_MATRIX_2026-11-04.md). The original `IN PROGRESS` reconciliation below is **historical** and preserved to avoid erasing audit history; it is not the current verdict. OPPO/ColorOS-only behavior remains for Phase 9.


**Classification: IN PROGRESS / NOT A PASS.** Historical `PHASE8C_FINDINGS*.md` reports are retained as original failure evidence. `PHASE8C_RETEST_EVIDENCE.md` retains earlier failed retests and one explicitly verified closure. This supplement records later independently read source/test evidence without erasing that history.

## Scope and immutable identifiers

- Original finding baseline: `204a141e90c078b6c2008778bd6c01bcbb8a4622`.
- Post-remediation Android production freeze: `967e5d5ceb7e485af997eb0f6380e9544cd39e79`; subsequent audit-branch changes do not modify `app/src/main`.
- Android 15 emulator GitHub Actions [run 41670141287](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41670141287), job `126036000428`: **SUCCESS**, 25 instrumented suites, **95 tests**.
- Android 10 actual emulator Device Owner [run 41665283987](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41665283987), job `126018817998`: **SUCCESS**, `Phase8Api29AutoTimePolicyInstrumentedTest`, one test.
- Production privacy [run 41669979913](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41669979913): **SUCCESS**.
- Exact original fix commit for every finding was **not recovered from the GitHub connector**; the production freeze SHA is verified implementation identity, **not** proof of each earliest fix commit. Do not backfill guesses.

## Finding-by-finding audit

| Finding | Severity | Original failure / requirement | Current direct evidence | Closure verdict at this session |
| --- | --- | --- | --- | --- |
| **P8C-001** | P1 | SOS event and active state not atomic (`SAFE-005`) | `Phase8DurabilityTortureInstrumentedTest.testSosEventAndAuthoritativeStateSurviveReopenTogether`; `testSosTransitionFaultCannotCommitEventWithoutState`; both in successful run 41670141287 | **Retested at local-store fault boundary; formal closure bookkeeping/fix SHA outstanding** |
| **P8C-002** | P1 | Rejected fused callbacks suppress active reacquisition (`REACQ-004..007`) | `Phase8FusedFreshnessInstrumentedTest` two passing tests prove timestamp retention and stale-sample rejection; production `BrickLocationService` source gate requires `rawAccepted && FUSED` for measured freshness | **PARTIAL.** Passing PositionEngine tests do not themselves demonstrate repeated rejected service callbacks + supervisor reacquisition completion. Preserve open until that reproduction is evidenced |
| **P8C-003** | P1 | Wi-Fi command result confirmed too early (`WIFICTL-002/008`) | Two `Phase8WifiVerificationInstrumentedTest` tests pass for target-vs-observed state; production uses bounded `awaitWifiState` | **SOURCE/HELPER RETEST ONLY.** No actual delayed Android Device Owner state-transition test shown. OEM capability/transition behavior is Phase 9; determine whether a closer emulator original-reproducer is needed for 8C closure |
| **P8C-004** | P1 | Missing/corrupt Policy Ledger treated as clean (`DEPROV-002/003`) | `Phase8PolicyLedgerIntegrityInstrumentedTest`: initialized-empty, missing, malformed/deleted records and legacy-marker cases passed | **Retested at local provenance boundary; formal closure bookkeeping/fix SHA outstanding** |
| **P8C-005** | P1 | Purge fails to remove all Brick persistent state (`DEPROV-001`) | `Phase8PurgeInventoryInstrumentedTest.testProductionPurgeDeletesAndVerifiesCompleteKnownInventory` passes real production purge for five named databases, 17 preference names, three files and four Keystore aliases | **PARTIAL.** Fixture represents *known listed stores* and the code verifies actual removal, but this alone cannot prove a full source-wide persistence inventory with no unnamed stores |
| **P8C-006** | P1 | Paired device silently regenerates missing identity key (`PLT-008..010`) | `Phase8DeviceKeyContinuityInstrumentedTest`: missing alias and replacement mismatch both fail closed (2 tests passed) | **Retested at Keystore identity boundary; formal closure bookkeeping/fix SHA outstanding** |
| **P8C-007** | P1 | Ledger compaction evicts active records (`DEPROV-002/003`) | `Phase8PolicyLedgerIntegrityInstrumentedTest.testActiveProvenanceSurvivesHeavyRevertedHistoryChurn` passed through 400 reverted-history writes | **Retested at compaction boundary; formal closure bookkeeping/fix SHA outstanding** |
| **P8C-008** | P1 | Post-purge entry points re-create state (`DEPROV-001/004/005`) | `Phase8PostPurgeIsolationInstrumentedTest.testIndependentEntryPointsRemainInertAfterPurge` and `Phase8WorkManagerDrainInstrumentedTest.testPendingBrickWorkIsCancelledPrunedAndVerifiedAbsent` both passed; CI contains source checks for independent entry-point guards | **Retested for represented entry points; formal coverage/closure reconciliation outstanding**, especially callbacks not individually exercised |
| **P8C-009** | P1 | Android 10 auto-time policy not reverted | Actual Android 10 emulator provisioned Brick Device Owner; apply → provenance → deprovision/release → original state restored in run 41665283987 | **VERIFIED CLOSED** in the original `PHASE8C_RETEST_EVIDENCE.md` |
| **P8C-010** | P2 | Legacy diagnostic title and one-shot/SOS state semantics (`MAINT-003/006`) | `Phase6CDiagnosticsInstrumentedTest.testReportUsesV1OneShotLocationSemanticsAndDurableSosTruth` passed | **Retested at local diagnostic report boundary; closure bookkeeping outstanding** |
| **P8C-011** | P1 | HIGH-fall event and Wi-Fi safety interlock not atomic (`SAFE-011/015/018`, `WIFICTL-004`) | `Phase8DurabilityTortureInstrumentedTest.testHighFallEventAndProtectionDeadlineSurviveReopenTogether` and `testHighFallFaultCannotCommitEventWithoutProtectionState` passed | **Retested at local transaction boundary; formal closure bookkeeping/fix SHA outstanding** |
| **P8C-012** | P2 | Hung Shizuku capability probe blocks privileged executor forever | `ShizukuPrivilegedBridge.refreshCapabilities` now polls a deadline, cancels, invalidates service generation, rotates the lane and rebinds. `RecoverableExecutorLaneTest.timedOutUninterruptibleCallDoesNotBlockReplacementLane` models a hung uninterruptible remote call | **PARTIAL.** No independent direct `capabilities()` never-returning Binder injection+generation-replacement test identified; do not call original path fully retested |

## Source-recovered mapping for P8C-012

The 146-page approved checklist PDF is pinned by SHA-256 `863218723ba49c93a72d4e5e59854425ac1bf32dbebeeae15bca08db96ea6f5e` and is reflected in `PHASE8C_RECOVERED_525_REQUIREMENTS.csv`. The exact applicable IDs are:

- `SHZ-003` — *Shizuku feature detection*, primary: bridge must detect health/capabilities without indefinite waiting.
- `SHZ-017` — *Reboot with Shizuku unavailable*, recovery dependency.
- `SHZ-018` — *Shizuku loss during tracking*, tracking/core isolation dependency.
- `SHZ-001` — *Shizuku is optional enhancement*, cross-cutting core independence.

The earlier P8C-012 record's phrase `atomic SHZ-* ID pending` is now superseded **for identifier mapping only**. The historical original finding itself remains untouched.

## Release/signing and resource evidence blockers

The signed RC [run 41668964798](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41668964798) was retried on 2026-11-04. Attempt job `126300377794` failed at the first signing-secret prerequisite: logs show `BRICK_ANDROID_KEYSTORE_B64` and `BRICK_EXPECTED_SIGNING_CERT_SHA256` empty. No current signed RC APK was built. No private key or secret should be committed; **do not rotate the already-generated permanent signing key**.

Sustained resource-budget workflow has been enabled for the Phase 8C branch, but its new job ID, outcome and measurement artifact remain **UNVERIFIED** until retrieved.

## Next closure gate, strict

**DO NOT mark 8C PASS yet.** Resolve the P1 original-reproducer/persistence-inventory evidence gaps; record actual fix commit identities where recoverable, rerun original scenarios and regressions, independently verify a completed resource-budget job, and inspect an exact signed release APK. If a check is genuinely OPPO/ColorOS-only, record it as `IMPLEMENTED — DEVICE VERIFICATION PENDING` with its device-test plan rather than marking an emulator PASS as device proof.

This reconciliation adds evidence; it does not retroactively change any original `OPEN` to `VERIFIED CLOSED` without the complete correction/retest record required by global Phase 8 Rule 6.

## Post-reconciliation corrections — later in the same session

The original P8C findings remain untouched as immutable observations, but some of their requirement IDs did not match the recovered approved 525-row contract:

- **P8C-010:** historical finding cites `MAINT-003` and `MAINT-006`, which actually mean “maintenance entry has no backend secret” and “future mobile/SIM actuators capability gated”. The diagnostic truthfulness defect is directly governed by **`MAINT-004`**, and its privacy-reduced export aspect by **`MAINT-007`**; cross-dependencies include `REL-010`, `SHZ-008`, and `PORT-014` where presentation semantics apply. Do **not** treat MAINT-003/006 as tested by the diagnostics regression.
- **P8C-011:** historical finding cites `WIFICTL-004`, which governs **child override**, not safety priority. The HIGH-fall/SOS scheduled Wi-Fi OFF protection requirement is **`WIFICTL-007`**. The SAFETY event requirements `SAFE-011`/`SAFE-015`/`SAFE-018` remain related, but each of their separately required UI/evidence paths must still be verified under its proper audit owner.
- **P8C-012:** exact recovered primary ID `SHZ-003` (as above), with `SHZ-017`/`SHZ-018` scenario dependencies.

**New source corrections and pending retests:**

- **P8C-013 — OPEN / P1, SOURCE FIXED / RETEST PENDING:** originally recorded at `72a0af776000494d25bd714765a0d3c2281dcc50`; added fail-closed `Stage.INVALID`/durable origin marker and honest repair UI in implementation commits `74bb63c5`, `9ccf0913` and `4300764c`. Tests in `Phase8DeprovisionStageIntegrityInstrumentedTest` now include **6** scenarios; workflow entry present. No new GitHub Actions passing result has been verified, so this finding is **not VERIFIED CLOSED**.
- **P8C-005 — OPEN / P1, MORE SOURCE GAPS CORRECTED / RETEST PENDING:** the 105 changed-source Kotlin/Java file sweep found `brick_ble_anchors` and possible AtomicFile `.new`/`.bak` content absent from original inventory. Before-fix evidence: `PHASE8C_PERSISTENCE_INVENTORY_SWEEP_2026-11-04.md`; correction `0f2c9ec6`, test fixture changes `25d0e910`, `5b6add11`, `13dc9072`, and fail-closed static audit `tools/audit_brick_persistence.py`. Inventory is now **18 known Brick SharedPreferences namespaces, five databases, three atomic-file base names (nine possible paths) and four Keystore aliases**. Production scanner and expanded emulator retest results remain unverified. “Known” does not prove no more exists.
- **New Android source freeze:** `4300764ca265e1fbdb5558a5c93e38a080bee588`. The old 95-test success at `967e5d5...` is retained strictly as **pre-fix** evidence. A passing CI run at the new freeze must be retrieved before calling latest-code tests successful.

**Outstanding critical question:** in-flight Android location/provider work when `DeepOffManager.quiesce` requests `stopService` but `purgeBrick` proceeds after the WorkManager drain. Source shows process-local `BrickLocationService` executors are stopped in `onDestroy`, but the audit has not yet demonstrated that no in-flight provider callback can re-create AtomicFile or other stores between purge and service teardown. Classify as **P8C-008 coverage unresolved** until an exercised race/failure test proves the boundary. Do not infer it from a one-shot purge fixture.
