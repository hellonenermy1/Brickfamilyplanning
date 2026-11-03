# Brick V1 — Phase 8B Findings 013–021 — Final Status

These findings were raised against the original Phase 8B implementation baseline. Their original detailed evidence remains preserved in Git history. Status below is against integrated candidate `204a141e90c078b6c2008778bd6c01bcbb8a4622`.

`CLOSED AT SOURCE` means the source/reachability defect is corrected; applicable requirements still need their owning 8C–8F/Phase 9 runtime evidence.

| Finding | Severity | Original defect | Final source status |
|---|---|---|---|
| P8B-013 | P1 | Fast Live was blocked by Queue/D1/history work | **CLOSED AT SOURCE** — accepted current state has dedicated live endpoint/DO/WS path; durable history remains separate; stage timing fields are wired. |
| P8B-014 | P1 | crash diagnostics outranked Location | **CLOSED AT SOURCE** — work ordering follows `SOS > Critical safety > Location > Health > Evidence learning > Diagnostics`. |
| P8B-015 | P1 | parent Live Track control path absent | **CLOSED AT SOURCE** — authenticated parent command, phone state/expiry and actual-state ACK path are wired. |
| P8B-016 | P1 | universal APK role model absent | **CLOSED AT SOURCE** — durable UNPROVISIONED/CHILD/PARENT_GUARDIAN roles and authorised local reprovision/migration exist; parent role does not run child tracking. |
| P8B-017 | P2 | durable capability profile absent | **CLOSED AT SOURCE** — versioned capability profile is stored/refreshed and reported separately from provider/device health. |
| P8B-018 | P2 | post-enrolment rename absent | **CLOSED AT SOURCE** — authenticated device-ID rename path/UI changes label only, not identity/history/calibration. |
| P8B-019 | P2 | screen-time summary absent | **CLOSED AT SOURCE** — privacy-minimal aggregate local collection, low-cadence sync and parent display wired. |
| P8B-020 | P1 | explicit daily canary/retest subsystem absent | **CLOSED AT SOURCE** — daily silent canaries and exact failed-check bounded retest/escalation path implemented. |
| P8B-021 | P2 | automatic commute summaries absent | **CLOSED AT SOURCE** — conservative summaries are derived from trusted durable history without a second tracker. |

## Informational findings retained

- `INFO-002`: core location/evidence/Witness stack is genuinely wired.
- `INFO-003`: permanent Brick V1 Android signing identity exists.

## Result

- Findings in this file: **9**
- Source-level closed: **9**
- Open source defects: **0**
