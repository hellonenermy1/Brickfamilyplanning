# Brick V1 — Phase 8C Android deep audit (master acceptance report)

**Audit branch:** `v1-p8c-android-deep-audit` in `hellonenermy1/Brickfamilyplanning`. **Date:** 2026-11-04. **Status:** **IN PROGRESS — NOT A FINAL PASS** until the final-source checks and all P1 original reproductions have evidence. This follows the user-approved `Brick V1 Phase 8 Full Audit Execution Plan` 8C.1–8C.20, with its global fail-closed rule: code inspection, unchecked source, or missing test evidence cannot count as PASS.

## Final-source evidence reconciliation — 2026-11-04

- **Production source freeze:** `2c492efff01095e17f96af3c24ac07ac0b5c3739`. Its later `28ca478b` and `51b8e990` commits add instrumentation/workflow only; `app/src/main` unchanged in that comparison.
- **Android 15 emulator test:** [41769491366](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41769491366), job `126375586464`: **SUCCESS, 120 methods across 35 suites** including independently held service, diagnostic, fall and signing writers, legacy metadata-lock ABBA deadlock reproduction, and both cold-start corruption/no-XML cases.
- **Android deep audit:** [41769474692](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41769474692), job `126375533578`: **SUCCESS** for Gradle build + unit tests + lint + R8 + AndroidTest compilation, source regression gates, complete source persistence inventory and strict merged exported-component manifest.
- **Signed artifact `2c492eff`:** [41769396317](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41769396317), package `com.brick.safety` version 10/1.0.0-rc.1; independently recomputed APK SHA-256 `2d1fb331a8a1f6c5efb805ed93c0adfd68e205d5435416a51e772b593336a28c`, pinned original signing cert `bfdeb49714fea714536c47f8126deed700f00b2dd113c5c0d452992d7ed5f790`.
- **Later build `28ca478b`:** [41769474781](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41769474781), signed original cert; independently recomputed APK SHA-256 `6ec59794adbf192c5d547875fe494895ba814225be6c021ca5fc7c5437867bcb`. The two builds have different byte hashes despite the same `app/src/main` code: do not claim reproducible/binary-identical APKs. The release artifact chosen for deployment must use its exact recorded hash.
- **Android 10 Device Owner:** [41769396337](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41769396337) **SUCCESS** on the same `2c492eff` source; Wi-Fi capability is unsupported in this AOSP emulator and is reported honestly as failed/actual ON.

**Only outstanding cross-cutting CI gate when this addendum was written:** 183-second final-source resource budget run completion and final formal P1 closure ledger. No source-only assumptions can replace that result. Real OPPO physical behaviors remain Phase 9.

## Android release candidate identity

- App ID: `com.brick.safety`; versionCode `10`; versionName `1.0.0-rc.1`; target SDK 35, minimum SDK 29.
- Permanent public RSA-4096 signing certificate SHA256 `BF:DE:B4:97:14:FE:A7:14:53:6C:47:F8:12:6D:EE:D7:00:F0:0B:2D:D1:13:C5:C0:D4:52:99:2D:7E:D5:F7:90`. The five original GitHub signing secrets were configured; **do not generate another keystore or commit private signing secrets**.
- Signed APK snapshot [run 41764906510](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41764906510) and subsequent build [41767486372](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41767486372) passed at their corresponding commits. **Any later source modification requires its own exact-source signed-APK gate.** The historical hash and certificate records are in `PHASE8C_MANIFEST_REPORT.md`.

## PDF 8C subphase status / cross-reference

| PDF section | Current evidence and result |
| --- | --- |
| **8C.1 Build identity** | Signed release verifies original signer; exact final-source hash and certificate check required after source freeze |
| **8C.2 Manifest audit** | Compiled backup/cleartext=false, production non-debuggable and permission-gated eight exported components; latest-source security CI recheck required |
| **8C.3 Service lifecycle audit** | Foreground-service startup/recovery, cold process restarts, loss of deprovision stage and service writer drain tested; final producer-drain result pending. Lifecycle diagram: `PHASE8C_LIFECYCLE_DIAGRAM.md` |
| **8C.4 Location engine audit** | PositionEngine tests cover mock/stale, timestamps and plausibility; true RF/ColorOS position accuracy stays Phase 9 |
| **8C.5 Measured continuity audit** | 40 repeatedly rejected Fused callbacks plus later valid fix passed [41765452362](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41765452362); `MeasuredFixGate` wired into service |
| **8C.6 Sensor/motion audit** | Phase 3 motion/activity unit/instrumentation passes in emulator; absent/real sensor hardware specifics pending real device |
| **8C.7 Particle/fallback audit** | Phase 3 and Phase 5 fusion regression suites in emulator; no false accuracy assertion about RF dead-reckoning |
| **8C.8 Atlas/provider isolation** | Provider isolation and optional Shizuku timeout/rebind tests in emulator; privilege must never block Brick Core |
| **8C.9 Local durability** | Journal, SafetyOutbox and crash-state fault/reopen tests passed; see `PHASE8C_DURABILITY_REPORT.md` |
| **8C.10 Exact ACK** | Regression verifies durability before send and exact ACK before local finalization; never count HTTP emission as confirmed delivery |
| **8C.11 Backlog** | `Phase8BacklogScaleInstrumentedTest` actually inserts encrypted synthetic 100, 10,000 and **100,000** rows and verifies exact ACK, ordering and reopened state; a separate 1,000-row refused-endpoint workload measures runtime resources. This is emulator SQLite evidence, not unlimited physical storage capacity. |
| **8C.12 SOS / I'M SAFE** | SOS transition atomicity, critical-before-normal delivery and fall safety interlock tests passed in emulator |
| **8C.13 Device Owner** | Real Android 10 Device Owner test [41762063429](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41762063429): Wi-Fi OFF rejected by AOSP, correctly `failed` with actual ON; auto-time provenance reversal passed. Real OPPO device-only toggling pending |
| **8C.14 Shizuku** | Held capability Binder timeout and new-lane recovery tests pass; late callback and stale generation do not recreate privacy keys |
| **8C.15 Maintenance Console** | Honest diagnostic state, fall/SOS and actual-vs-target one-shot outcomes tested |
| **8C.16 Cryptography/secrets** | Signing identity continuity and no silent paired-key regeneration; late signer/keystore purge fence added; final original race retest pending |
| **8C.17 Attack surface** | Manifest exported-component allowlist and exact system-level permissions checked; full external malicious-intent trial still bounded by emulator scope |
| **8C.18 Resource budget** | Measured **PASS**, 183 seconds, 1,000 queued rows, refused API: mean CPU 1.693%, peak 9.818%, RSS peak 172,140 KiB, storage 1,560 KiB, [41764035200](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41764035200). Post-source-change retest required. See `PHASE8C_RESOURCE_RETEST_PASS_2026-11-04.md` |
| **8C.19 Race audit** | Explicit original reproductions for late Shizuku, signing, stage corruption and service/diagnostic/fall writers; `PHASE8C_RACE_CONDITION_REPORT.md`; latest signer-vs-purge retest pending |
| **8C.20 Privacy/log audit** | Static privacy inventory and post-purge data non-recreation tests; physical OPPO/system log behavior remains untested |

## Major original high-priority findings reconciliation

- **P8C-001** SOS outbox atomicity — passed dedicated reboot/fault transactional tests; formal fix-to-retest mapping required.
- **P8C-002** rejected FLP timestamps suppressing reacquisition — dedicated 40-callback fixture passed; service-trigger integration remains bounded emulator evidence.
- **P8C-003** premature Wi-Fi completion — actual Android 10 Device Owner refusal honestly returns `failed`; only supported hardware may return verified completion; OPPO real test is Phase 9.
- **P8C-004 / 007** missing/corrupt policy ledger and active-provenance compaction — dedicated corruption and 400-history tests passed.
- **P8C-005** incomplete purge — source-wide inventory, BLE anchor preferences and AtomicFile sidecars added; post-purge/restart tests passed.
- **P8C-006** paired signer regeneration — missing/replaced key tests fail closed. A newer in-flight signer vs purge boundary is being retested.
- **P8C-008** post-purge state recreation — several specific races now retested, including 116 method run [41767511472](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41767511472), but the latest signer monitor must pass exact-source race injection before closure.
- **P8C-009** Device Owner auto-time provenance — VERIFIED CLOSED in historical retest record and actual API29 run.
- **P8C-010 (P2)** diagnostic terminology — local tests passed; correct recovered requirements `MAINT-004`, `MAINT-007`.
- **P8C-011** HIGH fall atomic safety deadline — local corruption/reopen tests passed; correct Wi-Fi safety requirement `WIFICTL-007`.
- **P8C-012 (P2)** hung Shizuku Binder — held actual `capabilities()` call and replacement executor recovery passed.
- **P8C-013** invalid/missing deprovision stage — independent no-backup origin guard and real corrupted/missing-stage cold restarts passed.

Original `PHASE8C_FINDINGS*` are immutable failure observations. Completion requires formal evidence mapping and no remaining P0/P1; a list of repaired source files cannot itself close a finding.

## Mandatory acceptance before 8D

1. Exact **latest production source** Android deep-audit CI (unit, lint, merged manifest, persistence scanner) PASS.
2. Exact source signed-release build, certificate and binary APK checks PASS, no rekeying.
3. Android 15 emulator with held signer, service writer, diagnostic sampler and fall handler all PASS, including cold-start and post-purge no-recreation proofs.
4. Sustained refused-API resource/CPU budget PASS with unchanged guardrails on the frozen source.
5. All relevant original P1 findings formally `FIXED -> RETESTED -> VERIFIED CLOSED`, no unknown safety-event path, lifecycle state or persistent store. Explicit device-only items labelled `IMPLEMENTED — DEVICE VERIFICATION PENDING` for Phase 9.

**Do not declare Phase 8C DONE or start Phase 8D before the above.**
