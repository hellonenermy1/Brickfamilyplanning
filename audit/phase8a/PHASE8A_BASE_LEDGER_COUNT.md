# Brick V1 — Phase 8A Canonical Base Ledger Count

Source counted: `V1_REQUIREMENTS.md` on `v1-p1-contract`, blob `d43cc538da8565d780b3de9109f9787d881e9dad`.

Count method: every requirement/non-goal table row with a stable ID was counted once by section. Heading/example rows were excluded.

| Section | Domain | Atomic rows |
|---|---|---:|
| A | Product objective / architecture / child UI | 14 |
| B | Managed mode / positioning / speed | 24 |
| C | Activity / cadence / GNSS / filtering / state | 32 |
| D | Fallback fundamentals | 17 |
| E | Parallel Evidence Engine | 17 |
| F | Witness / Ground Network | 15 |
| G | Places / particles / radio / RTT | 20 |
| H | Degraded-position rendering | 8 |
| I | Geomagnetic / landmarks / odometry | 15 |
| J | Future ranging / Wi-Fi semantics | 9 |
| K | Location-OFF fusion / smoothing | 16 |
| L | Shizuku / parent Location / command safety | 32 |
| M | Environmental Atlas / Signal Trust | 60 |
| N | History / playback / stops / geofences / trips | 18 |
| O | SOS / I'M SAFE | 11 |
| P | Durability / protocol / cloud processing | 20 |
| Q | Recovery / lifecycle / device qualification | 10 |
| R | Security / pairing / storage / retention / backup | 16 |
| S | Parent dashboard / health / alerts / battery / connectivity | 27 |
| T | Map privacy / geocoding / analytics / crash / update health | 11 |
| U | Acceptance / failure targets | 49 |
| V | Explicit V1 non-goals | 15 |
| **TOTAL** |  | **456** |

Of the 456 rows, 15 are explicit non-goals (`NG-001..015`). They remain important contract rows because Phase 8 must also prove Brick has not accidentally added forbidden/removed functionality.

## Important counting rule

`456` is the **base ledger count**, not the current final V1 unique-requirement count.

The later approved master plan adds requirements and supersedes some older rows. The amendment ledger currently contains 88 provisional amendment IDs, but Phase 8A must remove semantic duplicates and mark superseded base IDs before publishing the final unique current count.

Therefore it is forbidden to claim `456 + 88 = final V1 requirements` until supersession/overlap reconciliation is complete.
