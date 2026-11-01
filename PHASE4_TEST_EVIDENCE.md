# Brick V1 Phase 4 Test Evidence

Date: 2026-11-01
Candidate pair:
- Android `f6cfcc178ee8a4e7799c176e350c5b967c56069d`
- Cloud `bfe99f59697944467b0ac11fc2253ca16b68fa0b`
- Exact-pair GitHub Actions run `41267183265`

This file separates test source from executed evidence. A test existing in source is not recorded as PASS until the matching candidate executes it.

## Hosted Cloud / wire evidence

Run `41267183265`:

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

Run `41267183265` on exact Android `f6cfcc178ee8a4e7799c176e350c5b967c56069d`:

- exact Android SHA checkout/verification — **PASS**;
- dependency lock — **PASS**;
- debug APK compile — **PASS**;
- instrumentation APK compile — **PASS**;
- Android lint — **PASS**;
- Phase 4 architecture invariant checks — **PASS**.

No newer Android source was pushed after this SHA was frozen for the run.

## Android instrumentation source scenarios on the final candidate

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

### State/privacy tests

1. HMAC-reduced ID is stable within namespace, different across namespaces and does not contain raw identifier.
2. Atlas state round trip is encrypted and restores the model.
3. Corrupt encrypted Atlas state fails closed and is deleted rather than trusted.

### Retained Phase 2/3 Android tests

The Phase 4 instrumentation job invokes `connectedDebugAndroidTest` against the complete candidate test APK, retaining Phase 2 evidence/journal tests and Phase 3 motion/positioning/route tests. Their final status for the exact Phase 4 candidate remains pending until the instrumentation job in run `41267183265` completes.

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
- Phase 4 does not modify the live 90-byte Core packet.

## Physical-device evidence still required

No emulator/CI result may replace the target OPPO/ColorOS checks for:

- screen-off/background Wi-Fi result delivery and Android throttling behavior;
- BLE scan cadence and ColorOS background behavior;
- supported/unsupported Wi-Fi RTT path;
- real LTE/5G handover/Timing Advance availability;
- GNSS open-sky → constrained/indoor behavior;
- router/beacon/LAN replacement across real repeated visits;
- battery, CPU, memory, storage and network cost;
- process death/restart and reboot with Atlas state recovery;
- zero manual intervention after recoverable failures.

## Current verdict

Cloud/wire/regression job: **PASS**.
Final Android dependency lock + compile/test-APK/lint/invariants: **PASS**.
Final Android instrumentation: **IN PROGRESS**.
Physical OPPO/ColorOS Phase 4: **NOT EXECUTED**.
Phase 4 acceptance: **NO**.
