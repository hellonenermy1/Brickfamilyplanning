> **Current evidence supersedes the historical implementation details below.** Executable `00e0174a3181a52550840a178bf29b4d5d1e087c`, [CI 41854951853](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41854951853) 3/3 jobs SUCCESS: v3 captures/restores 38 durable tables in one snapshot transaction, all 48 schema tables have an explicit recovery class. Nonempty coverage, native workerd D1/R2 snapshot/fresh restore and SQLite source-destruction drill pass. Historical v1/v2 are explicitly incomplete current coverage. The old live v2 helper now fails before network/resource creation; it needs upgrading. Full live D1+R2+DO recovery, scale/decoded-size limits and cutover remain OPEN. See `PHASE8D_CONTINUATION_2026-11-04.md`. The historical per-table torn snapshot concern below was already corrected before this continuation; it is not the current implementation.

# Phase 8D — Backup / restore evidence (8D.16, P8D-002)

**Source SHA:** `168b192f2912a44144d55ec2bae3bc64d1580e58` (backup changes in `5138b3c3`; later changes to unrelated dev authentication/controls do not alter backup logic).
**Status:** LOCAL SQLITE + SOURCE PASS; LIVE CLOUDFLARE D1/R2/DO NOT VERIFIED. P8D-002 P1 remains open.

## Reproduced original failure
- Original [41776381607](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41776381607): three backup contract failures. Backup/restore inventories had 12 tables; migration 016 introduced six more durable classes, plus transient classes.
- P8D-002 must not be closed because a source list is updated alone.

## Exact remediation
- New `brick-d1-snapshot-v2` format includes 18 tables: original 12 plus `device_live_track_control`, `device_wifi_schedules`, `device_wifi_schedule_result`, `device_capability_profile`, `screen_time_daily`, `commute_summaries`.
- Validator accepts exact v2 table set only. Original 11- and 12-table v1 formats retain compatibility, with missing post-P8B tables empty and never silently populated.
- `device_location_control` newer result/status columns are also preserved.
- Restored `pending` Location or Live Track commands become `expired` with reason `cancelled_on_disaster_restore`, preventing stale command execution; completed history remains intact.
- `pairing_pin_sessions` (short-lived credential), `provider_rate_window` (rate state), and `provider_cache` (reconstructible external responses) are intentionally excluded. Old pairing tokens remain excluded.
- `scripts/phase8-live-brick-backup-restore.mjs` updated for production migrations 016–018 and nonempty new state + transient exclusion, **but was NOT executed against Cloudflare in this session**.

## Actual isolated SQL drill
- [41783806915](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41783806915) on `694d2094`, all three workflow jobs SUCCESS. Source job runs `scripts/test-phase8d-isolated-sqlite-restore.mjs` against installed SQLite CLI.
- It applies the real production migration chain to a temporary SQLite database, inserts source-side live and revoked state, extracts 18-table snapshot, **deletes the source .db**, applies schema to a fresh target, invokes bundled *production restore function*, verifies every durable row, retains revoked identity and replay high-water, expires pending commands, rejects an occupied target, and verifies the transient tables are empty.
- Separate unit regression verifies v1 11/12-table compatibility, v2 missing table rejection and semantic duplicate-key rejection.

## Important non-pass gates
1. Cloudflare live actual D1 schema/bindings/recovery not inspected; the test used SQLite, **not Cloudflare D1**.
2. R2 route history and Durable Object authoritative current state were **not** restored or reconciled by the D1-only drill.
3. Current paged per-table backup lacks proof of cross-table read consistency during concurrent writes. Needs fault-injection/coherent snapshot proof.
4. Real disaster recovery must reconcile all three persistence layers, alerts, revocation, command state and safety events; never invent missing history.
5. Verify backup lifecycle, access control, encryption, restoration into isolated Cloudflare resources, cleanup and rollback without touching production.

**Verdict: P8D-002 FIXED IN SOURCE / SQLITE RETESTED, P1 OPEN until live evidence and full-stack recovery.**
