# Brick V1 — Phase 8C FINAL ACCEPTANCE / GO-NO-GO

**Audit date:** 2026-11-04 (Singapore).
**Decision:** **PHASE 8C PASS — DONE**, for the **Android source, build, emulator, security, persistence, concurrency and performance audit scope** specified by the approved Phase 8C plan. This **is not** a Phase 8D/8E/8F or whole-Brick production-release approval. Physical OPPO/ColorOS validation remains Phase 9.

**Repository:** `hellonenermy1/Brickfamilyplanning`  
**Audit branch:** `v1-p8c-android-deep-audit`  
**Original audit baseline:** `204a141e90c078b6c2008778bd6c01bcbb8a4622`  
**Final tested Android production code:** `2c492efff01095e17f96af3c24ac07ac0b5c3739`  
**Later test/workflow-only SHA:** `28ca478b5fd4259c745c30ff4cce146369da8432` and `51b8e990f323c71b4ad472fa4436fd604f0a5205`. GitHub comparison from production SHA to the audit branch confirms no subsequent `app/src/main` changes; differences are one test file, CI workflow and audit documentation.

## The five final-source acceptance gates — ALL PASSED

| Gate | Verified run | Result / evidence |
| --- | --- | --- |
| Signed release / pinned permanent certificate | [41769396317](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41769396317) | SUCCESS, package `com.brick.safety`, versionCode `10`, versionName `1.0.0-rc.1`, min SDK 29, target SDK 35; APK SHA256 `2d1fb331a8a1f6c5efb805ed93c0adfd68e205d5435416a51e772b593336a28c`; permanent RSA-4096 signer fingerprint `BF:DE:B4:97:14:FE:A7:14:53:6C:47:F8:12:6D:EE:D7:00:F0:0B:2D:D1:13:C5:C0:D4:52:99:2D:7E:D5:F7:90`; signature/compiled manifest verified |
| Android security/deep source audit | [41769474692](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41769474692) | SUCCESS: Gradle assemble/unit tests/lint/R8/AndroidTest compilation, production-only manifest exact eight-export/permission audit, full Android source persistence scanner, static privacy/regression gates |
| Android 15 emulator & lifecycle/race regressions | [41769491366](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41769491366) | SUCCESS: 120 tests (35 standard named test classes and 2 independent cold starts), including SOS/high fall, 100k synthetic backlog, API truthfulness, 40 rejected FLP callbacks, direct Shizuku held Binder, WorkManager drain, held signer/service/diagnostic/fall writers, deprovision corrupt/lost XML and independent marker migration deadlock |
| Android 10 real Device Owner | [41769396337](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41769396337) | SUCCESS: actual API29 AOSP Device Owner provisioning and auto-time restore/release. One-shot Wi-Fi OFF is genuinely **rejected by this emulator**; Brick correctly records `failed` and observed state ON, never falsely claiming Wi-Fi was disabled |
| Sustained failure CPU/RAM/storage | [41769396389](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41769396389), artifact `13294871128` | SUCCESS on identical frozen production code; Android 15 API35, **186 seconds**, 1,000 durable queued rows + continuously refused API endpoint; process stayed alive/FGS confirmed; measured CPU 3.177% avg, 14.307% sampled peak (guards <=20/80%), RSS max 169,948 KiB (<=262,144), private storage 1,508 KiB (<=32,768), failure streak 6 (allowed 1–8), zero package alarm lines (max 40) |

**Resource report integrity:** `phase8-android-resource-budget.json` from the downloaded final-source artifact explicitly names `gitSha=2c492efff01095e17f96af3c24ac07ac0b5c3739`. The average CPU is the workflow's duration-weighted measure (3.177%); the separate 18-row sampled arithmetic mean is approximately 3.006%. They are different statistics and must not be silently conflated. The full actual JSON and CSV are stored in GitHub artifact `13294871128`.

## Original Phase 8C finding closure

All **13/13** documented baseline findings (`P8C-001`–`P8C-013`: **11 P1, 2 P2**) now have source corrections, corresponding original-risk regression evidence and a recorded **FIXED → RETESTED → VERIFIED CLOSED** disposition in [PHASE8C_FINDING_CLOSURE_MATRIX_2026-11-04.md](PHASE8C_FINDING_CLOSURE_MATRIX_2026-11-04.md). The separate P1 Live-API retry/CPU hot loop is also **VERIFIED CLOSED** from the actual 186-second refused-network resource test. **No documented P0 or P1 Android finding remains open in this bounded Phase 8C review.**

Key direct-failure reproductions include:
- Torn SOS / HIGH fall states across injected fault/reopened durable storage;
- 40 stale/rejected Fused callbacks and a genuinely accepted new measurement (actual service uses the exercised `MeasuredFixGate` decision boundary);
- Actual platform-rejected Device Owner Wi-Fi command and true phone-state result persistence;
- Missing/malformed policy history, active-record-preserving compaction and 100/10,000/100,000-row SQLite/ACK ordering;
- Lost/replaced device key refusing silent regeneration;
- Shizuku permanently late Binder callback and stale successful reply preventing post-purge key regeneration;
- In-flight signer, location-service executor, diagnostics sampler and fall HandlerThread must finish *before* real production purge deletes their state;
- Legacy origin-marker lock inversion (DeviceKeys vs DeprovisionManager) cannot deadlock;
- Corrupt and *fully deleted* stage XML across separate process cold starts retain recovery-only behavior when the separate non-sensitive origin marker exists.

Original `PHASE8C_FINDINGS*.md` and earlier "OPEN" audit files remain **untouched historical evidence** of the defects as first found. This signed-off report and the final closure matrix supersede only their **current** disposition. The earliest patch commit of certain early-session fixes was not available from the connector; no historical SHA has been fabricated. All passing tests are tied to the exact final source SHA instead.

## Phase 8C.1–8C.20 contract acceptance map

| Section | Acceptance summary |
| --- | --- |
| 8C.1 Build identity | Pinned release package/version, signed artifact, R8/non-debug build verified |
| 8C.2 Manifest | Permissions, all exported components, launcher, protected receivers/services/providers, backup/cleartext audited |
| 8C.3 Lifecycle | Real foreground service, safe stop/restart, quiescence and cold-start corrupt/missing-stage recovery examined |
| 8C.4 Location | Stale/mock/impossible fix rejection, timestamp/accuracy/speed/bearing guard and fallback code/tests audited |
| 8C.5 Measured continuity | Rejected callback cannot extend accepted-measurement age or clear reacquisition; new accepted fix restores measurement state |
| 8C.6 Motion/sensors | Supported Android sensors, registration/unregistration, activity and loss fallbacks audited on emulator |
| 8C.7 Fallback/particles | Conservative uncertainty, independently classified fusion and position-fallback regressions passed |
| 8C.8 Provider isolation | Optional Atlas/Shizuku/BLE failure independence; no privileged provider permitted to block core location |
| 8C.9 Durability | Journals, safety outbox, epoch/sequence, SQL fault-injection and reopened process-local storage verified |
| 8C.10 Exact ACK | No delete-before-ACK, exact acknowledgement and orderly retransmission verified |
| 8C.11 Backlog | Durable 100, 10k, 100k synthetic records/ordering/ACK plus separate 1k failure performance workload |
| 8C.12 SOS / safe / HIGH fall | Transactional safety mode plus event; critical queue priority and protection interlock verified |
| 8C.13 Device Owner | Actual API29 ownership and policy reversal tested; unsupported Wi-Fi accurately represented |
| 8C.14 Shizuku | Timeout, capability rotation, stale callback, permission and post-purge lifecycle verified |
| 8C.15 Maintenance | Truthful local diagnostics, one-shot/purge outcomes, corruption recovery UI and no unsafe automatic restart |
| 8C.16 Cryptography | Keystore continuity, no embedded signing secrets, held-key purge lock, signed release/cert pin verified |
| 8C.17 Attack surface | Strict merged-manifest exported-component permission allowlist, no debug-test harness in signed APK |
| 8C.18 Resources | 186-second current-source failure budget all limits passed, no Live retry hot loop |
| 8C.19 Concurrency | SOS/event, upload/ACK, WorkManager, location/service drain, diagnostic/fall, Shizuku, key/purge and metadata migration races retested |
| 8C.20 Privacy/logging | Diagnostic redaction tests, privacy source audit, full known persistent-state inventory and fail-closed post-purge probes passed |

## Permanent deliverables / traceability

- [Master Android audit report](PHASE8C_ANDROID_MASTER_AUDIT_REPORT_2026-11-04.md) and [PDF-aligned execution matrix](PHASE8C_EXECUTION_MATRIX_2026-11-04.md)
- [Manifest and signing report](PHASE8C_MANIFEST_REPORT.md), [lifecycle diagram](PHASE8C_LIFECYCLE_DIAGRAM.md), [durability report](PHASE8C_DURABILITY_REPORT.md)
- [Security report](PHASE8C_SECURITY_REPORT.md), [race-condition report](PHASE8C_RACE_CONDITION_REPORT.md), [resource report](PHASE8C_RESOURCE_REPORT.md)
- [Original findings](PHASE8C_FINDINGS.md), [final findings closure matrix](PHASE8C_FINDING_CLOSURE_MATRIX_2026-11-04.md), [original plus final retest evidence](PHASE8C_RETEST_EVIDENCE.md)
- [Current accepted evidence gate](PHASE8C_CURRENT_ACCEPTANCE_GATE_2026-11-04.md) and the signed build, test logs and raw 186-second resource artifact in GitHub Actions.

## Explicit scope boundaries — not risk waivers

- This is a **software/source/Android emulator acceptance**, not a guarantee of perfect real-world operation. Actual OPPO ColorOS process restrictions, GNSS/indoor/RF accuracy, motion sensors, BLE/Wi-Fi/cellular modem power, hardware battery drain and genuine one-shot Wi-Fi toggling **must** be verified on the target device in **Phase 9**. Mark **IMPLEMENTED — DEVICE VERIFICATION PENDING**; do not replace this with an invented emulator/physical success.
- The phone explicitly treats an AOSP Wi-Fi toggle refusal as a *verified unsupported capability*, not success; no security bypass or silent background workaround was introduced.
- If *both* independent on-device deprovision-origin stores are completely destroyed, no local-only method can identify the post-purge device as distinct from a fresh installation. The tested one-anchor-loss and malformed/partial-write scenarios fail closed. Do not describe this as zero-risk for arbitrary storage destruction.
- The resource budget measures observed process CPU, RSS and local storage under a defined synthetic workload, not all hardware power use. Actual remote carrier/Wi-Fi roaming and multi-hour sustained tracking belong to later acceptance.
- Phase 8D Cloudflare/backend and remaining Phase 8 areas are not covered by this sign-off. Starting 8D does **not** mean Brick V1 is production ready.
- New Android source changes after `2c492eff` or newly discovered P0/P1 findings require reopening affected 8C tests and this acceptance record; the PASS applies to the pinned tested source.

## Formal 8C EXIT GATE

- **Open documented P0 Android findings:** 0
- **Open documented P1 Android findings:** 0
- **Unexplained lifecycle states in scoped Android audit:** none left unclassified (including `INVALID` and intentional post-purge recovery-only).
- **Unknown safety-event or persistent-data path identified in scoped audit:** none left without a disposition; production persistence scanner, original inventory sweep, durable event and post-purge tests are recorded. This is bounded evidence, not a claim of exhaustive absence of all hypothetical bugs.
- **Signed release, test, source, emulator Device Owner and performance evidence:** all PASS on final production source.

**FINAL DECISION: PHASE 8C = DONE / PASS (2026-11-04).** No P0/P1 exceptions accepted. **Next permitted workflow:** Phase 8D backend deep audit, without changing Android source unless a newly discovered Android issue requires reopening Phase 8C. OPPO-only tests stay Phase 9.
