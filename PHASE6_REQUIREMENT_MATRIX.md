# Brick V1 Phase 6 — Requirement Checklist

Date: 2026-11-01
Status: **IN PROGRESS**

Phone-only proof is scheduled for Monday and does not stop computer-side development.

| Phase 6 item | Current status | What is left |
|---|---|---|
| Parent can choose Android Location ON/OFF | IMPLEMENTED | Finish Android CI |
| Phone stores parent desired state | IMPLEMENTED | Finish Android CI |
| Phone reports desired vs actual Location state | IMPLEMENTED | CI + real OPPO proof Monday |
| Device Owner applies/repairs ON/OFF state | IMPLEMENTED | Real OPPO proof Monday |
| Commands authenticated through parent access | IMPLEMENTED | Deployed-cloud proof later |
| Commands device-bound | IMPLEMENTED | Finish Android CI |
| Nonce/replay protection | IMPLEMENTED | Finish Android CI |
| Commands expire | IMPLEMENTED | Finish Android CI |
| Strict Boolean/timestamp/schema validation | IMPLEMENTED | Finish Android CI |
| Silent low-priority `Brick / GPS on/off` notification | IMPLEMENTED | CI + real OPPO proof Monday |
| Parent dashboard GPS desired/actual state + ON/OFF buttons | CI VERIFIED | Cloud/dashboard smoke test PASS |
| Optional privileged helper uses narrow typed allowlist | IMPLEMENTED FOUNDATION | Add actual Shizuku provider |
| Brick Core works when privileged helper unavailable/lost | IMPLEMENTED FOUNDATION | CI + real Shizuku loss test Monday |
| Privileged helper health reporting | IMPLEMENTED FOUNDATION | CI + real Shizuku proof Monday |
| No generic remote shell | ENFORCED | Keep this rule |
| Location-OFF privileged Wi-Fi evidence | NOT YET | Implement typed provider, test Monday |
| Location-OFF privileged BLE evidence | NOT YET | Implement typed provider, test Monday |
| Optional privileged cell evidence | NOT YET | Implement only if useful/supported |
| Narrow power-policy diagnostics/repair | NOT YET | Implement after provider |
| SOS-only emergency Location bypass experiment | NOT YET | Implement only if supported |

## Current branches

- Android: `v1-p6-device-control-android`
- Cloud: `v1-p6-device-control-cloud`
- Android PR: #17
- Cloud PR: #16

Do not mark Phase 6 complete until every computer-side row is implemented/tested or explicitly documented as phone-only/unsupported.
