# Brick V1 Phase 4 Test Evidence

Date: 2026-11-01
Candidate pair:
- Android `c6bb20268b22c4f0567773f70c3f5a3717218437`
- Cloud `20e6e482b06160a4f5d5329b1452e3af02ab7d9f`
- Exact-pair GitHub Actions run `41268166679`

This file separates test source from executed evidence. A test existing in source is not recorded as PASS until the matching candidate executes it.

## Hosted Cloud / wire evidence

Run `41268166679`:

- `Phase 4 wire contract + retained regressions` — **PASS**.
  - locked npm install;
  - Worker/server TypeScript type checks;
  - web TypeScript check;
  - exact Phase 4 provider/wire contract harness;
  - retained Phase 3 route-graph regression;
  - retained Phase 2 evidence ingest, link-integrity and signed-route regressions;
  - retained route-constraint regression.

This verifies the current Cloud head but does not prove Android framework or physical-device behavior.

## Android build gate

Run `41268166679` on exact Android `c6bb20268b22c4f0567773f70c3f5a3717218437` at this audit revision:

- exact Android SHA checkout/verification — **PASS**;
- compile SDK install — **PASS**;
- dependency lock — **PASS**;
- debug APK + instrumentation APK compile + Android lint — **IN PROGRESS**;
- Phase 4 architecture invariant checks — **PENDING** behind compile/lint;
- Android instrumentation — **PENDING** behind build gate.

No PASS is inferred for unfinished steps.

## Android instrumentation source scenarios on the exact candidate

### Atlas core

1. Fresh accurate trusted label required.
   - Reject stale/inaccurate labels.
   - Accept fresh trusted label.
2. Distinctive signal requires repeated trusted visits.
3. Semantic common/geographically broad signal collapses in location value.
4. One correlated radio family cannot manufacture precise truth.
5. Multiple genuinely independent families can support the same area without the result being presented as calibrated probability.
6. Missing provider is not negative evidence.
7. Old model entries expire.

### Signal Trust / adversarial exit cases

1. `TRUSTED_ANCHOR` and `LOCAL_COMMON` stay distinct.
2. Repeated unhealthy/noisy signal becomes `UNSTABLE`.
3. Old signal becomes `STALE`.
4. Charging-only context remains weak.
5. Router replacement does not destroy a cluster when independent evidence remains.
6. Copied SSID learned at distant places becomes common/near-zero value and cannot anchor by itself.
7. One beacon/LAN-device miss does not erase the old evidence.
8. Repeated trusted disappearance can retire a replaced BLE beacon and same-category LAN device.
9. LAN absence is category scoped: repeated printer discovery cannot age Cast evidence; repeated successful empty Cast observations can.
10. Cellular-environment change cannot move the candidate away from consistent independent Wi-Fi/BLE evidence.

### Transition / route-gradient tests

1. Minor radio churn creates no transition.
2. Material environment change creates a low-trust transition.
3. Wi-Fi route gradient requires repeated stable AP identities and substantial RSSI change.
4. Wi-Fi gradient remains inside `wifi.scan` correlation group.
5. Broad activity sequence requires sufficient confidence.
6. Derived activity sequence remains inside `activity.transition`; it cannot appear as a new independent sensor.
7. Weak/unknown activity does not teach a sequence.
8. Coarse environmental zone is stable for nearby coordinates and changes for materially separated areas.

### Companion/device-context tests

1. Removed Android companion associations prune stale Brick presence entries.
2. Ephemeral companion presence can be cleared after reboot/update without deleting the Android-managed association itself.
3. A legacy raw Bluetooth address is HMAC/privacy-reduced before Brick persistence and the raw address is absent from Brick storage.
4. Companion + charging context share one `device.context` independence group and cannot manufacture multiple independent location confirmations.
5. Correct behavior for device context alone is either no usable Atlas candidate or a deliberately weak single-group candidate; it is never precise truth.

### State/privacy tests

1. HMAC-reduced ID is stable within namespace, different across namespaces and does not contain raw identifier.
2. Atlas state round trip is encrypted and restores the model.
3. Corrupt encrypted Atlas state fails closed and is deleted rather than trusted.

### Retained Phase 2/3 Android tests

The Phase 4 instrumentation job invokes `connectedDebugAndroidTest` against the complete candidate test APK, retaining Phase 2 evidence/journal tests and Phase 3 motion/positioning/route tests. Their final status for the exact Phase 4 candidate remains pending until the instrumentation job in run `41268166679` completes.

## Reliability invariants added to source/CI

- Wi-Fi platform scan generation consumed once (`lastConsumedScanElapsedMs`).
- Cellular platform snapshot consumed once (`lastConsumedCellElapsedMs`).
- GNSS status snapshot consumed once (`lastConsumedSnapshotElapsedMs`).
- Only newly arrived provider scan trains Atlas; combined 15-second provider cache is match-only.
- Derived transitions inherit the source independence group.
- Missing signal can teach absence only inside its learned observation scope.
- LAN discovery failure is unknown, not absence.
- BLE scan failure is unknown, not absence; only a successfully completed empty burst produces a weak common sentinel.
- total negative penalty remains hard capped.
- Android companion presence is restricted to explicit system associations; arbitrary nearby/bonded devices are not trusted.
- legacy companion addresses are reduced before persistence.
- companion + charger remain one weak correlated evidence group.
- stale companion-presence cache is cleared across reboot/package replacement and must be re-confirmed by Android.
- Phase 4 does not modify the live 90-byte Core packet.

## Platform-source verification for companion design

Current Android documentation states that companion presence observation is for associated companion devices, `REQUEST_OBSERVE_COMPANION_DEVICE_PRESENCE` is the presence subscription permission, and `CompanionDeviceService` must require `BIND_COMPANION_DEVICE_SERVICE` so only the system can bind. Android 16 deprecates the legacy presence API in favor of `ObservingDevicePresenceRequest`; the current Brick API 31–35 compatibility path therefore remains valid source for the present target but API 36 modernization is not claimed device-verified here.

## Physical-device evidence still required

No emulator/CI result may replace the target OPPO/ColorOS checks for:

- screen-off/background Wi-Fi result delivery and Android throttling behavior;
- BLE scan cadence and ColorOS background behavior;
- supported/unsupported Wi-Fi RTT path;
- real LTE/5G handover/Timing Advance availability;
- GNSS open-sky → constrained/indoor behavior;
- authorised companion association + presence callback behavior and reboot recovery;
- router/beacon/LAN replacement across real repeated visits;
- battery, CPU, memory, storage and network cost;
- process death/restart and reboot with Atlas state recovery;
- zero manual intervention after recoverable failures.

## Current verdict

Cloud/wire/regression job: **PASS**.
Exact Android dependency lock: **PASS**.
Exact Android compile/test-APK/lint/invariants: **IN PROGRESS / PENDING**.
Exact Android instrumentation: **PENDING**.
Physical OPPO/ColorOS Phase 4: **NOT EXECUTED**.
Phase 4 acceptance: **NO**.
