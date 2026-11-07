# Group1 — actor mutation hooks and deferred ownership

Group1 IN PROGRESS / NOT READY; P8D-002 P1 OPEN. This implements partial source hook placement and a lifetime helper. Production controller/bootstrap installs remain **zero**. No live capture, production authority RPC, route/binding, schema, credential, APK/UI or deployment is activated by this change.

## Actual source changes

| Boundary | Hooked archived mutations | Priority |
| --- | --- | --- |
| Beta device DO | Latest/latest-with-trace, health, network, safety event, sequence high-water, safety evaluation/high-water, persistent revocation | Urgent: invalidate a held capture before the mutation when a trusted controller is installed |
| Beta device DO | Isolated recovery-state restore | Ordinary: refuse before work while capture is held |
| Beta scheduler | Watchdog page/device and minute/daily group work | Urgent: preserve safety work instead of waiting for a capture |
| Beta scheduler | Derived work, refined retention and legacy daily snapshot | Ordinary: refuse before work while capture is held; original durable pending inputs/retry policies remain |

There are16 hook boundaries. Existing methods/return values/revocation/restore checks remain; no new public actor method is added. Source profiles identify41 current actor methods, including inherited mutation methods and specific read-only/reconstructible socket/diagnostic/scheduler exclusions. Constructors/lifecycle and private helpers are still part of the broader coverage review; full source hashes and method body hashes flag changes. The profile is source inspection/change detection, not authenticated independent acceptance.

src/capture-writer-boundary.ts uses a private WeakMap keyed by the actual owner object. With no installed controller, work receives the original context and no admission/release RPC or additional D1 statement is made. installStagedCaptureWriterController is an internal module function used by fixtures only, not a Worker export or class RPC; no env/request value installs it. Registration is one-time per owner. The regenerated production import graph contains88 source files,16 boundary calls, **zero controller-install calls** and no runtime import of the durable admission store. This is explicitly partial, inactive coverage.

## Lifetime and failures

Configured admission occurs before work. Ordinary busy refuses without invoking the write. Ticket shape/epoch/writer identity are checked; malformed or ambiguous replies do not authorize work or erase unknown ownership. Admission and release waits are bounded; a correctly bound late admission is cleaned only because its operation never started. A timeout is never interpreted as proof that a source writer stopped.

A successful result can return while registered waitUntil work still holds its durable ticket. Nested descendants are drained before release. Work/deferred settlement is **not timed out to manufacture quiescence**; an unresolved task leaves its writer unresolved. Original work errors remain original errors. Release/registration failures produce generic notices without turning an already completed write into a false failure acknowledgement or logging transport/data details. Context properties and method receivers are preserved by a proxy. Controller notices are best-effort diagnostics, not a durable invalidation barrier.

Late waitUntil registration is refused and reports LATE_WORK_UNACCOUNTED. This cannot undo side effects from an already created promise or discover detached timers/unregistered work. Those paths still require direct write coverage/source review before activation. Likewise, admission failure currently refuses configured urgent work: **the required urgent authority/storage/transport-outage fallback is not implemented**. Do not install a production controller until that fallback and complete write coverage are proved. Ignoring a registry error is not a valid bypass.

## Verification

test-phase8d-capture-writer-boundary.mjs has21 focused compiled-helper cases with controlled admission/deferred capabilities. They cover inert defaults, one-time setup, busy refusal, urgency, early replies/nested deferred ownership, errors/hangs, bounded ambiguous/late admission/release, malformed tickets, context compatibility and late-work diagnostics. These are not native-provider/fleet/latency claims.

The actual local41+4/deviceDO encrypted destruction-and-restore fixture installs controllers only inside its test actor subclasses. It keeps the controlled outer writer envelope for still-uncovered raw Worker/D1/fixture writes. Native assertions now demonstrate:

- Actual scheduler retention refuses with the exact server CAPTURE_WRITER_BUSY error under a held capture, preserving zero declared writers and its drained generation.
- An actual hooked device health RPC preempts capture between the coordinator's final held-check and release; its state/result survive, while that capture cannot return SEALED.
- A subsequent fresh valid capture is encrypted, source persistence destroyed, and fresh target restore preserves exact archived DO state, including post-preemption health and revocation, alongside original history/object/schema/restart/interruption checks.

A direct Node Miniflare RPC error-decoding assertion (`typeHeader === Promise`) initially obscured the expected retention refusal. The fixture now uses its JSON RPC bridge and still requires the exact server error; no product check or refusal assertion was relaxed.

Current external/direct D1 Worker ingress, non-actor writes, deferred escapes and operator/migration/publication scripts are not comprehensively hooked. Source/resource pinning, real authenticated transport, urgent-outage fallback, private independent destination/separate key custody, scheduling/monitoring, current PITR and isolated cloud recovery/RTO/RPO remain open. Group1 is not closed; no other group advances and no canonical criterion/owner/review/disposition is changed.
