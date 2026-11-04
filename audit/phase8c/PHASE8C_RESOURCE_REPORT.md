# Brick V1 — Phase 8C Resource Audit Report (PDF 8C.18)


**FINAL SOURCE RECHECK — 2026-11-04: PASS.** [Run 41769396389](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41769396389) completed SUCCESS on frozen production source `2c492efff01095e17f96af3c24ac07ac0b5c3739` (GitHub artifact `13294871128`). 186 seconds, 1000 durable queued location rows, refused API endpoint: mean process CPU **3.177%** (<=20%), sampled max **14.307%** (<=80%), peak RSS **169,948 KiB** (<=262,144 KiB), peak local storage **1,508 KiB** (<=32,768 KiB), uninterrupted process and foreground service, uploader failure streak 6 and zero package alarm lines. Raw JSON/CSV verified; this **supersedes** the earlier pre-freeze resource addendum below. The test does not claim real-device mAh or OPPO RF power. [Final acceptance](PHASE8C_FINAL_ACCEPTANCE_2026-11-04.md).


**Current addendum (2026-11-04):** CI resource guardrails **PASSED** in [run 41764035200](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41764035200), source `74e6e6d1`, 183 seconds, mean CPU 1.693%, peak CPU 9.818%, peak RSS 172,140 KiB, peak storage 1,560 KiB, failure streak 6, uninterrupted process/service. The original 58.426% CPU busy-loop was fixed, not excused. Raw 18 samples, incident root cause and remaining scope are in [PHASE8C_RESOURCE_RETEST_PASS_2026-11-04.md](PHASE8C_RESOURCE_RETEST_PASS_2026-11-04.md). **This is a PASS for the measured emulator/resource gate at that source, NOT physical OPPO battery evidence, nor an automatic PASS for later code.** The sections below document the *historical pre-retest state* and are not current claims.

**Audit session:** 2026-11-04 (Asia/Singapore)
**Status:** **IMPLEMENTED / CI EVIDENCE PENDING — NOT A PASS**.
**Android production source freeze after latest source repairs:** `4300764ca265e1fbdb5558a5c93e38a080bee588`.
**Authority:** Brick V1 Phase 8 Full Audit Execution Plan, 8C.18 (CPU, RAM, wake locks, alarms, jobs, sensor/GNSS/Wi-Fi/BLE activity, database writes, network traffic and battery-impact loops).

## What exists and is configured

Workflow: `.github/workflows/v1-phase8-android-resource-budget.yml`, now triggered by changes on the Phase 8C branch as well as the earlier Android-hardening branch (CI change `3f309c288cc8647545d95bd90991c1434d7f261a`).

The workflow is designed to:
1. Build debug APK and boot clean Android 15 API35 x86_64 emulator.
2. Grant required runtime test permissions, start Brick foreground location service and prove it is running.
3. Seed **1,000 durable location records** and force sustained upload failure to test bounded recovery rather than successful-network idle.
4. Sample process CPU, RSS and storage every 10 seconds for roughly **180 seconds**, with process PID continuity and emulator measurements.
5. Inspect bounded retry streak and package-related alarm state.
6. Independently assemble release APK and reject inclusion of debug-only resource harness receiver/action.
7. Upload inspectable JSON/CSV, process dump, batterystats, sensorservice, service list, package dump and logcat as GitHub Actions artifacts.

Configured **CI regression guardrails**, not demonstrated physical battery targets:
- maximum RSS: 262,144 KiB;
- maximum local storage under 1,000-row failure workload: 32,768 KiB;
- maximum observed emulator process CPU: 80%;
- average emulator process CPU: 20%;
- retry streak after ~180 seconds: 1–8;
- package-associated alarm dump line count: 40.

These are smoke/regression guardrails for a synthetic failure workload. They do **not** establish a battery-life promise, real GNSS/sensor power or typical 24/7 sustained use.

## Evidence at session end

**No completed post-remediation resource workflow run ID, job status or measured JSON artifact has been independently retrieved in this audit session. Therefore no guardrail is claimed passed.**

Source code and job definition are implementation/configuration evidence only. Before Phase 8C closes, record:
- exact run ID/job ID/result and commit SHA;
- complete process resource JSON plus raw sampling series;
- compiled release manifest proving no debug receiver/seed action shipped;
- any timeouts/noisy emulator results separately from genuine product regression;
- an explicit PASS/FAIL for each emulator resource budget.

## Additional resource concerns requiring later measurement

- CPU/RAM under repeated location acquisition/fallback/Atlas and real provider errors, not only one persistent network failure.
- GNSS, sensors, Wi-Fi/BLE scan cadence and binder/provider outages; emulator cannot faithfully measure radios.
- Wake locks and alarms: assess actual acquisition duration and whether OS wakes are proportional to tracking mode.
- Energy/mAh/battery drain under stationary, walking, cycling, driving, Live Track, SOS and offline backlogs.
- Disk amplification and write rate for SQLite WAL, checkpoint, queues and failed uploads.
- Maximum data/memory costs at 100,000 records and at 7/14-day equivalent backlog.
- OPPO Reno10 Pro / Reno14 Pro ColorOS real-world endurance is **Phase 9 device verification**, not 8C CI PASS.

## Exit classification

`8C.18 = IMPLEMENTED — RESOURCE EVIDENCE PENDING`.

**Do not close Phase 8C while this evidence is unknown or while other P1/signed-APK gates remain unresolved.**
