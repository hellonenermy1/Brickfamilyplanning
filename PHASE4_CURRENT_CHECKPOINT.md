# Brick V1 Phase 4 Current Checkpoint

Date: 2026-11-01
Purpose: exact resume point for Phase 4. **Do not restart or rediscover Phase 4 from older staging SHAs.**

## Current exact candidate

- Android branch: `v1-p4-atlas-trust-android`
- Android SHA: `93d7424d9d9f4a33c283c54411605a6f4871e799`
- Cloud/CI branch: `v1-p4-atlas-trust-cloud`
- Cloud/CI SHA: `6c66ba8735b3362255e29ca51e50fcb52dcc1dff`
- Staging PR: #11, draft/unmerged
- Final exact-pair CI run: `41269624890`

Older Phase 4 pairs/runs are checkpoints only and must not replace this pair:
- `c6bb2026... / 20e6e482... / 41268166679`
- `e0663f09... / 42e61c40... / 41268830935`

## Hosted verification state at this checkpoint revision

Run `41269624890`:

- Phase 4 wire contract + retained Phase 2/3 Cloud regressions — **PASS**.
- Exact Android SHA checkout — **PASS**.
- Android dependency lock — **PASS**.
- Android debug APK + instrumentation APK compile + lint — **PASS**.
- Phase 4 architecture invariant checks — **PASS**.
- Android instrumentation job `124741081195` — **IN PROGRESS** against the exact final Android SHA.

Do not infer the instrumentation result. On resume, fetch run `41269624890` / job `124741081195` first.

## Latest Phase 4 reliability hardening

The final Android candidate adds self-healing to authorised Companion Device Manager presence handling:

1. `CompanionObservationRegistry` keeps only process-local observation-registration state.
2. Current Android companion associations are reconciled before deciding an address is already observed.
3. When an association disappears, its process-local observation marker is forgotten.
4. If the same explicitly authorised companion is later re-associated after that removal is observed, Brick can request presence observation again without a Brick process restart.
5. A failed `startObservingDevicePresence` attempt removes the marker so later normal collection can retry automatically.
6. No extra scan loop, network traffic, permission, or stronger location claim was added.

Final candidate tests added:
- `testObservationRegistryAllowsSameDeviceAfterRemovalAndReassociation`
- `testObservationRegistryRetriesAfterStartFailure`

Existing companion safeguards retained:
- only explicit Android Companion Device Manager associations count;
- arbitrary nearby/bonded Bluetooth devices do not become trusted companion evidence;
- legacy raw Bluetooth addresses are HMAC/privacy-reduced before Brick persistence;
- API 31–32 and API 33+ callback services are separately SDK/resource gated;
- reboot/package replacement clears stale presence state but does not destroy Android associations;
- companion + charging share one weak `device.context` independence group;
- companion context alone cannot manufacture precise/exact location truth.

## Phase 4 deliberate non-claims retained

Do not add these merely to make a checklist look complete:

- no active ping/packet-loss workload solely for environmental evidence;
- no broad raw SSDP/UPnP/NAS probing without measured permission/privacy/power value;
- no fake floor/stairs/lift/corridor classifier without ground truth;
- no time-of-day-only location truth;
- no Phase 4 final location fusion — Phase 5 owns final position/state/area/uncertainty/conflict fusion;
- no claim that API 36 companion modernization is device-verified; current path is the API 31–35 baseline and API 36 remains later compatibility hardening unless actual target testing changes that.

## Audit artifacts now aligned

The following `audit-progress` files have been updated for the final pair and honest verification state:

- `PHASE4_REPORT.md`
- `PHASE4_TEST_EVIDENCE.md`
- `PHASE4_SOURCE_INVENTORY.md`
- `PHASE4_REQUIREMENT_MATRIX.md`
- `PHASE4_DEVICE_VERIFICATION.md`
- `AUDIT_STATUS.md`

`PHASE4_DEVICE_VERIFICATION.md` now includes a dedicated physical companion test covering unassociated-device rejection, presence enter/leave, privacy, association removal/re-association without restarting Brick, retry after registration failure where safely testable, reboot/update stale-cache behavior, and charger/companion anti-double-counting.

## Exact resume procedure

When continuing Phase 4:

1. Fetch GitHub Actions run `41269624890` first.
2. If instrumentation `124741081195` fails, retrieve the completed job logs/artifacts and repair the actual failure without weakening trust/privacy/uncertainty rules; then repin a new exact Android SHA and rerun the full gate.
3. If instrumentation passes, confirm all three run jobs are `success` on the exact pair.
4. Update PR #11 and Phase 4 audit artifacts from `IN PROGRESS` to hosted-CI `PASS` only for evidence the final run actually proved.
5. Keep Phase 4 **NOT ACCEPTED** because real OPPO/ColorOS verification and Phase 2/3 formal dependencies remain open.
6. Do not merge PR #11 and do not formally unlock Phase 5 merely from emulator/CI success.
7. Physical-device tests must still prove background/screen-off provider behavior, Wi-Fi/BLE throttling, RTT supported/unsupported state, cellular/GNSS behavior, companion callbacks/re-association/reboot recovery, replacement/relearning, resource cost and zero manual intervention.

## Acceptance truth

Phase 4 source is hardened and the final hosted build/lint/invariant gates are green at this checkpoint. The emulator instrumentation result is not yet known here. Physical OPPO/ColorOS Phase 4 evidence is not executed. Phase 2 and Phase 3 formal acceptance dependencies remain open. Therefore Phase 4 remains **NOT ACCEPTED** and Brick remains **not production-qualified**.
