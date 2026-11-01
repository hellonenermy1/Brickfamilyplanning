# Brick V1 Phase 6 — Requirement Checklist

Date: 2026-11-01
Status: **IN PROGRESS**

This checklist is the Phase 6 guardrail. Phone-only proof is scheduled for Monday and does not stop computer-side development.

| Phase 6 item | Current status | What is left |
|---|---|---|
| Parent can choose Android Location ON/OFF | IMPLEMENTED | Finish CI, add dashboard buttons |
| Phone stores parent desired state | IMPLEMENTED | Finish CI |
| Phone reports desired vs actual Location state | IMPLEMENTED | Finish CI + real OPPO proof Monday |
| Device Owner applies/repairs ON/OFF state | IMPLEMENTED | Real OPPO proof Monday |
| Commands are authenticated through parent access | IMPLEMENTED | CI + later deployed-cloud proof |
| Commands are device-bound | IMPLEMENTED | CI |
| Commands use nonce/replay protection | IMPLEMENTED | CI |
| Commands expire | IMPLEMENTED | CI |
| Command schema is narrow/validated | IMPLEMENTED | Add strict Boolean/timestamp hardening |
| Silent low-priority `Brick / GPS on/off` notification | IMPLEMENTED | CI + real OPPO proof Monday |
| Parent dashboard shows GPS desired/actual state | NOT YET | Build next |
| Optional Shizuku helper uses a narrow typed allowlist | NOT YET | Build after core GPS control is green |
| Brick Core works when Shizuku is unavailable/lost | NOT YET | Build/test with optional bridge |
| No generic remote shell | ENFORCED | Keep this rule for Shizuku implementation |
| Location-OFF privileged Wi-Fi evidence | PHONE TEST | Test Monday after optional bridge is ready |
| Location-OFF privileged BLE evidence | PHONE TEST | Test Monday after optional bridge is ready |
| Optional privileged cell evidence | NOT YET | Implement only if useful/supported |
| Narrow power-policy diagnostics/repair | NOT YET | Implement after Shizuku bridge |
| SOS-only emergency Location bypass experiment | NOT YET | Implement/test only where Android/OPPO supports it |
| Shizuku health + graceful reboot/loss behavior | NOT YET | Implement/test after bridge |

## Current exact branches

- Android: `v1-p6-device-control-android`
- Cloud: `v1-p6-device-control-cloud`
- Android PR: #17
- Cloud PR: #16

Do not mark Phase 6 complete until every computer-side row above is implemented/tested or explicitly documented as phone-only/unsupported.
