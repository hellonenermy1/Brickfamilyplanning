# Phase 8C — Android sustained-failure resource retest PASS on defined source

**Date:** 2026-11-04. **Tested production source commit:** `74e6e6d1ca86c0318792917cca21b48aaa16cf39`. **CI:** [run 41764035200](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41764035200) job `126358094715` **SUCCESS**. **Evidence artifact:** `13292510903` (`brick-phase8-android-resource-budget-74e6e6d1ca86c0318792917cca21b48aaa16cf39`). This is not yet a physical OPPO measurement or blanket P8C PASS.

## Real measured 183-second sustained upload-refusal test

Android 15 API35 x86_64 emulator. 1,000 durable location records persisted, `https://127.0.0.1:1` continuously refuses uploads. Instrumentation asserts the fixture's durable rows; foreground location service is confirmed, process remains the same PID.

| Metric | Recorded JSON evidence | Contract guardrail | Verdict |
| --- | ---: | ---: | --- |
| Mean process CPU | 1.693% of one core (1.654% arithmetic mean of CSV samples) | <=20% | PASS |
| Peak sampled CPU | 9.818% | <=80% | PASS |
| Peak RSS | 172,140 KiB | <=262,144 KiB | PASS |
| Peak app-private storage | 1,560 KiB | <=32,768 KiB | PASS |
| Process continuity | true | true | PASS |
| Foreground location service | true | true | PASS |
| Upload-failure streak after 183s | 6 | 1..8 | PASS |
| Package-related alarm dump lines | 0 | <=40 | PASS |
| Release APK debug-only harness | absent | absent | PASS |

18 10-second samples: `9.818, 2.600, 1.454, 1.500, 1.000, 1.200, 1.400, 1.200, 1.099, 0.700, 1.000, 0.800, 1.000, 1.200, 0.800, 1.200, 0.800, 1.000` % CPU.

## Matched failure and correction

Prior matching test [41762654245](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41762654245), artifact `13291900220`, 18 samples **58.426% arithmetic-mean CPU**, 73.300% peak, and over 53,000 SharedPreferences `brick.xml` fsync operations. Source examination found `BrickLocationService.kickLivePump()` restored failed Live payload to `latestLive` and immediately called `kickLivePump()` from `finally` whenever Android connectivity was validated, even though the Brick endpoint remained unreachable. A synthetic paired ID without a pre-existing signing key amplified the loop by writing a repeated `signingIdentityFault`.

- `fa339934` introduced pure, capped `LiveRetryPolicy`: 2, 4, 8, 16, 32, then 60 seconds maximum.
- `9eb15177` stopped immediate recursive Live retry; monotonic deadline is set before the single-flight flag is released and a scheduled retry remains.
- `74e6e6d1` made repeated identical signing-key errors retain the first durable fault timestamp instead of rewriting it hundreds of times a second.
- Later `7aeaa46c` additionally corrected the fixture to create/sign the AndroidKeystore key **before** assigning a paired device ID, so resource tests reflect a validly paired phone.
- `8d4fe131` added deterministic retry-cap unit tests; `b2c62cf8` added 40-error identity-fault no-write-storm instrumentation. Both require their exact test run results to be cited independently if used to close a finding.

## Scope/limitations

The above run verifies 8C.18's **synthetic resource budget for tested production source `74e6e6d1`**. Later code changes can require a repeated exact-source run. The emulator cannot supply credible physical battery drain, GNSS RF power, ColorOS background-kill frequency, BLE/Wi-Fi modem power, or real roaming behavior; these are `IMPLEMENTED — DEVICE VERIFICATION PENDING` in Phase 9. Peak sampled CPU and average CPU are process-core percentages, not total system CPU or battery percentages.

**P8C resource hot-loop verdict:** source defect fixed, directly measured resource budget PASS on 74e6e6d1. Formal final exit awaits exact latest source tests and reconciliation of unrelated P1 findings.
