# Brick V1 — Phase 8C Android Deep-Audit Findings Addendum 4

Audit branch: `v1-p8c-android-deep-audit`
Status: IN PROGRESS

The authoritative 525-row atomic requirement ledger referenced by the earlier Phase 8A/8B records is not currently present in the repository tree. Until that ledger is recovered, this finding is mapped to the governing Phase 8 contract workstreams and Phase 8C audit section rather than inventing a missing SHZ atomic ID.

---

## P8C-012 — Shizuku capability probe can permanently wedge the privileged-call executor

**Requirement ID:** atomic `SHZ-*` ID pending authoritative ledger recovery; governing contract `P8.6` / `P8.9`; audit section `8C.14`
**Phase:** 8C
**Subsystem:** Optional Shizuku privileged bridge / timeout and failure isolation
**Severity:** P2 MEDIUM

**Expected:** Shizuku is optional and must fail boundedly. Service unavailable, permission loss, Binder death, a hung provider call, or a malformed/slow privileged implementation may degrade only the optional provider; Brick Core must keep operating and the privileged bridge must remain recoverable without requiring a manual app/process restart.

**Actual:** normal privileged operations call `remote()`, which submits work to `remoteIo` and waits with a 5-second timeout (7 seconds for BLE). However, `refreshCapabilities()` submits `current.capabilities()` directly to the same single-thread `remoteIo` executor with no timeout. If that Binder call blocks indefinitely, the only executor thread is permanently occupied. Every later `remote()` submission queues behind it; the caller times out, but cancellation of the queued future cannot free the thread that is still stuck in the earlier capability call. Rebind alone does not replace the wedged executor.

**Evidence:**
- `app/src/main/java/com/brick/safety/privileged/ShizukuPrivilegedBridge.kt`: `remoteIo` is a single-thread executor.
- `refreshCapabilities()` invokes `current.capabilities()` directly inside `remoteIo.execute { ... }` without a deadline.
- `remote()` submits to that same executor and uses `future.get(timeoutMs, ...)`; its timeout protects the waiting caller but not a previously stuck executor task.
- The AIDL surface itself is typed and does not expose a generic shell/file operation; this finding is reliability/recovery, not an allowlist bypass.

**Source file(s):** `ShizukuPrivilegedBridge.kt`, `IBrickPrivilegedService.aidl`, `BrickShizukuUserService.kt`
**Relevant function(s):** `refreshCapabilities`, `remote`, `onServiceConnected`, rebind lifecycle
**Commit SHA:** observed on Phase 8C branch lineage at source SHA `5bf4d105f5062e2b186eeaa92b0e2e411dcbcb1e` for `ShizukuPrivilegedBridge.kt`; branch head before correction `063a941042e0da31d25fc87747da2f070dc1e72a`

**Reproduction:** Bind a test/fault-injected `IBrickPrivilegedService` whose `capabilities()` call never returns. `onServiceConnected()` invokes `refreshCapabilities()`, which occupies `remoteIo` indefinitely. Then call a normal typed operation such as `setLocation()` or `wifi()`. It times out waiting for work that cannot begin; repeated calls continue to fail because the executor remains wedged even if the Binder/service reference is later replaced.

**Impact:** Optional Shizuku enhancements can become permanently unavailable for the lifetime of the Brick process after one hung capability probe. Core tracking is not directly killed, so this is P2 rather than P1, but it violates bounded optional-provider failure and self-recovery expectations.

**Root cause:** Capability discovery has a separate asynchronous path that bypasses the bridge's bounded remote-call machinery while sharing the same single-worker executor.

**Required correction:** Make capability discovery bounded and ensure one hung Binder invocation cannot permanently consume the executor used by subsequent calls. Timeout/failure must invalidate that service generation, clear capabilities, trigger bounded rebind when appropriate, and leave future calls with a usable execution lane. Add deterministic regression coverage for a never-returning capability probe and recovery on a replacement service generation.

**Fix commit:** pending
**Regression test:** pending
**Retest evidence:** pending
**Status:** OPEN
