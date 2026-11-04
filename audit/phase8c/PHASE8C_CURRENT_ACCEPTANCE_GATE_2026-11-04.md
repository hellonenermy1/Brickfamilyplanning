# Brick V1 — Phase 8C current acceptance gate (2026-11-04)

**Branch:** `v1-p8c-android-deep-audit`. **Verdict:** **NOT YET 8C PASS**. This document supersedes *current status* claims in earlier audit reports without rewriting original historical findings. Follow the original PDF 8C.1–8C.20 and strict exit gate: no open P0/P1, no unexplained lifecycle/unknown safety-event path or unknown persistent-data path.

## Completed, independently observed verifications

| Area | Evidence | State |
| --- | --- | --- |
| Original signing material restored | Five secrets successfully accepted by workflow; no private credentials in repo | DONE |
| Signed APK for production correction `42fb05db` | [41764906510](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41764906510), exact original RSA-4096 pin; earlier exact signed APK hashes in `PHASE8C_MANIFEST_REPORT.md` | PASSED for named source |
| Android 15 emulator incl. late crypto purge | [41765068718](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41765068718) job `126361398486`: **112 successful test methods**, 30 suites plus two cold-start tests; manual stage-file corruption/loss both remain recovery-only and do not recreate watched stores; late `DeviceKeys.sign` and key identity attempts fail closed | PASSED for named source |
| Android deep audit compilation/unit/lint + manifest + persistence inventory | [41764906575](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41764906575) | PASSED for named source |
| API29 actual Device Owner Wi-Fi command and ownership reversal | [41762063429](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41762063429). Command **rejected** on actual API29 AOSP emulator, persisted `status=failed`, `actual=true` while desired OFF; the test verifies honest unsupported capability, and the Device Owner auto-time reversal test passes. | CORRECTLY CAPABILITY-GATED, physical OPPO pending |
| CPU/RSS/storage, 183s under 1,000 durable queued records + refused API | [41764035200](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41764035200), job `126358094715`, artifact `13292510903`: mean process CPU **1.693%**; sampled max **9.818%**; peak RSS 172,140 KiB; storage 1,560 KiB; process alive, FGS verified, retry streak 6, package alarm lines 0. All guards PASS. | PASSED on source `74e6e6d1`; current-source rerun required |

## Repairs/new tests requiring latest-source CI reconciliation

- `9eb15177`: remove immediate Live upload failure/validated-network recursion; capped monotonic scheduled retry (2–60 seconds). `74e6e6d1`: never fsync the same paired-signing fault marker thousands of times. Matched 3-minute CPU workload previously averaged 58.426% of one core with ~53k preference writes; new 1.693% is an actual measured correction (not an inflated threshold).
- `7aeaa46c`: create real AndroidKeystore device identity *before* pairing the resource fixture. `8d4fe131`: bounded retry policy unit tests. `b2c62cf8`: repeated lost-key fault timestamp regression.
- `42fb05db`: reject late signing/key-generation/fault writes during all deprovision states. `f12dd52b`, `57b64988`: direct post-purge crypto regression, confirmed PASS in [41765068718](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41765068718).
- `6ab98ce9`/`6c6314e4`: service measured-fix freshness decision extracted for precise P8C-002 original callback scenario. `9cebf4cd`: **40 rejected callback + genuinely newer accepted measurement** instrumentation; latest run still needs independent pass evidence before P8C-002 closure.

## Actual unresolved gate(s)

1. Latest exact-source **signed** APK and `testDebugUnitTest/lint`/instrumentation plus resource budget must be cited after final source freeze (`9cebf4cd` until further changes).
2. P8C-002 repeated-rejected callback test must pass. Documented PositionEngine freshness proof alone was insufficient.
3. **P8C-008 asynchronous writer shutdown/purge** remains open at the general in-flight storage boundary: dedicated late Shizuku and crypto reproducers passed, WorkManager drained, and service guards exist, but no complete proof that an already-running file/db writer cannot finish *after* PURGE's deletion loop. Before closure, require a real lifecycle drain / original race test rather than assuming service `stopService()` synchronously joins its executors.
4. The original P8C-001/004/005/006/007/011 local-store retests passed in earlier emulator suites; formal verified-closed ledger must cite the latest source and test SHA/evidence before changing status. P8C-009 is already verified closed.
5. Physical OPPO GNSS/radios/battery/ColorOS behavior and Device Owner actions must remain `IMPLEMENTED — DEVICE VERIFICATION PENDING` for Phase 9, not claimed from emulator measurements.

**Result:** substantial green evidence, but no unconditional Phase 8C PASS until strict P1 and latest-source gates close.
