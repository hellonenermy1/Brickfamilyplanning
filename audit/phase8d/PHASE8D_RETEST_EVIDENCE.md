# Phase 8D test ledger — exact source provenance

| Finding/test | Source | CI run | Result | Limits |
|---|---|---|---|---|
| P8D-001 original mismatch | `14b81332` | [41776381607](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41776381607) | RED: 9 deploy / 3 backup checks | Original reproduction |
| P8D-001 fixed deployment+schema | `e62b301f` | [41777166077](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41777166077) | source+schema green, backup still red | No deployed Worker |
| P8D-002 versioned 18-table source | `4e7bd489` | [41783419493](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41783419493) | ALL CI GREEN | Fake D1 plus source |
| P8D-002 real disposable SQLite | `694d2094` | [41783806915](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41783806915) | ALL CI GREEN | SQLite, not Cloudflare D1; no R2/DO restore |
| P8D-003 high entropy / private secret | `b096a712` | [41784259743](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41784259743) | ALL CI GREEN | No live dev Worker rotation |
| P8D-006 original revoked mutation | `e1e6f9e1` | [41784727728](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41784727728) | RED: revoked-control test failed | Before fix |
| P8D-006 fixed revoked mutation | `168b192f` | [41784886446](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41784886446) | ALL CI GREEN | Source + mocked D1; Cloudflare concurrency pending |

**Required closure:** tests at exact deployment SHA, live Cloudflare state/bindings, isolated complete-stack disaster restore, trust-boundary tests; no inferred PASS.

| P8D-007: concurrent same-segment R2 overwrite | `ddd950be` | [41790943895](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41790943895) | RED: ACKed 100+101, raw retains only 101 | Synthetic R2, source |
| P8D-007: conditional R2 merge+bounded retry | `6c71d878` | [41791153745](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41791153745) | GREEN: concurrent raw/trusted retained | Source + synthetic R2; no live Cloudflare |
| P8D-004: R2 partial write / safety receipt ACK fault | `701b716e` | [41791370163](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41791370163) | GREEN: retries before persistence | Source + synthetic D1/R2 |
| 8D.3–5: ECDSA P-256 device health auth/replay | `57c76914` | [41791527844](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41791527844) | GREEN: wrong/revoked/tampered/expired/replayed | Signed health helper only |
| P8D-008: duplicate sequence overwrites R2 | `43dc3f3c` | [41791762934](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41791762934) | RED: original latitude overwritten | Source + synthetic R2 |
| P8D-008: first-write-wins replay integrity | `6ef174d3` | [41791862854](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41791862854) | GREEN: original raw/trusted packet retained | Source + synthetic R2; full CI 3/3 |

| P8D-009 initial key, body and confirmation defects | `0a8f5c32` | [41793189600](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41793189600) | RED four tests | Real key + mocked D1 |
| P8D-009 canonical key/bounded fix | `a117776b` | [41793357237](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41793357237) | GREEN | Source, mock D1 |
| 8D.11 RSA Access JWT | `5bd329fb` | [41793555257](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41793555257) | GREEN | Synthetic JWKS only |
| 8D.5/7 D1 epochs/current order | `0be32401` | [41793816979](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41793816979) | GREEN | Real SQLite + simulated DO ordering |
| P8D-010 confirmation race false 500 | `8bbb4a47` | [41794274779](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41794274779) | RED; uniqueness prevented ghost | Real SQLite |
| P8D-010 idempotent retry fix | `7c9b0bc4` | [41794488568](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41794488568) | GREEN | Real SQLite |
| 8D.12/14 PIN Origin/rate checks | `2de85106` | [41794792235](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41794792235) | GREEN | Pairing routes only |
| 8D.15 built assets private markers | `d52fff68` | [41794954253](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41794954253) | GREEN | Built assets only |

| P8D-011 missing verified WS lease | `2d624563` | [41797894520](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41797894520) | RED: an unleased DO /ws request returned HTTP 101, not 403 | Actual bundled DO with Node test shim; no live Cloudflare |
| P8D-011 expiry/hibernation/logout/revocation hardened | `1af0ebb8` | [41798531256](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41798531256) | GREEN all 3 CI jobs; P8D-011 regression PASS | Source/CI simulated DO, not live Access/DO or browser continuous-session trial |
