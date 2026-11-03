# Brick V1 — Phase 8A Optional / Future Capability Reconciliation

Source baseline: 469-point Final Product AI Acceptance Checklist.

The purpose of this file is to prevent two opposite audit mistakes:

1. failing Brick because hardware genuinely lacks an optional capability; or
2. quietly marking a mandatory function "unsupported" to avoid implementing/testing it.

## OPTIONAL-IF-SUPPORTED — 14 rows

All 14 remain current and none is promoted to mandatory merely because code exists.

| ID | Capability | Current rule |
|---|---|---|
| `ATL-023` | Cellular Timing Advance | Use only if actually exposed; otherwise `VERIFIED UNSUPPORTED`, neutral to core health. |
| `WIT-015` | BLE direction finding/AoA | Only with specialised supported/calibrated hardware. |
| `WIT-016` | Wi-Fi RTT feature detection | Runtime detect phone/AP support; unsupported leaves core normal. |
| `WIT-017` | Wi-Fi RTT Location-ON rule | Never market RTT as a Location-OFF workaround. |
| `WIT-018` | RTT uncertainty | Supported RTT enters fusion with range uncertainty and cannot override stronger conflicting evidence automatically. |
| `SHZ-012` | Location-OFF privileged Wi-Fi evidence | Real-device test; supported path works or blocked path becomes `VERIFIED UNSUPPORTED/BLOCKED`, core stays healthy. |
| `SHZ-013` | Location-OFF privileged BLE evidence | Same real-device capability rule. |
| `SHZ-014` | Privileged cellular fields | Expose only fields proven on actual device/build. |
| `SHZ-015` | Privileged diagnostics | Optional bridge diagnostics only where actually supported. |
| `SHZ-019` | SOS privileged emergency enhancement | Use only if separately tested/supported; durable normal SOS/Evidence Engine remains primary. |
| `HIS-019` | Conservative flight inference | Optional; requires strong multi-signal sequence, airplane mode alone insufficient. |
| `HIS-020` | Flight landing/reconnect notice | Optional and only with strong confidence. |
| `SEC-012` | mTLS defense-in-depth | Optional; never sole device identity layer. |
| `OPS-010` | Silent managed update | Do not claim until experimentally validated on target ColorOS. |

## FUTURE-INTERFACE — 2 rows

Both remain current architecture requirements, but do **not** mean current hardware must implement the future radio technology.

| ID | Requirement | Current rule |
|---|---|---|
| `WIT-019` | Future authenticated ranging provider interface | Architecture can accept future UWB / Bluetooth Channel Sounding / Wi-Fi NAN RTT / authenticated range evidence without redesigning Brick Core. |
| `WIT-020` | Capability honesty | Current devices never claim those future capabilities without runtime detection and real-device validation. |

## Latest-amendment interaction

The Maintenance Console's mention of future radio actions does not promote future radio actuators to supported V1 features. Such actions remain capability-gated and child/user override rules apply only if an actuator is separately proven.

The scheduled Wi-Fi feature is **not** classified optional as a whole. Its Device Owner actuation must be implemented according to the current requirement, while exact target-platform capability/result is validated on the real phones as specified.

## Result

- Optional-if-supported rows: 14 / all mapped
- Future-interface rows: 2 / all mapped
- Optional rows silently converted to mandatory: 0
- Mandatory rows silently downgraded to optional: 0 identified in this pass

Phase 8B/8C/Phase 9 must provide the real device evidence needed for each optional item to become either PASS/ACCEPTED or `VERIFIED UNSUPPORTED` where allowed.
