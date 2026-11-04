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
