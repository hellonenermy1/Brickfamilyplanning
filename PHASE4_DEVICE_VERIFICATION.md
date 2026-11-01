# Brick V1 Phase 4 Physical Device Verification Plan

Date: 2026-11-01
Target: actual Brick OPPO/ColorOS device after prerequisite Phase 2/3 device gates permit Phase 4 verification.

This is a test plan, not evidence that the tests have passed.

## Rules

- Use the exact APK/source SHA recorded in the Phase 4 report.
- Do not reopen Brick, manually sync, restart the service, clear storage or reboot unless the test explicitly injects that failure.
- A recoverable failure that needs manual intervention is a failure.
- Record actual Android/ColorOS version, device model, APK SHA-256, build/version code, test start/end time and relevant provider health before each scenario.
- Do not weaken Android permissions or disable battery protections outside the intended Brick setup merely to make a test pass.
- Preserve raw-vs-trusted evidence; do not rewrite history to make a result look correct.

## A. Provider capability baseline

Record observed capability/health for:

- Wi-Fi environment;
- Wi-Fi RTT;
- BLE environment;
- cellular LTE/NR;
- LAN NSD;
- GNSS sky;
- network context;
- charging/device context.

For every unsupported feature, capture actual platform/hardware evidence and mark `VERIFIED UNSUPPORTED`; never infer support from marketing specs.

## B. Wi-Fi fingerprint learning

1. Learn one stable place over repeated visits with normal Location ON.
2. Confirm BSSID/raw SSID is not present in long-lived Atlas state.
3. Change handset orientation and moderate RSSI; place recognition must not collapse merely because absolute RSSI shifts.
4. Verify relative ordering/cluster evidence remains correlated as Wi-Fi, not extra independent sensors.
5. Screen off and leave Brick untouched through intended moving/stationary/deep-stationary cadence.
6. Verify platform scan-result delivery/throttling behavior and that no tight retry loop appears.
7. Confirm the same Android scan generation is not counted repeatedly.

## C. Common/copied SSID adversarial test

Use a broad/common SSID or controlled copied SSID at multiple clearly separated locations.

Expected:
- SSID semantic signal trends toward common/near-zero location value;
- one copied SSID never anchors the child;
- independent local evidence remains necessary;
- no incorrect relocation occurs when the same SSID appears elsewhere.

## D. Router/AP replacement

1. Establish a repeated place fingerprint using multiple AP/environment signals.
2. Replace/remove one router/AP while keeping the physical place unchanged.
3. Revisit repeatedly without manual Atlas reset.

Expected:
- one missing AP has only weak immediate negative effect;
- place does not disappear while other independent evidence remains;
- replacement signal is learned without being suppressed by months of old place history;
- old AP relation decays/retires only after repeated trusted absence;
- no manual maintenance required.

## E. BLE environment

1. Verify ordinary permitted BLE advertisements can be observed; Brick-owned hardware is not required.
2. Record RSSI/Tx-power/manufacturer/service/SID/PHY capability actually exposed by this device/OS.
3. Move a previously repeated BLE device between distant places.
4. Replace/remove a repeated beacon/device.
5. Perform completed empty BLE bursts where physically reasonable.
6. Repeat with screen off/background.

Expected:
- moving device loses static-place trust;
- one missed advertisement does not mean absence;
- scan failure is degraded/unknown, never absence;
- repeated successful trusted absence may retire old evidence;
- replacement learns automatically;
- BLE RSSI is never shown/used as exact distance truth;
- no manual reset/relearning action is required.

## F. Wi-Fi RTT

If hardware + AP support RTT:
- collect multiple successful ranges;
- verify distance standard deviation/measurement count is retained;
- verify RTT stays correlated with Wi-Fi and cannot double confidence;
- verify unavailable responders fail cleanly.

If unsupported:
- record the actual feature/API result;
- verify Brick reports provider unsupported/unavailable without affecting Core;
- mark `VERIFIED UNSUPPORTED` only from observed device evidence.

## G. LAN environment

For each supported NSD category available in the test environment:

1. discover a stable service repeatedly;
2. remove/replace that service;
3. run another unrelated NSD category while the original service is absent;
4. cause discovery failure/denial separately.

Expected:
- unrelated category cannot age the original service;
- only successful same-category absence may contribute weak negative evidence;
- discovery failure is unknown/degraded, not absence;
- place must survive a TV/printer/router service replacement when other evidence remains;
- no exact coordinates are inferred from a LAN service alone.

Document any ColorOS/Android local-network permission behavior. Do not broaden to raw LAN scanning just to make the checklist pass.

## H. Cellular environment

Exercise, where naturally available:
- LTE only;
- NR/5G;
- LTE↔5G change;
- serving-cell change/handover;
- neighbor-cell set change;
- Timing Advance available/unavailable;
- weak/strong radio conditions.

Expected:
- exposed fields are recorded honestly;
- cached `CellInfo` is not learned repeatedly as new evidence;
- changing cell environment cannot relocate the phone against stronger consistent independent evidence;
- no tower triangulation claim.

## I. GNSS sky environment

Collect repeated scenarios where practical:
- open sky;
- partially constrained/urban environment;
- near/inside building;
- recovery to open sky.

Expected:
- aggregate constellation/count/CN0/azimuth/elevation/used/carrier patterns change plausibly;
- same `GnssStatus` snapshot is not re-counted by foreground pulses;
- Brick may label aggregate sky quality as open/constrained/blocked/degraded/mixed but never claims a proven multipath cause without evidence;
- satellite identity itself is not a permanent location identifier;
- GNSS sky evidence alone does not become exact location truth.

## J. Network context and loss/recovery

Exercise:
- Wi-Fi → mobile;
- mobile → Wi-Fi;
- validated → captive/unvalidated if safely available;
- Internet/network loss;
- recovery.

Expected:
- offline transition is journalled locally and backfills automatically;
- no extra manual sync;
- no active ping flood or needless network traffic;
- network context remains weak evidence and never creates building-level coordinates.

## K. Environmental/activity approach sequence

Repeat a real approach/departure several times, such as vehicle → stationary → walking → stationary, together with normal environment changes.

Expected:
- material transitions/short sequence signatures can repeat;
- minor radio churn does not generate a strong transition;
- derived sequence evidence remains in the originating correlation group;
- sequence alone cannot decide final location;
- Phase 5 remains responsible for final fusion.

## L. Replacement / poisoning matrix

Explicitly verify the Phase 4 exit cases:

1. common SSID;
2. copied SSID;
3. moving BLE device;
4. replaced router/AP;
5. replaced BLE beacon/device;
6. replaced LAN device/service;
7. changed cellular environment.

For every case record:
- initial learned state;
- injected/environment change;
- raw evidence observed;
- Atlas candidate/trust effect;
- whether incorrect relocation occurred;
- whether manual intervention was required.

Required result: **no case may incorrectly relocate the phone merely because the environmental signal changed/spoofed/moved.**

## M. Lifecycle/recovery

Repeat selected Atlas tests across:
- Brick process kill;
- provider callback loss/restart where testable;
- phone reboot;
- app update preserving compatible state;
- temporary network outage;
- encrypted Atlas-state restore;
- deliberately corrupt Atlas-state test build/path.

Expected:
- valid Atlas state restores automatically;
- corrupt state fails closed and relearns without poisoning Core;
- no recoverable case requires reopening Brick or manual sync.

## N. Resource measurement

Measure real-device deltas with Phase 4 active:
- 24-hour battery drain relative to accepted baseline;
- CPU/wake behavior;
- memory;
- evidence-journal growth;
- Atlas-state size;
- mobile/Wi-Fi data use;
- scan cadence under moving/stationary/deep-stationary states.

Do not call an optimisation successful if it saves power/bandwidth by materially degrading tracking accuracy or safety behavior.

## Acceptance recording

For each test use one of:
- `PASS — DEVICE VERIFIED`;
- `FAIL — REPAIR REQUIRED`;
- `VERIFIED UNSUPPORTED` with actual device/API evidence;
- `NOT EXECUTED`.

Emulator results are not substituted for this file's physical-device gates.
