# Brick V1 Phase 4 Test Evidence

Date: 2026-11-01
Final candidate pair:
- Android `93d7424d9d9f4a33c283c54411605a6f4871e799`
- Cloud/CI head `6c66ba8735b3362255e29ca51e50fcb52dcc1dff`
- Final exact-pair GitHub Actions run `41269624890`

This file separates test source from executed evidence. A test existing in source is not recorded as PASS until the matching exact candidate executes it.

## Superseded hosted checkpoints

Run `41268830935` verified the immediately preceding manifest-SDK-gate candidate through:

- Phase 4 provider/wire contract + retained Phase 2/3 Cloud regressions — **PASS**;
- exact Android SHA verification — **PASS**;
- dependency lock — **PASS**;
- debug APK + instrumentation APK compile + Android lint — **PASS**;
- Phase 4 architecture invariant checks — **PASS**.

That run is retained as a checkpoint only. It does **not** certify the final candidate because Android source changed afterwards to add companion re-association self-healing and retryable observation-start bookkeeping.

## Final exact-pair hosted gate

Run `41269624890` is the only final hosted gate for Android `93d7424d...` + Cloud `6c66ba87...`.

Current state at this audit revision: **QUEUED / NOT YET EXECUTED TO COMPLETION**.

No PASS is inferred from the superseded SHA pair.

## Android instrumentation source scenarios in the final candidate

### Atlas core

1. Fresh accurate trusted label required.
2. Distinctive signal requires repeated trusted visits.
3. Semantic common/geographically broad signal collapses in location value.
4. One correlated radio family cannot manufacture precise truth.
5. Multiple genuinely independent families may support the same area without presenting support as calibrated probability.
6. Missing provider is not negative evidence.
7. Old model entries expire.

### Signal Trust / adversarial exit cases

1. `TRUSTED_ANCHOR` and `LOCAL_COMMON` stay distinct.
2. Repeated unhealthy/noisy signal becomes `UNSTABLE`.
3. Old signal becomes `STALE`.
4. Charging-only context remains weak.
5. Router replacement does not destroy a cluster when independent evidence remains.
6. Copied SSID learned at distant places becomes common/near-zero value and cannot anchor by itself.
7. One beacon/LAN-device miss does not erase old evidence.
8. Repeated trusted disappearance can retire a replaced BLE beacon and same-category LAN device.
9. LAN absence is category scoped.
10. Cellular-environment change cannot move the candidate away from consistent independent Wi-Fi/BLE evidence.

### Transition / route-gradient tests

1. Minor radio churn creates no transition.
2. Material environment change creates a low-trust transition.
3. Wi-Fi route gradient requires repeated stable AP identities and substantial RSSI change.
4. Wi-Fi gradient remains inside `wifi.scan` correlation group.
5. Broad activity sequence requires sufficient confidence.
6. Derived activity sequence remains inside its originating correlation group.
7. Weak/unknown activity does not teach a sequence.
8. Coarse environmental zone is stable for nearby coordinates and changes for materially separated areas.

### Companion/device-context tests

1. Removed Android companion associations prune stale Brick presence entries.
2. Ephemeral companion presence can be cleared after reboot/update without deleting the Android-managed association.
3. A legacy raw Bluetooth address is HMAC/privacy-reduced before Brick persistence and the raw address is absent from Brick storage.
4. Companion + charging context share one `device.context` independence group and cannot manufacture multiple independent location confirmations.
5. Device context alone is either unusable for location or deliberately weak single-group evidence; never precise truth.
6. `CompanionObservationRegistry` forgets process-local observation state when an association disappears, so the same explicitly authorised device can be re-associated and observed again without restarting Brick.
7. A failed presence-observation start clears its process-local marker so a later collection can retry automatically.

### State/privacy tests

1. HMAC-reduced ID is stable within namespace, differs across namespaces and does not contain the raw identifier.
2. Atlas state round trip is encrypted and restores the model.
3. Corrupt encrypted Atlas state fails closed and is deleted rather than trusted.

### Retained Phase 2/3 Android tests

The Phase 4 instrumentation job invokes `connectedDebugAndroidTest` against the complete candidate test APK, retaining Phase 2 evidence/journal tests and Phase 3 motion/positioning/route tests. Their final status for Android `93d7424d...` remains pending until run `41269624890` completes.

## Reliability invariants locked by final CI source

- Wi-Fi platform scan generation consumed once (`lastConsumedScanElapsedMs`).
- Cellular platform snapshot consumed once (`lastConsumedCellElapsedMs`).
- GNSS status snapshot consumed once (`lastConsumedSnapshotElapsedMs`).
- Only a newly arrived provider scan trains Atlas; the combined 15-second provider cache is match-only.
- Derived transitions inherit their source independence group.
- Missing signal can teach absence only inside its learned observation scope.
- LAN discovery failure is unknown, not absence.
- BLE scan failure is unknown, not absence; only a successfully completed empty burst produces weak absence evidence.
- Total negative penalty remains hard capped.
- Android companion presence is restricted to explicit system associations; arbitrary nearby/bonded devices are not trusted.
- Legacy companion addresses are reduced before persistence.
- Companion + charger remain one weak correlated evidence group.
- Stale companion-presence cache is cleared across reboot/package replacement and must be re-confirmed by Android.
- API 31/32 and API 33+ companion callback services are separately manifest/resource gated.
- Companion observation registration is self-healing across association removal/re-association and start failures.
- Phase 4 does not modify the live 90-byte Core packet.

## Platform-source verification for companion design

Current Android platform guidance ties companion presence observation to explicitly associated companion devices. The current Brick API 31–35 path uses the supported association/presence mechanisms for that baseline. Android 16/API 36 deprecates the legacy string-based observation path in favor of the newer presence-request/event API; API 36 modernization remains a later compatibility hardening item and is not claimed device-verified here.

## Physical-device evidence still required

No emulator/CI result may replace target OPPO/ColorOS checks for:

- screen-off/background Wi-Fi result delivery and Android throttling behavior;
- BLE scan cadence and ColorOS background behavior;
- supported/unsupported Wi-Fi RTT path;
- real LTE/5G handover/Timing Advance availability;
- GNSS open-sky → constrained/indoor behavior;
- authorised companion association + presence callback behavior, removal/re-association and reboot recovery;
- router/beacon/LAN replacement across real repeated visits;
- battery, CPU, memory, storage and network cost;
- process death/restart and reboot with Atlas state recovery;
- zero manual intervention after recoverable failures.

## Current verdict

Final exact-pair hosted CI: **QUEUED / NO FINAL PASS CLAIM**.
Physical OPPO/ColorOS Phase 4: **NOT EXECUTED**.
Phase 2/3 formal prerequisites: **OPEN**.
Phase 4 acceptance: **NO**.
