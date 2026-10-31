# Phase 1 Source Coverage — `Yes.docx` → Stable Requirement IDs

Date: 2026-10-31

Purpose: prove that every numbered source section in the current V1 contract has an explicit home in `V1_REQUIREMENTS.md`. This is a coverage map, not an implementation-completion claim.

The source document contains a numbering collision: **two sections are labelled 23G**. Phase 1 normalizes them as:

- `23G-UI` — How degraded positioning should look
- `23G-GROUND` — Fixed Brick Ground Network / BLE receiver anchors

| Source section | Requirement IDs / rule location |
|---|---|
| 1. Core objective | `OBJ-001..003` |
| 2. Final architecture | `ARCH-001..006` |
| 3. Child UI: even more minimal | `CUI-001..005` |
| 4. Brick Managed mode | `MGT-001..004`, later `LOCCTL-*` |
| 5. Primary positioning system | `POS-001..005` |
| 6. Every location carries quality information | `POS-006..015` |
| 7. Speed | `SPD-001..005` |
| 8. Mode of transport | `ACT-001..003` |
| 9. Activity Recognition also controls power | `ACT-004`, `CAD-*` |
| 10. Final update schedule | `CAD-001..007` |
| 11. Satellite-quality intelligence | `GNSS-001..002`, `GNSS-ATL-*` |
| 12. Position acceptance filter | `FILT-001..007` |
| 13. Don't delete rejected GPS | `RAW-001..003` |
| 14. Confidence isn't fake percentages | `CONF-001..002` |
| 15. Official location states | `STATE-001..007` |
| 16. GPS failure vs Location OFF | `FB-001..003` |
| 17. Fallback Engine | `FB-004..005`, plus provider-specific fallback IDs |
| 18. Short-term dead reckoning | `DR-001..002`, `ODO-*` |
| 19. Route-constrained fallback | `ROUTE-001..002`, `PF-*` |
| 20. No insane long-term inertial prediction | `DR-003`, `ODO-007`, `NG-008` |
| 21. Known-place anchors | `ANCH-001..003`, `NG-013` |
| 22. Network intelligence | `NET-001..002`, `NET-ATL-*` |
| 23. IP fallback | `IP-001..002` |
| 23A. Parallel Evidence Engine | `EVD-001..017` |
| 23B. Private Brick Witness Mesh | `WIT-001..009` |
| 23C. Learned Place Signatures | `PLACE-001..005` |
| 23D. Particle-Filter Route Dead Reckoning | `PF-001..006` |
| 23E. Radio-Route Fingerprinting | `RADIO-001..005` |
| 23F. Opportunistic Wi-Fi RTT Indoor Positioning | `RTT-001..004` |
| 23G-UI. How degraded positioning should look | `DEG-001..008` |
| 23G-GROUND. Fixed Brick Ground Network / BLE receiver anchors | `GROUND-001..006` |
| 23H. Geomagnetic fingerprint localisation | `MAG-001..005` |
| 23I. Physical landmark fingerprints | `LAND-001..003` |
| 23J. Learned inertial odometry | `ODO-001..007` |
| 23K. Future Android precision ranging | `RNG-001..004` |
| 23L. Wi-Fi Semantic Landmark Engine | `WIFI-SEM-001..005` |
| 23M. Location-OFF fusion priority and scoring | `FUS-001..012`, `SMOOTH-001..004` |
| 23N. Optional Shizuku Enhanced System Bridge | `SHZ-*`, `LOCCTL-*`, `NOTIF-*`, `CMD-*`, `SOS-PRIV-*` |
| 23O. Environmental Fingerprint Atlas + Signal Trust Engine | `ATL-*`, `WIFI-*`, `BLE-ENV-*`, `LAN-*`, `CELL-*`, `MAG-005`, `GNSS-ATL-*`, `NET-ATL-*`, `COMP-*`, `ARR-*`, `ZONE-*`, `PRIOR-*`, `TRUST-*`, `IND-*`, `NEG-*`, `RELEARN-*`, `PRIV-ATL-*`, `ATL-FUS-*`, `ATL-UI-*`, `ATL-HLTH-*` |
| 24. Location history | `HIST-001..004` |
| 25. History map playback | `PLAY-001..003` |
| 26. Route simplification | `ROUTE-DISP-001..002` |
| 27. Speed history | `SPD-004..005`, `TRIP-001` |
| 28. Stop detection | `STOP-001..002` |
| 29. Geofences | `GEO-001..003` |
| 30. Trip mode | `TRIP-002..004` |
| 31. SOS | `SOS-001..008`, plus `SOS-PRIV-*` |
| 32. I'm Safe | `SAFE-001..003` |
| 33. Local-first reliability | `DUR-001..002` |
| 34. Several days of local backlog | `DUR-003` |
| 35. Sequence numbers | `DUR-004..005` |
| 36. ACK + resend, not duplicate everything | `DUR-006..007` |
| 37. Idempotency | `DUR-008` |
| 38. Critical-event redundancy | `DUR-009` |
| 39. Dead Letter Queue | `DUR-010` |
| 40. Device Durable Object | `DO-001..002` |
| 41. WebSockets | `WS-001` |
| 42. Cloudflare Queue batching | `Q-001` |
| 43. Compact packet format | `PKT-001..002` |
| 44. Binary encoding | `PKT-003` |
| 45. Compression policy | `COMPRESS-001..002` |
| 46. Periodic absolute keyframes | `KEYFRAME-001` |
| 47. Local Supervisor | `SUP-001..003` |
| 48. Cloud watchdog | `WATCH-001..002` |
| 49. WorkManager: secondary recovery only | `WM-001` |
| 50. Android 15 lifecycle handling | `AND-001` |
| 51. OPPO testing | `OPPO-001`, `TST-*` |
| 52. Reno14 Pro recommendation | `OPPO-002..003` |
| 53. Cloudflare security architecture | `SEC-001` |
| 54. Child API authentication | `SEC-002..003` |
| 55. No hard-coded secrets | `SEC-004` |
| 56. Pairing | `PAIR-001..005` |
| 57. Cloudflare WAF | `WAF-001` |
| 58. Current state vs history | `STORE-001` |
| 59. R2 history structure | `STORE-002` |
| 60. Automatic retention | `RET-001..002` |
| 61. Backup strategy | `BAK-001..002` |
| 62. Parent dashboard V1 | `PUI-001..002` |
| 63. Map marker | `PUI-003..004` |
| 64. Smooth movement | `PUI-005` |
| 65. Dashboard status bar | `PUI-006` |
| 66. Parent dashboard quick information | `PUI-007` |
| 67. History interface | `PUI-008`, `HIST-*` |
| 68. Device Health page | `HEALTH-001..002`, `ATL-HLTH-001` |
| 69. Health history | `HEALTH-003` |
| 70. Reliability score | `REL-001..002` |
| 71. Alerts | `ALERT-001..007` |
| 72. Alert hysteresis | `ALERT-008` |
| 73. Battery alerts | `BAT-001..004` |
| 74. Connectivity status | `CONN-001..002` |
| 75. Map hosting | `MAP-001..002` |
| 76. Reverse geocoding | `GEOREV-001` |
| 77. No external analytics | `PRIV-001..003` |
| 78. Crash reporting | `CRASH-001..003` |
| 79. Self-update health | `UPDATE-001..002` |
| 80. V1 acceptance standard | `TST-001..037` |
| 81. Specific failure targets | `FAIL-001..012` |
| 82. Things explicitly excluded from V1 | `NG-001..015` |
| 83. Final V1 feature set | coverage cross-check section W in `V1_REQUIREMENTS.md` |
| V1 design rule 1: Measured beats guessed | `V1_ARCHITECTURE_FREEZE.md` + `OBJ-003`, `CONF-*`, `RAW-*` |
| V1 design rule 2: Durable before fast | `V1_ARCHITECTURE_FREEZE.md` + `DUR-*` |
| V1 design rule 3: Recovery is automatic | `V1_ARCHITECTURE_FREEZE.md` + `SUP-*`, `FAIL-*`, `TST-037` |
| V1 design rule 4: Advanced features only stay when they improve system | `V1_ARCHITECTURE_FREEZE.md`, Phase 8 performance/battery gate |

## Coverage rule

A source requirement may map to several IDs, but no requirement ID may silently lose its source reference. If `Yes.docx` changes, Phase 1 coverage must be revised before implementation proceeds under the changed contract.
