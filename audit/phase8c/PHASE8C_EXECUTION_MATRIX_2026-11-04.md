# Brick V1 Phase 8C — PDF-aligned execution and evidence matrix

**Audit session:** 2026-11-04 (Singapore)
**Contract:** user-approved 76-page `Brick V1 — Phase 8A–8F Ruthless Full Audit Execution Plan`, Phase 8C.1–8C.20, pages 31–43.
**Repository / branch:** `hellonenermy1/Brickfamilyplanning` / `v1-p8c-android-deep-audit`.
**Accepted 8B/source baseline:** `204a141e90c078b6c2008778bd6c01bcbb8a4622`.
**Frozen Android production runtime:** `967e5d5ceb7e485af997eb0f6380e9544cd39e79`.
**Release identity (source):** `com.brick.safety`; code 10; `1.0.0-rc.1`; target 35, min 29.
**Current audit verdict:** **INCOMPLETE — not Phase 8C PASS.** Findings and signed-APK/resource gates are not all closed.

## Strict evidence rules

- This matrix follows **the section names and numbering in the uploaded PDF**, not the shifted numbering in the earlier `PHASE8C_ANDROID_AUDIT_REPORT.md`.
- Source inspection, static CI, emulator tests, inspected signed APK and physical OPPO tests are distinct verification levels. A green CI run proves only the tests that executed.
- The original 12 findings remain permanent historical records; no finding is silently rewritten or marked closed merely because a remediation exists.
- A final signed APK hash/cert/package/manifest can be reported only after actual signed-artifact inspection.
- Real OPPO/ColorOS-only questions are `IMPLEMENTED — DEVICE VERIFICATION PENDING` for Phase 9, not source/emulator PASS.

## 8C.1–8C.20 audit matrix

| PDF section | Exact audit subject | Evidence established at frozen code | Remaining requirement or classification |
| --- | --- | --- | --- |
| **8C.1** | Build identity | `PHASE8C_BASELINE.md`, `PHASE8C_MANIFEST_REPORT.md`; source Gradle build identity and pinned public certificate fingerprint | **BLOCKED:** the exact current signed RC APK, its SHA-256 and installed signing certificate have not been produced/inspected |
| **8C.2** | Manifest audit | Release-manifest/exported-surface contract is in `.github/workflows/v1-phase8c-android-deep-audit-ci.yml`; `PHASE8C_MANIFEST_REPORT.md` | **PARTIAL:** independently inspect the fully signed RC package, permissions, components, providers, foreground-service types, filters and packaged debug surfaces |
| **8C.3** | Service lifecycle | `PHASE8C_LIFECYCLE.md`; `BootReceiver`, `RecoveryScheduler`, `ServiceControl`, `BrickLocationService`, purge guards; Android 15 emulator suite | **SOURCE/EMULATOR EVIDENCE; OPPO PENDING:** real ColorOS screen-off/Doze/process/service kill/reboot/update/battery restrictions and recovery |
| **8C.4** | Location engine audit | `Phase8FusedFreshnessInstrumentedTest`, `Phase3CoreInstrumentedTest`, `Phase3ConsistencyInstrumentedTest`, source review | **SOURCE/EMULATOR EVIDENCE; OPPO PENDING:** physical FLP/GNSS parameters, callback starvation, sensor/RF transitions, sustained measured cadence |
| **8C.5** | Measured-position continuity | `BrickLocationService` accepted-fused generation check; `Phase8FusedFreshnessInstrumentedTest`; source regression workflow | **PARTIAL RETEST:** direct service-level repeated rejected callback/reacquisition and fresh-vs-old fallback injection still needs specifically cited original-reproducer evidence |
| **8C.6** | Sensor and motion audit | `Phase8ActivityHysteresisInstrumentedTest`, motion/consistency tests | **SOURCE/EMULATOR EVIDENCE; OPPO PENDING:** physical availability, placement, clock/step quality, registration/teardown and power |
| **8C.7** | Particle/fallback audit | `Phase5FusionInstrumentedTest`, `Phase5CoarseNetworkInstrumentedTest`, Phase3 consistency/Atlas tests | **SOURCE/EMULATOR EVIDENCE; OPPO PENDING:** real fallback uncertainty/convergence during GNSS loss; do not infer measured precision |
| **8C.8** | Atlas/evidence provider isolation | `Phase8ProviderIsolationInstrumentedTest`, `Phase4AtlasCore/State/SignalTrust/TransitionInstrumentedTest` | **SOURCE/EMULATOR EVIDENCE; OPPO PENDING:** capability-specific RF and provider-failure behavior |
| **8C.9** | Local durability audit | `Phase8DurabilityTortureInstrumentedTest` (9 tests), `Phase8LowStorageInstrumentedTest` (4 tests), `PHASE8C_DURABILITY_REPORT.md` | **SOURCE/EMULATOR EVIDENCE:** forced crash/corruption, WAL/transaction assumptions and unknown-store sweep must remain reconciled with P8C-005 |
| **8C.10** | Exact ACK audit | Journal ACK atomicity/out-of-order regression; `Phase8NetworkChaosInstrumentedTest` (3 tests) | **EMULATOR VERIFIED at local boundary;** server durable acceptance/ACK linkage belongs to 8D/8F |
| **8C.11** | Backlog audit | `Phase8BacklogScaleInstrumentedTest` (2 tests); durability/chaos coverage for bounded batching and priority | **SOURCE/EMULATOR EVIDENCE:** physical 7/14-day unattended backlog and actual storage/battery are Phase 9 |
| **8C.12** | SOS and I'M SAFE | `Phase8DurabilityTortureInstrumentedTest`: event+state atomicity, injected failure, HIGH-fall window, I'M SAFE reopen/ACK, priority quarantine | **EMULATOR VERIFIED at Android outbox boundary;** actual parent notification/end-to-end delivery is 8F/Phase 9 |
| **8C.13** | Device Owner | Actual Android 10 Device Owner apply/reverse in run `41665283987`, 1 instrumented test; API35 emulator commands/policy regression | **SOURCE/EMULATOR VERIFIED; OPPO PENDING:** ColorOS Device Owner policy and actual asynchronous Wi-Fi transitions |
| **8C.14** | Shizuku | `ShizukuPrivilegedBridge` bounded capability polling/timeout and executor rotation; `RecoverableExecutorLaneTest`; privileged bridge emulator tests | **PARTIAL RETEST:** an uninterruptible synthetic lane is tested, but direct hung `capabilities()` Binder/service generation replacement still lacks a clearly cited injected reproducer |
| **8C.15** | Maintenance Console | Policy-ledger integrity, purge inventory, post-purge isolation, WorkManager drain and diagnostics emulator tests | **PARTIAL:** known-inventory purge test does not independently prove all production persistent stores are inventoried; OPPO deprovision release/uninstall is Phase 9 |
| **8C.16** | Cryptography/secrets | `Phase8DeviceKeyContinuityInstrumentedTest` (2 tests); source-keystore key-loss/replacement failure guards | **BLOCKED:** signed RC artifact cert/hash and packaged production secret review |
| **8C.17** | Android attack surface | Source/config checks for exported components, restrictions, Shizuku allowlist, no generic shell, no test harness in release | **PARTIAL:** signed-APK manifest/permission/package review pending |
| **8C.18** | Resource audit | Dedicated emulator resource-budget workflow now includes the Phase 8C branch as a push trigger | **PENDING RUN EVIDENCE:** do not claim CPU/RAM/storage/wakeup budget PASS without verified job ID/log/artifact; OPPO battery/RF metrics go to Phase 9 |
| **8C.19** | Concurrency/races | Atomic SOS/HIGH-fall, exact ACK, old fallback, policy compaction, post-purge, work drain, single-flight networking via source/regression tests; `PHASE8C_RACE_REPORT.md` | **SOURCE/EMULATOR EVIDENCE:** cross-system and OEM races go to 8F/Phase 9 |
| **8C.20** | Privacy/log audit | GitHub Actions run `41669979913`, job `126035434911` **SUCCESS**; production privacy audit + Android source log/coordinate checks | **CI VERIFIED at scanned source scope;** signed APK/physical log exposure must also be inspected before release |

## Independently inspected CI evidence

- Run [41670141287](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41670141287), job 126036000428: **SUCCESS**, build + 25 Android 15 emulator instrumentation suites; log reports **95 tests passed** across durability, low storage, scale, network chaos, providers, Shizuku, cryptographic identity, activity, fused freshness, Phase3/4/5, commands, diagnostics, policy, Wi-Fi, purge and WorkManager.
- Run [41665283987](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41665283987), job 126018817998: **SUCCESS**, genuine API29 emulator Device Owner policy apply/reverse.
- Run [41669979913](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41669979913), job 126035434911: **SUCCESS**, production source privacy/log checks.
- Run [41668964798](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41668964798) was retried on 2026-11-04, new job 126300377794, **FAILED before APK build**: both `BRICK_ANDROID_KEYSTORE_B64` and `BRICK_ANDROID_SIGNING_CERT_SHA256` evaluated empty in the prerequisite step. The five permanent signing secrets must be installed by the repo administrator. **Do not regenerate the permanent key.**
- The resource workflow's execution result is **not yet verified**; the source now allows a Phase 8C branch push to trigger it.

## Reconstructed current requirements and recovered IDs

A verified byte-for-byte historical checklist PDF was located from the user's project Library, SHA-256 `863218723ba49c93a72d4e5e59854425ac1bf32dbebeeae15bca08db96ea6f5e`. Parsed **469** baseline IDs; removed **3** explicitly superseded IDs; applied the approved **14** current-text amendments from `v1-p8a-contract-audit` and the **59** explicitly approved additions from seven `PHASE8A_NEW_*.md` source files. Current unique total = **525**, with 485 mandatory, 24 forbidden, 14 optional-if-supported and 2 future-interface.

This recovered complete *current-text index* is `PHASE8C_RECOVERED_525_REQUIREMENTS.csv` on this branch. It **does not** claim to be byte-identical to the original 8A normalized working ledger (frozen SHA-256 `8683b85f8b61aa3769b338048e7deb17d1fff3bc7773b6d454c7a61bce013bbd`) or to restore its owner/dependency/evidence columns; those must be reconciled separately.

The previously unassigned P8C-012 requirement mapping is grounded in the recovered accepted contract:
- `SHZ-003`: bridge health/capability detection, no indefinite wait (**primary original finding**).
- `SHZ-017`: reboot with Shizuku unavailable (**recovery dependency**).
- `SHZ-018`: Shizuku loss during tracking (**isolation dependency**).
- `SHZ-001`: core independence (**cross-cutting invariant**).

## Closure blockers / next work (in dependency order)

1. Reconcile the 12 historical finding IDs to current source, **specific original-reproducer tests**, fix commits and retained retest evidence; unknown proof remains open rather than accepted.
2. Finish full Android persisted-state discovery and compare it against purge inventory; the one known-inventory fixture test does not prove there are no unlisted stores.
3. Capture and verify an actual sustained-resource GitHub Actions run; do not mistake workflow presence for evidence.
4. Provide the five existing permanent-signing GitHub Actions secrets once, rerun the signed RC workflow, freeze APK SHA-256 and inspect packaged signing/manifest/attack surface.
5. Record final PDF 8C.1–8C.20 evidence and reconcile open P0/P1, lifecycle, safety-event and persistence paths. Only then may Phase 8C close PASS; OPPO-only questions transfer to Phase 9 with exact IDs.

**No source production-code change has been made by this continuation.** The implementation freeze remains `967e5d5...`; the audit branch also contains documentation and workflow changes, which must not be confused with Android implementation changes.
