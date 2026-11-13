# P8D-072 — D1 direct-event adapter writes history after revocation interleaving
Recorded before correction after isolating P8D-071, active branch audit/phase8d-d1-qualification.
Severity P1 authorization/privacy integrity; requirements SEC-022, BE-002, DAT-011; PDF8D.3/.5/.7.
Actual native signed Worker reproduction in test-phase8d-d1-ack-faults: revoke synthetic device after prior durable liveness check but immediately before DirectEventQueue history SQL executes. Request ultimately returns401, yet dev_location_history contains one new row for the revoked device.
Source: DirectEventQueue.persist INSERT OR IGNORE ... VALUES has no transactional active-device predicate, unlike inherited device_events acceptance.
Required: active-device predicate inside the actual direct-history INSERT transaction for every row/batch; verify no history row in exact interleaving and no successful ACK; preserve normal/partial-batch retry/idempotency.
Baseline receipt PHASE8D_D1_ACK_AFTER_BATCH_FIX.txt: first three ACK/fault cases pass, final expected0 actual1. No real family data or live revocation performed.
Status: REPRODUCED; correction/retest pending.
