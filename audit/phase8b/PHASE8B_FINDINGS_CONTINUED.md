# Brick V1 — Phase 8B Findings — Continued

These findings continue `PHASE8B_FINDINGS.md` and use the same severity/closure rules.

---

## P8B-013 — Fast Live Path is not actually isolated from Queue/D1/history work

**Severity:** P1 HIGH

**Requirements impacted:** amended `BE-006`, `BE-020`, `ACT-010`, `LIVE-001`, `LIVE-003`, `LIVE-005`, `PORT-029`, 23R acceptance.

**Expected:** after local durable persistence, the current accepted fix follows a dedicated realtime path to authoritative Durable Object current state and WebSocket/map render. Queue/history/Atlas/geocode/backlog work must not head-of-line block live current state.

**Android actual:** `BrickApi.sendLiveLocationPreview()` exists, but `BrickLocationService` uses it primarily only when durable location backlog contains more than one item. In the normal one-record case, the accepted point follows the normal `/location` or `/location/batch` durable ingest path.

**Cloud actual:** `location-ingest-v6.ts` handles normal location ingestion in this order:

1. validate/signature/route constraint;
2. `await queueLocations(...)` to the history/event Queue;
3. D1 `device_events`/device watermark + endpoint writes;
4. Durable Object `setLatest(...)`;
5. safety/refinement work;
6. HTTP ACK.

This means Queue send and D1 work occur before the authoritative live-state Durable Object update. The special `/location/live` preview endpoint goes directly to the DO, but the Android sender does not make that dedicated preview the normal every-current-fix path.

**Impact:** the frozen `accepted fix -> local persistence -> realtime packet -> DO current state -> WebSocket -> render` contract is only partially implemented; current live state can be delayed by background/durable history plumbing that 8A explicitly removed from the Fast Live critical path.

**Required fix:** after local journal persistence, send/coalesce the current fix through the dedicated realtime endpoint independently of history drain; make DO/WS current state independent of Queue/history/R2/geocode work; retain durable normal upload/ACK separately; add stage timings required by `LIVE-003` and validate 23R P95 budgets.

**Status:** OPEN

---

## P8B-014 — Exact work priority is wrong because crash diagnostics can run before current location

**Severity:** P1 HIGH

**Requirements impacted:** `PRIO-001`, `DAT-015/016`, `BE-020`, `LIVE-*`, backlog/zero-intervention acceptance.

**Expected priority:**

`SOS > Critical safety > Location > Health > Evidence learning > Diagnostics`

**Actual:** `BrickLocationService.kickUploadPump()` drains durable safety first, which is correct, but then calls `drainCrashReports()` **before** durable location upload. Crash reports are diagnostics and therefore currently outrank Location. `EvidenceDispatcher` also considers crash backlog part of `coreBacklogPresent()`, which means diagnostics can suppress evidence as though it were the same priority class as location/safety.

**Credit:** Evidence learning itself is correctly separated into a low-priority WorkManager path and refuses to drain while safety/location/core backlog is present.

**Impact:** the exact 8A queue priority is not implemented and diagnostic traffic can add latency ahead of current location/backlog recovery.

**Required fix:** establish one explicit scheduler/priority policy shared by location/safety/health/evidence/diagnostics; move crash/diagnostic uploads behind current location and health; test mixed large backlogs against `PRIO-001`.

**Status:** OPEN

---

## P8B-015 — Parent Live Track control path is missing

**Severity:** P1 HIGH

**Requirements impacted:** `ACT-010`, `CUI-014`, `LIVE-005` 23R-C, parent Live Track acceptance.

**Expected:** authenticated parent Live Track activation reaches the phone, switches to the intended fast tracking mode, produces roughly two-second current-state updates where appropriate, and confirms/fails within P95 <= 2.0 s while online/reachable. Normal operation does not use fast networking 24/7.

**Actual:** the current Android service has adaptive activity/SOS intervals but no Live Track parent-command/config input. `BrickApi.HealthConfig` contains BLE anchors, learned places, coarse network and Location command only. The current production parent portal has no Live Track activation control/path identified. The existing `/location/live` endpoint is a phone upload preview path, not a parent-to-phone Live Track mode command.

**Impact:** parent-requested Live Track mode and its 23R-C control-path SLA cannot operate end-to-end.

**Required fix:** implement authenticated parent command/state -> backend delivery -> durable phone command -> fast-mode confirmation -> parent result; keep child UI silent; ensure automatic expiry/reversion and power governor interaction are explicit.

**Status:** OPEN

---

## P8B-016 — Universal APK parent/guardian role model is not implemented

**Severity:** P1 HIGH

**Requirements impacted:** `PLT-001`, `PLT-005`, `PLT-006`; related provisioning/role isolation requirements.

**Expected:** one signed Brick APK supports Reno14/Reno10 and explicit child versus parent/guardian role provisioning. Parent role must not silently behave as a tracked child; role changes require authorised re-provisioning/migration.

**Actual:** the current Android application source has one child provisioning/runtime flow in `MainActivity` and no parent/guardian Android role model or authorised role-migration state machine. Parent functionality exists as the web portal instead. No role-specific Android source/component was found in the current production source tree.

**Credit:** the child role itself is substantially implemented and the web parent portal is real; this does not satisfy the explicit universal-APK role requirement.

**Required fix:** either implement the frozen parent/guardian APK role and authorised role migration, or make a new explicit contract amendment if the product intentionally changes to child APK + web-only parent. Code cannot silently redefine this requirement.

**Status:** OPEN

---

## P8B-017 — No durable per-device capability profile as required by PLT contract

**Severity:** P2 MEDIUM

**Requirements impacted:** `PLT-002`, `PLT-003`.

**Expected:** at startup/update/reboot, Brick detects platform/sensor/radio/Device Owner/Shizuku/RTT/cellular/future-ranging capability before enabling providers, stores a separate per-device capability profile, and exposes unsupported/limited providers without marking the whole device unhealthy.

**Actual:** capability detection is distributed and substantial: `HealthEvidence` checks permissions/sensors/power/network/Shizuku; individual Atlas/Witness providers runtime-gate capabilities and publish provider capability/health. However, there is no single durable per-device capability-profile model/store covering the full contract and no explicit startup/update/reboot capability-profile reconciliation object.

**Impact:** feature gating mostly works locally, but capability truth is fragmented and harder to audit/version/migrate consistently per enrolled device.

**Required fix:** consolidate provider/platform results into a durable versioned capability profile while retaining independent provider health; update it at startup/update/reboot and expose it through health/portal.

**Status:** OPEN

---

## P8B-018 — Device rename feature is missing after initial pairing

**Severity:** P2 MEDIUM

**Requirements impacted:** `PLT-012`.

**Expected:** parent can rename an enrolled device without changing device identity, keys, history, calibration or Atlas state.

**Actual:** pairing creation accepts the initial device name and devices are keyed by opaque UUID, so identity is correctly separate from the initial label. No current parent/API rename operation was found in the production cloud/portal source.

**Credit:** duplicate/backend routing safety is structurally ID-based; the missing part is the user-facing post-enrolment rename operation.

**Required fix:** add authenticated rename endpoint/UI keyed by device ID with audit event; do not alter cryptographic identity or per-device data ownership.

**Status:** OPEN

---

## P8B-019 — Screen-time collection/sync/portal feature is missing

**Severity:** P2 MEDIUM

**Requirements impacted:** `DAT-026`, `DAT-027`, `PORT-021`.

**Expected:** phone locally summarizes screen-time/application-use data according to the privacy contract, syncs the summary at the specified low cadence, and parent portal presents it without requiring raw continuous usage telemetry.

**Actual:** no Android UsageStats/screen-time subsystem is present in the current main-source tree, and no screen-time backend/portal implementation was found in the current cloud source tree.

**Required fix:** implement privacy-minimized local summary + durable low-frequency sync + parent presentation, including permission/capability honesty and retention rules.

**Status:** OPEN

---

## P8B-020 — Daily canary/integrity-test subsystem is incomplete

**Severity:** P1 HIGH

**Requirements impacted:** `REL-018..025` (especially `REL-019..024`).

**Expected:** silent scheduled integrity/canary tests exercise end-to-end Location/sensor truth, durable journal, cloud round trip and individual evidence providers; a failed canary performs an exact bounded retest before escalation; healthy canaries remain child-silent.

**Actual:** Brick has useful continuous/periodic monitoring (`DiagnosticMonitor` every ~15 s, `HealthEvidence`, 15-minute `RecoveryWorker`, provider health, backend reliability incidents), but no explicit daily synthetic canary subsystem was found. `RecoveryWorker` ensures tracking and schedules evidence draining; it does not perform the required end-to-end canary sequence or exact failed-canary retest.

**Credit:** persistent/recurrent health incident infrastructure and self-recovery foundations exist.

**Required fix:** implement an explicit silent canary scheduler/state machine, per-canary timestamps/results, exact retest before escalation, cloud round-trip canary and provider canaries, all without child interruption.

**Status:** OPEN

---

## P8B-021 — Automatic commute summaries are missing

**Severity:** P2 MEDIUM

**Requirements impacted:** `HIS-017`; related trip-history presentation.

**Expected:** Brick automatically derives conservative commute summaries from suitable history rather than requiring only manually started Trip Mode.

**Actual:** cloud `phase4.ts` implements real Trip Mode, destination arrival, overdue/prolonged-stop alerts, geofences and safety-quality gating, but no automatic commute-summary subsystem/path was found.

**Required fix:** add conservative automatic commute segmentation/summary logic with raw/refined provenance and no fake transport certainty.

**Status:** OPEN

---

## INFO-002 — Core durable location/evidence/witness stack is genuinely wired

**Severity:** INFO

The audit is not treating the project as a shell. Current Android wiring shows:

- encrypted durable location journal + exact ACK/quarantine;
- durable safety outbox and SOS/I'M SAFE delivery;
- activity/motion/GNSS/position/fusion runtime;
- Phase 3 learned odometry/particle/route/sequence engines;
- Phase 4 Atlas controller;
- isolated Wi-Fi, Wi-Fi RTT, BLE, cellular, LAN, GNSS-sky, network/device-context providers;
- adaptive evidence sampling and durable Evidence Journal;
- Phase 5 fusion/learned-place/coarse-network/radio-route/hypothesis paths;
- private rotating-ID Witness BLE provider;
- typed optional Shizuku boundary.

These families therefore generally receive `IMPLEMENTED — UNVERIFIED` in 8B unless a specific requirement is overridden by a finding. Deep correctness remains for 8C/8D/8E/8F.

---

## INFO-003 — Production signing identity exists and is permanent

**Severity:** INFO

The Android hardening head contains `signing/BRICK-v1-SIGNING-PUBLIC-MANIFEST.txt` declaring permanent Brick v1 package signing identity for `com.brick.safety`: JKS, RSA-4096, certificate SHA-256 `BF:DE:B4:97:14:FE:A7:14:53:6C:47:F8:12:6D:EE:D7:00:F0:0B:2D:D1:13:C5:C0:D4:52:99:2D:7E:D5:F7:90`, with private keystore/password material explicitly excluded from Git.

This supports `OPS-004`. It does not cure the separate `testOnly`/beta/release-identity findings.
