# Brick V1 Phase 6 — Canonical Contract

Date frozen: 2026-11-01
Status: IN PROGRESS

This file is the durable Phase 6 reference. It does **not** replace the canonical Google Drive document `Yes`; it translates the Phase 6 requirements from `Yes`, `V1_REQUIREMENTS.md`, and `V1_PHASES.md` into an implementation and acceptance contract.

If chat memory, an old branch, an old PR description, or an older checkpoint conflicts with this file, re-read `Yes`, `V1_REQUIREMENTS.md`, `V1_PHASES.md`, and this contract before changing scope.

## Source hierarchy

1. Google Drive document `Yes` — canonical V1 requirements contract.
2. `V1_REQUIREMENTS.md` — requirement ledger extracted from `Yes`.
3. `V1_PHASES.md` — canonical phase ownership.
4. `PHASE6_CONTRACT.md` — Phase 6 execution contract derived from the above.
5. `PHASE6_REQUIREMENT_MATRIX.md` — live requirement status.
6. `PHASE6_CURRENT_CHECKPOINT.md` — latest implementation/CI checkpoint.

## Phase 6 mission

**Device Owner, Parent Location Control & Shizuku Enhancement.**

Phase 6 adds controlled privileged capabilities only after Brick Core already works. The goal is to make parent-requested Android Location ON/OFF state durable, authenticated, verifiable and safely repairable, while adding an optional Shizuku enhancement path that can never become a dependency of normal Brick tracking.

Phase 6 is not the general dashboard/history/UI phase and is not the final reliability/production qualification phase.

## Non-negotiable invariants

- Brick Core works when Shizuku is missing, denied, disconnected, killed or broken.
- Device Owner is the primary managed-control path when available.
- Shizuku is optional enhancement/fallback only.
- No generic shell strings, arbitrary commands, or remote command console.
- Privileged actions are typed and explicitly allowlisted.
- Parent requested state and actual phone state are different facts.
- Parent UI must never call a request "confirmed" until the phone reports the actual result.
- Duplicate commands are harmless.
- Replayed, expired, malformed, future-dated, wrong-device and unauthorised commands are rejected.
- Durable SOS remains the first safety path; privileged SOS location attempts are optional enhancement only.
- Unsupported device capabilities are reported honestly as unsupported/blocked, not treated as Brick Core failure.
- One privileged provider failure must not stop tracking, journals, SOS, health, fallback positioning or recovery.

## Canonical Phase 6 scope

### 6.1 Refactor Device Owner Location behaviour — SHZ-002 / SHZ-003

Implement a durable parent desired Android Location state:

- `ON`
- `OFF`

Default remains `ON` for backward-safe upgrade behaviour.

Device Owner must no longer blindly force Location ON. It must apply the persisted parent desired state when the relevant Android API is genuinely supported.

### 6.2 Desired-versus-actual state machine — SHZ-002 / SHZ-003 / SHZ-004

Implement and verify all four states:

1. Desired ON + Actual ON → healthy.
2. Desired ON + Actual OFF → try Device Owner repair first; if still mismatched and an approved Shizuku capability exists, try the optional Shizuku repair; then re-read actual state.
3. Desired OFF + Actual OFF → healthy.
4. Desired OFF + Actual ON → apply managed OFF only through an approved capability; then re-read actual state.

The phone reports desired state, actual state, match/mismatch, command identity and verification time. Cloud acknowledgement must be based on the phone-reported actual state, not merely on the parent request being stored.

### 6.3 Secure parent command protocol — SHZ-002 / SHZ-004 / SHZ-012

Every Location command must be bound to:

- command ID;
- device ID;
- command type;
- desired ON/OFF state;
- creation/issue time;
- expiry;
- nonce;
- authenticated parent context / server authorization;
- server-side audit record;
- the authenticated Brick device delivery path.

Required rejection cases:

- duplicate → safe no-op;
- replay → reject;
- expired → reject;
- stale/out-of-order → reject;
- unreasonable future timestamp → reject;
- wrong device → reject;
- malformed schema/value → reject;
- unauthorised parent → reject;
- revoked device → reject or remain read-only according to lifecycle rules.

The device returns/health-reports enough information to bind actual state to the command it processed.

### 6.4 Real optional Shizuku adapter — SHZ-001 / SHZ-012

Keep `PrivilegedBridge` as the narrow abstraction and add a real Shizuku-backed provider using the official supported API.

Allowed Phase 6 privileged operations only:

- `setParentLocationState()`;
- `requestShizukuWifiEvidence()`;
- `requestShizukuBleEvidence()`;
- `requestCellularEnvironmentEvidence()`;
- `readPrivilegedHealth()`;
- `repairApprovedPowerPolicy()`;
- `enterChildInitiatedSosEmergencyMode()`.

No arbitrary shell API is permitted.

The adapter must expose explicit lifecycle/health states such as unavailable, permission required, connected, disconnected/dead and failed. Timeouts are mandatory; Brick may never wait forever for the helper.

### 6.5 Location-OFF Wi-Fi experiment — SHZ-005

Provide the typed Shizuku Wi-Fi evidence path and a device-test harness. On the target OPPO, measure what is actually obtainable while Android Location is OFF.

Legitimate final outcomes include:

- SUPPORTED;
- PARTIALLY SUPPORTED;
- BLOCKED BY COLOROS / Android policy;
- UNSUPPORTED — VERIFIED.

Do not fake success and do not weaken Brick Core if blocked.

### 6.6 Location-OFF BLE experiment — SHZ-006

Same rule as Wi-Fi. Implement the typed path, capability detection, bounded timeout/failure handling and device-test harness. Measure the real OPPO result rather than assuming Android/ColorOS behaviour.

### 6.7 Privileged cellular evidence — SHZ-007

Expose only cellular fields that the target device and Android APIs actually make available. Feed results into the existing evidence model as supporting evidence, never as fake tower triangulation.

Unsupported fields remain unsupported and must not cause Device Health failure.

### 6.8 Privileged diagnostics — SHZ-007

Add bounded diagnostics for useful control/reliability state, including where genuinely available:

- Android Location state/providers;
- Shizuku availability/permission/connection health;
- Wi-Fi/BLE capability state;
- network state;
- Doze/device idle;
- foreground-service/process state;
- battery/background restrictions;
- power-policy state.

Diagnostics must remain compact and privacy-safe; no raw-location logging or unbounded environment dump.

### 6.9 Approved repair actions — SHZ-008

Implement only narrowly allowlisted repairs with explicit preconditions, timeout and verification. Candidate repairs include the parent-requested Location state and approved power-policy repair where the actual platform permits it.

There is never a generic `runShellCommand` repair path.

### 6.10 Shizuku lifecycle/failure handling — SHZ-011

Explicitly handle:

- Shizuku missing;
- permission missing/denied;
- binder/service disconnected;
- helper process killed;
- service lost during active tracking;
- reconnection;
- reboot;
- battery pressure/background restriction;
- timeout or malformed privileged response.

On every failure, clear/degrade the privileged provider promptly and continue normal Brick Core operation.

### 6.11 Silent managed-Location notification — SHZ-010

When managed Location is ON, the child-facing foreground notification remains minimal and silent:

- title: `Brick`;
- state text such as `GPS on` / `GPS off` as required by the V1 contract;
- no sound;
- no vibration;
- no heads-up/pop-up;
- no repeated alert for each position update.

The notification text is status only; it does not replace actual health reporting.

### 6.12 SOS emergency privileged Location experiment — SHZ-009

Preserve the existing durable SOS path first. If SOS is active while Location is OFF, optionally attempt the explicitly allowlisted privileged emergency Location action only if supported and safe.

After the attempt, verify the actual Location state. If unsupported/fails, SOS and the Evidence Engine continue normally; there is no blocking dependency on Shizuku.

## Required Phase 6 verification

Automated/computer-side verification must cover the control path before device testing:

- desired ON/OFF persistence;
- all four desired/actual state transitions;
- Device Owner-first ordering;
- Shizuku fallback only when available/approved;
- no-helper fallback;
- Shizuku disconnect/timeout behaviour in test doubles;
- duplicate command no-op;
- replay rejection;
- expired rejection;
- stale/out-of-order rejection;
- future timestamp rejection;
- wrong-device rejection;
- malformed Boolean/schema rejection;
- unauthorised parent rejection on Cloud routes;
- revoked-device behaviour;
- phone actual-state acknowledgement binding;
- no arbitrary shell surface;
- privileged capability allowlist;
- Core tracking remains operational if the bridge throws/fails;
- cloud migration/typecheck/security tests;
- Android compile/lint/unit tests;
- cumulative Android instrumentation/regression tests.

Device-specific acceptance cases from the V1 ledger remain scheduled for the real OPPO qualification pass:

- TEST-038 Shizuku lost during tracking;
- TEST-039 Shizuku loss/reconnect/reboot;
- TEST-040 parent Location ON request;
- TEST-041 parent Location OFF request;
- TEST-042 duplicate/replayed/expired/wrong-device command behaviour;
- TEST-043 unauthorised Location request;
- TEST-044 Location-OFF Shizuku Wi-Fi measurement;
- TEST-045 Location-OFF Shizuku BLE measurement;
- TEST-046 privileged cellular evidence measurement;
- TEST-047 privileged diagnostics after process kill;
- TEST-048 SOS with Location OFF + Shizuku available.

The Monday real-phone test does **not** block computer-side development. Until it is run, device-specific rows remain `DEVICE VERIFICATION PENDING`; they are not silently called accepted.

## Explicitly NOT Phase 6

The following belong to later phases and must not be allowed to expand Phase 6:

- full polished parent dashboard/history/degraded-position UI → Phase 7;
- location-history/playback/trip/geofence UX work → Phase 7;
- broad cloud intelligence/Atlas processing UI → Phase 7;
- system-wide stress, security/privacy and performance hardening → Phase 8;
- final signed release APK, matching production deployment and full real-OPPO endurance qualification → Phase 9.

A minimal Phase 6 parent Location control surface is allowed as an integration/test surface, but the final requested-vs-actual UX and wider dashboard polish are Phase 7.

## Current implementation snapshot at freeze

Canonical active development branches at the time of this freeze:

- Android: `v1-p6-device-control-android` @ `25c0d993ac738a5e8f20a58a6567910f79615059`
- Cloud: `v1-p6-device-control-cloud` @ `ead8227cff6f259dda6ca1f3b49d2dff8bc829b4`
- Audit/reference branch: `audit-progress`

Current Android source already contains:

- durable parent desired Location state;
- replay/order/expiry validation foundation;
- Device Owner application of ON/OFF;
- desired/actual health reporting;
- silent foreground state notification;
- narrow `PrivilegedBridge` abstraction and safe no-provider fallback;
- Phase 6 Android instrumentation test files.

Current Cloud source already contains:

- Phase 6 Location-control schema/migration;
- authenticated parent route integration;
- same-origin mutation protection;
- device lifecycle/revocation checks;
- short-lived device-bound command envelope;
- phone actual-state acknowledgement storage;
- server audit invocation for Location changes;
- Phase 6 CI workflow.

Known remaining implementation work includes:

- complete the real Shizuku SDK/binder-backed provider;
- add `setParentLocationState()` to the privileged bridge and wire Device Owner-first → Shizuku-fallback → verify semantics end-to-end;
- implement Wi-Fi/BLE/cellular privileged provider methods behind capability detection;
- implement bounded diagnostics and approved power-policy repair;
- implement SOS emergency privileged Location attempt without weakening durable SOS;
- strengthen/complete Android and Cloud tests for the full command + lifecycle matrix;
- close any CI compile/lint/instrumentation failures on the exact current heads;
- update the requirement matrix/checkpoint with exact final SHAs and test evidence.

## Phase 6 status rule

Use the V1 status ladder:

`NOT STARTED → IMPLEMENTED → UNIT/CI VERIFIED → INTEGRATION VERIFIED → DEVICE VERIFIED → ACCEPTED`

or, for genuinely unavailable hardware/API capability:

`UNSUPPORTED — VERIFIED`

Computer-side Phase 6 may reach `INTEGRATION VERIFIED` before Monday and development may continue. Device-specific rows are not upgraded to `DEVICE VERIFIED` or `ACCEPTED` until the real OPPO evidence exists.

## Closure artifacts

Phase 6 must leave all of these in `audit-progress`:

1. this phase contract;
2. updated `PHASE6_REQUIREMENT_MATRIX.md` with SHZ-001 through SHZ-012 and TEST-038 through TEST-048;
3. source-change inventory with exact Android/Cloud SHAs;
4. explicit test evidence (test/input/expected/actual/result), not merely "tests passed";
5. Phase 6 closure report listing only accepted/computer-verified, open device verification, and verified-unsupported items.

This prevents future chat sessions from redefining Phase 6 or claiming progress that the repository cannot prove.
