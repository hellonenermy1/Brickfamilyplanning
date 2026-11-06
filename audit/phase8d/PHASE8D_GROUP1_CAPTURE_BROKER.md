# Group1 — staged authenticated capture broker

Group1 NOT READY; Phase8D NOT PASS; P8D-002 P1 OPEN. This is an uninstalled private capability handler/client and native-fixture integration. Production Worker imports, routes, bindings, migrations, controllers, keys and configuration remain unchanged.

## Protocol and permissions

The handler/client use WebCrypto HMAC-SHA-256 with separate request/response purpose prefixes. A request binds POST, the exact configured HTTPS URL, key ID, random request ID, timestamp/window, operation/payload, source SHA, resource-set digest and authority epoch. Responses authenticate HTTP status, that request's ID/digest, the same source/resource/epoch and result/refusal. The client refuses unsigned, modified, cross-request or redirected responses and does no application-level mutation replay. These are staged protocol properties tested below, not an independent security certification.

| Key role | Permitted operations |
| --- | --- |
| capture | Acquire/poll/assert/release capture; bounded page and device-snapshot capabilities |
| runtime-writer | Ordinary/urgent writer admission and ticket completion |
| external-writer | Target-pinned publication/probe/schema/deployment admission and ticket completion |

Methods and payload keys are closed. There is no network initialize, reset, arbitrary SQL/RPC, restore, credential-export or quarantine-clear operation. External account/database/Worker/host targets must match the trusted catalog. Source/resource/epoch mismatches, cross-role methods and malformed scopes refuse before authority dispatch. The actual current authority epoch is checked around dispatch. Separate key IDs may not reuse key material. Raw32-byte keys are imported as non-extractable CryptoKeys; no production secret is generated or installed.

## Replay, bounds and unknown outcomes

CaptureReplayStore uses actual durable transactions, explicitly initialized from a trusted bootstrap with exact source/resource/epoch. It never initializes from a request. Authenticated nonces are consumed before dispatch, are retained across restart, and cannot be replayed. Uninitialized/corrupt/lost replay state, pin mismatch, clock regression or1024 unexpired nonce capacity refuse. Expired authentication records can be pruned only after their signed window has elapsed; **writer tickets do not expire**. Request windows cap30s with at most5s future clock allowance.

Incoming bodies cap32KiB; replies cap4MiB. Streaming byte limits and complete-call deadlines bound waiting, with best-effort cancellation. HTTPS configuration is required, redirects are refused and messages use no-store. Callback/serialization/transport failures expose generic uncertainty, not source errors/data. Oversized async reply construction initially escaped the local handler catch; awaiting response construction now returns a generic authenticated refusal, with the negative test preserved. Synchronous JS/OS stalls cannot be preempted by these cooperative deadlines, and late remote effects may still complete. A timeout/refusal never proves an operation rolled back or a writer stopped.

The existing runtime/external controllers consume verified broker receipts. A lost/invalid admission reply starts no tool/runtime work and preserves any committed native ticket. P8D-093 ownership retention remains in force. The nonce store's bounded capacity is not a production throughput/availability qualification, and an urgent-outage fallback is still required before any activation.

## Verification

36 new native/client cases exercise role/scope separation, request/reply tampering, response substitution/status binding, replay after restart, replay loss/corruption/capacity/expiry, authority recreation, clock regression, target/payload rejection, source errors/hangs/oversize, streaming deadlines/cancellation, HTTPS/key configuration, real existing typed controller bridges, validly signed wrong-epoch receipt refusal and lost/timed-out admission replies retaining native ownership. Keys, target URLs and source callbacks in that suite are synthetic; native dispatch uses actual SQLite-backed authority/replay state. No actual TLS endpoint/provider/fleet/latency acceptance is inferred.

The full actual41-table primary +4-table diagnostics/deviceDO encrypted source-destruction-and-restore drill now routes capture acquire, held checks, paged data/device reads and release through the signed client/handler with durable replay. Actual source callbacks retain the original allowlists and bounded D1 read implementation. Server-side statement instrumentation still requires at most5 source SQL statements/call. Existing ordinary retention refusal, D1/health urgent preemption, exact bytes/device state, credential exclusions, interruption/restart and fresh restore assertions remain. Fixture controls/bootstrap and a controlled outer writer envelope remain; there is no live-family-data export or complete production-writer claim. Existing Miniflare RPC-stub disposal warning remains.

Before deployment, complete raw/external/deferred/lifecycle/process-tree/credential coverage, reviewed target/authority/bootstrap and key custody/rotation, replay persistence/rate/traffic qualification, unknown-outcome reconciliation and safe urgent authority/storage/transport-outage fallback. Then actual independent private card-free destination/separate backup key/context, schedule/readback/age/failure monitoring, current least-privilege PITR and explicitly isolated cloud restore/interruption/rollback/RTO/RPO remain. No partial transport may enable capture. No other group or canonical acceptance changes; no R2/card/billing, APK/UI/phone change, merge or deployment.

API references: [W3C Web Cryptography](https://www.w3.org/TR/webcrypto/) and [Node WebCrypto](https://nodejs.org/api/webcrypto.html). These document the cryptographic API; they do not endorse or independently audit this protocol.
