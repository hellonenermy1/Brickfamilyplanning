# Phase 8C — CPU failure root-cause investigation and corrective test

**Audit:** 2026-11-04, BEFORE source fix. **Status:** OPEN P1 reliability/battery blocker, exact runtime retest required.
**Workflow:** [41762654245](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41762654245) on source `1cac3870`, evidence artifact `13291900220`.
**Test:** Android 15 emulator, 1,000 durable rows plus refused API endpoint `https://127.0.0.1:1`, 18 ten-second intervals.

## Observations (raw artifact)

- Per-sample CPU % from process `/proc/<pid>/stat` tick deltas: `17.363, 15.833, 23.000, 22.799, 46.545, 72.600, 71.600, 71.800, 72.300, 64.363, 71.100, 72.500, 72.000, 73.300, 72.899, 66.272, 72.100, 73.300`.
- Approximate mean **60.0% of one core**, above contractual emulator CI guardrail 20% mean. Peak **73.3%** below 80% peak. RAM and storage remain below the published smoke limits.
- App `SharedPreferencesImpl` log shows the `brick.xml` fsync-counter buckets increasing from about 100 writes to **over 53,000** in minutes. This is workload amplification, not reasonable stationary operation.
- Source-level reproduction: `BrickLocationService.kickLivePump()` on any failed `LiveApi.send(...)` puts the failed candidate back in `latestLive`, then its `finally` immediately clears the running flag and executes `kickLivePump()` again if the Android network is validated. A validated network does **not** imply Brick's API is reachable. The test endpoint refuses immediately, so this repeatedly signs/retries in a tight loop with **no delay**. This is a source-reachable cause consistent with the measured CPU; the preceding log sampling does not isolate every write-site or assign all CPU to this loop.

## Required correction and strict retest

1. Never retry a failed best-effort Live API request immediately merely because Android connectivity is validated.
2. Preserve only the latest Live candidate on failure (no FIFO explosion), maintain durable Journal separately and always give SOS/critical outbox priority.
3. Use monotonic, bounded backoff and a scheduled retry for Live, avoiding both busy-loop and silent starvation. Newer Live candidate may replace older pending render without overriding actual durable history.
4. Do not let repeated callback/onAvailable events bypass the backoff, and do not delay a newly successful network path longer than appropriate.
5. Unit-test monotonic backoff, cap, no-dropped-current-candidate and failure-to-success reset; rerun emulator failure-resource workflow, inspect raw CPU/fync measurements and verify 20% average/80% max CPU gates without relaxing them. Re-run Android 15 torture and signed build.
6. Keep this finding OPEN until the real 180-second measurement passes. End-to-end live delay and OPPO physical battery belong to 8F/Phase 9.
