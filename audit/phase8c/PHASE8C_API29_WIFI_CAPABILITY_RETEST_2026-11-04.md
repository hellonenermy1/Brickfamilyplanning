# Phase 8C — P8C-003 actual Android 10 Device Owner Wi-Fi capability retest

**Date:** 2026-11-04. **Requirement:** WIFICTL-002 (capability-gated only where tested platform permits), WIFICTL-008 (report phone-confirmed actual state).
**Device:** Clean Android API29 AOSP x86_64 emulator; real `adb shell dpm set-device-owner` succeeded and `DevicePolicyManager.isDeviceOwnerApp(com.brick.safety)` returned true.

## Genuine command attempt (not a mocked helper)

Run [41759820564](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41759820564), job `126344591404`, captured actual `WifiScheduleManager.execute()` request for Wi-Fi OFF from initial Wi-Fi ON state.

- Production result: `targetEnabled=false, actualEnabled=true, status=failed, detail=platform_rejected_request`.
- Android `WifiService` logcat: `setWifiEnabled not allowed for uid=10116` (twice, including cleanup).
- Original mandatory *transition-success* test failed because the platform refused the requested state. **Do not report Wi-Fi as OFF or that the Device Owner action succeeded.**
- Official API docs explicitly state `setWifiEnabled` is deprecated/blocked for apps targeting Q+ with a Device Owner exception, and `false` can mean platform cannot satisfy the operation. An exception at API documentation level does not prove a given AOSP/ColorOS image will permit it. https://developer.android.com/reference/android/net/wifi/WifiManager#setWifiEnabled(boolean)

## Product-contract interpretation

The approved Phase 8A `PHASE8A_NEW_01_LOCATION_WIFI.md` states: **`WIFICTL-002` — Device Owner may toggle Wi-Fi only where the tested target platform permits; Brick verifies resulting actual state and records result.** `WIFICTL-008` requires the phone-confirmed result, not the requested state, to drive the UI.

Thus this emulator is **VERIFIED UNSUPPORTED FOR AUTOMATIC TOGGLE ON THIS IMAGE**, not evidence of a broken state-confirmation path. This unsupported classification **cannot be extrapolated** to target OPPO ColorOS hardware. The user and parent must see an explicit failed/unsupported outcome on a rejecting phone; no invisible retry/force-on desired-state loop or undocumented privileged bypass.

## Follow-up verification

- `Phase8Api29WifiDeviceOwnerInstrumentedTest` updated to require real command execution, compare actual `WifiManager.isWifiEnabled` with both returned and persisted values, require `platform_rejected_request` and `failed` if Android rejects, and require actual transitions **and restoration** on systems permitting the command.
- Workflow now uploads `wifi-capability-outcome.txt` distinguishing `VERIFIED_UNSUPPORTED_ANDROID10_EMULATOR` from `SUPPORTED_ANDROID10_EMULATOR`. **New exact-source run still pending** at this checkpoint.
- `WifiOneShotControl.apply` now waits for actual state after an accepted command and refuses radio actuation after deprovision/Deep Off (source `ad0b744f`).
- ColorOS physical Device Owner Wi-Fi verification remains **IMPLEMENTED — DEVICE VERIFICATION PENDING** (Phase 9); require actual ON/OFF/child override/restore, including Wi-Fi refusal/timeout states.

**Status:** the original required-success test revealed a genuine AOSP restriction, truthfully reported by Brick. This is not a test failure to hide. P8C-003 final record requires the new conditional-capability test and current-source CI evidence.
