# Brick V1 Phase 2 — Active Scope

Date opened: 2026-10-31
Status: IN PROGRESS

Phase 2 is limited to the common Evidence Platform, versioned evidence protocol, durable evidence journal/outbox, cloud ingest/storage foundation, provider capability/health vocabulary, independence groups, sampling coordination, and end-to-end dummy evidence reliability checks.

Explicitly not in Phase 2: particle filtering, learned odometry, geomagnetic matching, Environmental Atlas learning/trust algorithms, Witness Mesh implementation, Ground Network implementation, Shizuku, parent Location control, degraded-position UI, or production qualification.

Canonical implementation approach:

- preserve the current compact live-location V2 packet and its existing safety/location durability path;
- introduce a separate versioned Brick Evidence Batch protocol;
- evidence is always lower transmission priority than SOS/safety and live location;
- every evidence record has provider, family, independence group, monotonic/wall time, provider capability/health, quality/freshness and a bounded opaque payload;
- evidence providers never directly declare an exact child position;
- unsupported optional provider capability is an explicit state, not a tracker failure;
- evidence is encrypted locally before upload and is removed only after an exact server ACK;
- server ingestion is device-authenticated, signed, bounded, schema/protocol validated, replay/idempotency safe and stored separately from live state;
- Phase 2 verification must prove a dummy record survives journal reopen, transmits/dedupes/ACKs safely, and does not alter SOS/live-location priority.
