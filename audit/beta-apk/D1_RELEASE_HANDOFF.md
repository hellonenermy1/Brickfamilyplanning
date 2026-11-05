# Card-free beta handoff

Portal: https://brick-family-beta.lumjayvian.workers.dev/parent/login

Deployed backend source20b68c693cb949771db81121fdfdbe5fb3293ade; GitHub run41976357223 passed preflight, code/runtime tests, APK currency and actual deployment. Authoritative live checks and non-secret configuration are adjacent JSON files. Later audit-only commits do not change deployed code.

Use the approved permanent-signed testOnly D1 APKfa52547d89929e2032fc8ced4511b79e9bf8a23c, SHA2560ab070bea12ca607b0a38ee863087aadddb44c9f2a8c60ac496b914d1166a6fc. Install with explicit-target ADB install -r -t. No silent downgrade/data wipe/factory reset. The private access/install document was delivered privately; no credential belongs in GitHub.

Storage: D1 primary rows and bounded chunked object storage; separate D1 beta diagnostics; private parent D1 sessions. Events persist directly to D1, not Cloudflare Queues. Maps use an authenticated same-origin public-data byte-range proxy. Maintenance uses a separate SQLite Durable Object alarm with D1 leases, leaving device WebSocket expiry alarms and other Workers' schedules untouched. No R2 or paid/card setup.

APK readiness names object_store_roundtrip and event_persistence_roundtrip correctly. The old immutable artifact ZIP inherited a stale standalone beta-contract-v1.json sidecar with historical R2/Queue names. This source's corrected beta/contract-v1.json and the signed APK runtime are authoritative; that old sidecar does not describe the deployed system. Do not rebuild or alter signed APK bytes merely to repair a historical sidecar.

Private-surface denial, authenticated HTML/devices/manifest/APK, exact APK D1 upload/readback, actual map range206 and unsigned-device denial passed against the deployed host. Native tests additionally covered actual history/direct-event persistence, real DO state and browser receipt, scheduler heartbeat, replay/conflicts/privacy, D1 multi-chunk files and missing-chunk rejection. These do not prove every feature on an actual phone.

Next: user signs in, installs this exact APK, completes actual device provisioning/pairing/permissions and independently verifies removal/escape, then passes phone plus selected-browser readiness before starting72h. Export/review actual gaps, interventions and behaviour. No72h has started automatically. No complete Phase8D acceptance is claimed. Preserve both beta branches and the original71f5460 Phase8D branch.
