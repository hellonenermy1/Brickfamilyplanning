# Brick V1 — Phase 8A Mandatory Acceptance Matrices

These are acceptance scenarios from the latest approved plan that must remain attached to the current requirement ledger. They do not create duplicate feature IDs when the functional requirement is already represented.

## A. Phase 7 all-screen state matrix

Every applicable child/parent screen must be exercised against:

- precise position;
- no position;
- poor position;
- estimated route;
- witness;
- anchor;
- phone offline;
- old/stale data;
- revoked device;
- Shizuku unavailable;
- Atlas unsupported provider;
- SOS;
- I'M SAFE.

PASS requires truthful state, no fake precision/success, and role-appropriate information exposure.

## B. Singapore map acceptance matrix

Test at minimum:

- representative Singapore HDB/building labels where provider supplies them;
- label density at several zooms;
- desktop and narrow/mobile responsive layout;
- mouse/trackpad/touch pan/zoom;
- +/- controls;
- Recenter/Follow;
- manual pan/zoom disables forced follow until explicit recenter/follow;
- Detailed default style;
- Clean secondary style if implemented;
- optional Satellite only if properly licensed/tested;
- primary-provider/basemap failure with approved fallback;
- Brick overlays preserved across provider failure;
- stale reverse-geocode result rejection;
- current marker renders before address enrichment;
- Live Track performance showing map/enrichment work does not violate the approved Fast Live requirement.

## C. Phase 8 backlog/storage priority matrix

Mixed backlog stress must prove the explicit scheduler priority:

`SOS > Critical safety > Location > Health > Evidence learning > Diagnostics`

Exercise:

- 1 day offline;
- 7 days offline;
- 14 days offline;
- thousands/millions of evidence records;
- low storage;
- abrupt process death during DB write.

No lower-priority evidence/diagnostics work may starve SOS/current location, and no corruption is allowed.

## D. Phase 9.4 full authenticated browser matrix

Using a real Cloudflare Access/authorised parent session, test:

- login/logout;
- live map;
- WebSocket;
- history;
- playback;
- trips;
- places;
- geofences;
- SOS;
- I'M SAFE;
- health;
- crashes;
- reliability;
- retention;
- private map/provider behavior;
- Atlas evidence;
- degraded-position UI;
- parent Location control;
- Witness state;
- Ground receiver state.

The same routes must fail closed for unauthenticated/wrong-family clients where applicable.

## E. Phase 9.7A reversible-control / latency / notification matrix

Run on both target OPPO profiles:

1. Parent Location ON -> verified ON -> child manually OFF -> Brick accepts OFF and does not force ON again.
2. Parent Location OFF -> verified OFF -> child manually ON -> Brick accepts ON and does not force OFF again.
3. `DISALLOW_CONFIG_LOCATION` absent during normal V1 operation.
4. Scheduled Wi-Fi OFF -> child re-enables -> remains ON until another explicit/scheduled action.
5. Scheduled Wi-Fi ON -> child disables -> remains OFF until another explicit/scheduled action.
6. `DISALLOW_CHANGE_WIFI_STATE` absent for normal schedules.
7. Healthy Location ON + valid measured fixes -> zero false ESTIMATED/COARSE/LAST KNOWN transitions.
8. Stationary slow sampling does not falsely trigger degradation.
9. Stale callback/subscription -> active reacquisition/repair before fallback.
10. Old fallback computation cannot overwrite a newer measured fix.
11. Live Track pipeline P95 meets the approved 23R latency budget and is not blocked by history/Atlas/backlog work.
12. Zero separate Brick-created GPS-on notification.
13. No repeated Brick-created Location ping during healthy operation.
14. Every remaining Location-related notice is classified as Brick-owned, Android-owned, or ColorOS/device-policy-owned.
15. Required platform privacy/foreground-service/device-management disclosures are not hidden or programmatically dismissed.
16. Repeated system disclosure is checked for needless repeated Brick permission/policy writes; those writes are removed if Brick is the trigger.

Item 11 remains blocked at contract-value level until `P8A-GAP-002` supplies the authoritative numeric 23R P95 threshold(s).

## F. Phase 9 Witness matrix

Test:

- rotating ID;
- rotation expiry;
- old-ID replay;
- unauthorised witness;
- authorised witness;
- poor witness GPS;
- fresh witness GPS;
- weak RSSI;
- strong RSSI;
- witness movement;
- multiple witnesses.

## G. Phase 9 Ground Network matrix

Test:

- one receiver;
- several receivers;
- receiver offline;
- receiver stale;
- receiver wrong configuration;
- replay;
- duplicate sightings;
- connectivity outage/recovery.

## H. Zero-manual-intervention closure

After every recoverable failure, the relevant acceptance item fails if normal recovery requires any of:

- reopening Brick;
- pressing Start;
- manual resync;
- rebooting specifically to recover Brick;
- clearing app data;
- manual resend;
- manual ordinary fingerprint retraining.
