# P8D-071 — supported 20-point location batch exceeds actual D1 compound SELECT limit
Recorded before correction, inherited location-ingest-v6.ts at beta488b34f2; active work audit/phase8d-d1-qualification.
Severity P1 (backlog delivery unavailable at supported batch size); requirements DAT-012/017/024, BE-002, QA-016; PDF8D.4/.5/.6/.8.
Actual reproduction: scripts/test-phase8d-d1-ack-faults.mjs signs a valid ordered20-point packet and sends it through actual card-free Worker/native Miniflare D1. HTTP500 body: D1_ERROR: too many terms in compound SELECT: SQLITE_ERROR. Failure occurs before intended second-history-group fault.
Root source: persistAccepted builds up to20 UNION ALL SELECT terms, one per packet, although MAX_BATCH=20 and binding count80 pass their separate bound. No proof yet of current physical OPPO's backlog root cause.
Required: one bounded VALUES-derived insert with transactional per-device active fence, preserving atomicity/first-write identity and explicit20-point ACK. Exercise native20-point success, partial direct-history outage/retry, duplicate idempotency and revoke ordering. Re-run original SQL/revocation regressions.
Status: REPRODUCED; correction pending. No production writes/deploy.
