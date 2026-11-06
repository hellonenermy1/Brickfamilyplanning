# P8D-084 — bounded watchdog and durable live-notification retry

Phase8D NOT PASS. SOURCE/CI CORRECTION VERIFIED ONLY at9911251da91002e7e9f82e39afdb8d260053eb66. Exact hosted verification follows below. No live deployment, resource/schema mutation, APK/UI-layout change, R2/card, new binding/service/secret/public endpoint or final525-ID disposition.

## Actual observations recorded before correction
- Source6def0f277fc3dabaaad03ac7357787674d1f21e1: actual local Miniflare root/D1/device-DO reproducer0/3. The64-device overdue sweep exceeds the synthetic per-object50-statement guard; a failed live push is prematurely marked alerted and healthy peers stop; another tick never retries that live delivery. D1 event persistence itself was not lost. PHASE8D_WATCHDOG_RED.txt.
- Intermediate local bounded-work candidate before root coalescing:3 targeted cases pass; concurrent root case fails2 maintenance entries instead of1. This working candidate was not assigned a remote source SHA; do not pretend it was. PHASE8D_WATCHDOG_CONCURRENT_RED.txt.
- Runtimea22f3d338170be27d23db1bb49a1313cf21f426f before bounded waits/parallel groups:5 watchdog cases pass, delayed-receiver case fails because daily backup has not completed while the watchdog waits for a4.5-second receiver. Controlled timers, not live latency evidence. PHASE8D_WATCHDOG_SLOW_RED.txt.

## Resulting behavior
| Path | Behavior and durable progress | Explicit bound |
| --- | --- | --- |
| Scan coordinator | Frozen device row watermark; active-device keyset seek; CAS checkpoint after settled outcomes; late devices enter next cycle |8 device RPCs/page,9-row lookahead,44 SQL guard |
| Device work | Fresh active/heartbeat observation; conditional offline incident updates; due notifications persisted before relay |4 due notifications,44 SQL computation statements plus raw receipt reserve |
| Delivery | Mark alerted only after device DO accepts; retry same canonical event after failure/ack-write outage; other incidents/devices continue |4-second push wait;8-second page admission wait |
| Root | Same-object simultaneous starts share one tick; watchdog/minute/daily jobs start independently; only root owns an alarm |12-second root watchdog wait; request1-second continuation while scan pending,60-second cycle cadence |
| Failure visibility | Fixed redacted task codes; selected-device counts and cycle age; overdue flag; no claimed checked/success count on failed dispatch |Existing authenticated status gains watchdog and watchdog-scan entries;8 entries total |
| Recovery | Normal D1 restart retains checkpoint; cache loss reconstructs from durable devices/incidents/events |provider_cache remains excluded from disaster backups; no historical retry restoration |

The original90-second offline threshold, incident start at last heartbeat+75 seconds, and60-second incident-age alert threshold are preserved. The coordinator owns the60-second scan cadence. A successful device receipt does not impose another cooldown that could skip a device moved earlier in the next scan. Failed/PENDING/RUNNING work retains a60-second retry/lease fence. Completed-cycle success does not stamp fresh success while devices remain incomplete or failed.

The new022 migration is index-only: active-device seek and per-device due-incident seek. It is staged in setup and disposable fixtures only. No archive inventory or state table changes. Historical non-D1 watchdog/alert behavior remains unchanged; this is scoped to the approved card-free runtime.

## Verification scope
29 new independent targeted cases:6 native scheduler/D1/device-DO cases and23 D1/state/timer cases. Includes a real Miniflare alarm-driven64-device scan with no manual continuation; SQL-budgeted pages; root coalescing; failures/slow receivers with healthy peers and independent daily backup; retry/ack-write failure; heartbeat/revocation races; canonical event collision/payload validation;4-alert backlog; cursor/late insert; cache restart; CAS ownership; receipt expiry/cadence; redacted status and indexed seeks. Targeted suites use synthetic clocks/data except the explicitly real Miniflare alarm test. Local package-lock and critical baseline source blob hashes match the pinned remote snapshot; the older dirty checkout was preserved separately.

Prior recovery/security/ACK/retention/refinement/commute/scheduler/beta/native/legacy suites passed on the exact final hosted executable. Unchanged protected-recovery Miniflare RPC-disposal warning remains an existing scoped limitation, not a globally clean disposal claim.

## Limits and next work
These are source/synthetic SQL/RPC/row/admission bounds, not live cloud CPU/rows/day/storage/fleet or end-user alert latency acceptance. The1-second alarm is a requested continuation time, not a platform delivery guarantee. A large/slow fleet can overrun the cycle; status shows overdue/incomplete/failure rather than fabricated coverage. Four due notifications per device can leave a visible backlog. Generic corrupt/unsupported device IDs or cache state fail closed and can need operator repair; this is not a universal poison-row repair protocol.

Timeouts stop waiting; they do not cancel a remote actor or prove its side effect did not occur. A late accepted delivery or lost acknowledgement can lead to another live relay of the same stable event ID. D1 event rows remain unique; live delivery is at least once, not exactly once. Device-DO acceptance is not proof that a parent received/read a WebSocket notification. An incident resolving/revoking exactly between final DB read and remote side effect is not a cross-actor transaction or full distributed snapshot proof.

Backup independence from a delayed watchdog is tested; backup capture quiescence and cross-store consistency are still P8D-002 operational work. Existing scheduled backup is not silently upgraded to independent41+4 capture by this change. Operational private capture/destination/key custody, scoped PITR, isolated cloud recovery/RTO/RPO/rollback, deployed configuration/migrations, Atlas BE-019 learning/trust/decay/model history and all525 owner/independent reviews remain open. No fabricated reviewer or phase exit.

## Exact hosted verification
Push42136186561/job127624802023 and PR42136194330/job127624828824 completed-success, all30 steps each. Portal/map42136194257/job127624828714 all10 success. Actual logs inspected; exact source9911251da91002e7e9f82e39afdb8d260053eb66 confirmed; zero GitHub error markers. PR checkout4195c9f49547359d768c3b81c8239ad32666f2ef into612d4a8b16fb829f9528b06ab6448ab85ac483e6. New29 cases (6 native+23 state), earlier cleanup20/commute12 and all required protected41+4/D1+DO recovery/security/ACK/retention/refinement/background/budget/beta/native/legacy suites pass. Source/CI qualification only. Exact receipts: PHASE8D_WATCHDOG_HOSTED_EVIDENCE.json.

Seven-requirement source/acceptance scope: PHASE8D_WATCHDOG_REQUIREMENT_SCOPE.md/json.
