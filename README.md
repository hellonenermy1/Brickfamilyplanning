# Brick V1 — Phase 2 Child Reliability

This branch advances the Phase 1 child tracker into the Phase 2 reliability/self-healing layer. Phase 1 remains untouched on `phase1-child-apk`.

## Phase 2 scope implemented here

- Android foreground location service remains the primary live engine;
- `START_STICKY` process recovery;
- reboot / locked-boot / app-update recovery receiver;
- WorkManager 2.12.0 as a secondary persisted recovery path, not the live tracker;
- local supervisor checks location-subscription freshness every 15 seconds;
- stale location subscriptions are recreated rather than rebooting the app/phone;
- managed-mode support using Android Device Owner APIs;
- managed mode enables Location and blocks ordinary Location-setting changes only;
- encrypted journal remains write-before-send;
- single upload pump prevents thousands of network timeout tasks from piling up during outages;
- newest pending position is restored first after connectivity returns, then older gaps reconcile;
- exact ACK matching prevents silent queue loss;
- periodic signed health heartbeat to Cloudflare;
- queue depth, oldest pending age, network type, location state, service uptime, recovery count and managed-state health telemetry;
- separate health and location upload executors so large backlogs do not hide device health;
- no coordinates in the health heartbeat;
- minimal child UI remains unchanged in normal use.

## Managed mode

Brick includes a minimal `DeviceAdminReceiver` and Device Owner policy controller. It deliberately does **not** turn the phone into a kiosk. When Brick is actually provisioned as Device Owner, it uses only the safety-critical capability required in this phase: keep Android Location enabled and prevent accidental changes to that setting.

Device Owner cannot be claimed merely because the APK contains these APIs. Provisioning must be done through Android's supported device-owner provisioning flow, and the Reno10 Pro / Reno14 Pro ColorOS 15 behavior still needs real-device validation before Brick calls this path reliable.

## Recovery model

Normal failures should converge automatically:

1. location records are encrypted and committed locally;
2. one sender drains the journal;
3. no ACK means the record stays pending;
4. network recovery restarts the sender automatically;
5. a stale location subscription is recreated automatically;
6. WorkManager periodically reconciles state;
7. reboot/app replacement re-establishes tracking through supported Android lifecycle hooks;
8. Cloudflare independently watches signed health heartbeats.

## Build

Every push to `phase2-child-reliability` compiles, runs Android lint, and builds an installable debug APK artifact named `brick-child-phase2-debug-apk`.

## Still intentionally outside Phase 2

Activity recognition, transport mode, speed accuracy, GNSS-quality filtering, bad-fix rejection and fallback positioning remain Phase 3. History, real SOS/I'm Safe delivery, trips and geofences remain Phase 4. The full polished Device Health/history dashboard and map/privacy work remain Phase 5. Release qualification and the complete security/reliability/privacy audit remain Phase 6.
