# Brick V1 — Phase 8 Requirement Ledger

Status vocabulary: `IMPLEMENTING`, `CI VERIFIED`, `OPEN BLOCKER`, `PHASE 9 DEVICE VERIFICATION`, `ACCEPTED`.

| ID | Requirement | Status | Evidence target |
|---|---|---|---|
| P8-001 | Pin exact Phase 7 Android + cloud baselines | CI VERIFIED | Contract records exact SHAs |
| P8-002 | All Device Owner test/beta APKs remain `testOnly=true` | IMPLEMENTING | merged-manifest + APK inspection gate |
| P8-003 | No wipe/factory-reset API in beta | IMPLEMENTING | recursive CI destructive-API scan |
| P8-004 | Persisted 3-stage retirement state machine | IMPLEMENTING | instrumentation + crash/reboot tests |
| P8-005 | Stage 1 is durable before owner/admin release | IMPLEMENTING | fault injection around durable write |
| P8-006 | Retired Brick cannot resurrect from boot/update/work/service paths | IMPLEMENTING | entry-point guards + reboot tests |
| P8-007 | Stage 2 verifies Device Owner/admin release | IMPLEMENTING | emulator Device Owner lifecycle |
| P8-008 | Stage 3 uses Android uninstall UI only after verified release | IMPLEMENTING | emulator lifecycle + cancellation test |
| P8-009 | Staged retirement is idempotent across process death/reboot | IMPLEMENTING | kill/restart matrix |
| P8-010 | Installable DO beta uses persistent signing, never Actions debug key | OPEN BLOCKER | stable keystore secrets + release export gate |
| P8-011 | Signing certificate fingerprint pinned and checked | OPEN BLOCKER | first stable keystore fingerprint must be pinned |
| P8-012 | Beta A -> Beta B same-signature update preserves data/ownership | IMPLEMENTING | emulator upgrade test |
| P8-013 | Parent Location command is one-shot, not permanent enforcement | IMPLEMENTING | command-consumption tests |
| P8-014 | Phase 7 `DISALLOW_CONFIG_LOCATION` is cleared on upgrade | IMPLEMENTING | managed-policy test/emulator verification |
| P8-015 | Authenticated Location command replay/duplicate/expired/future/wrong-device rejected | IMPLEMENTING | retained + expanded command tests |
| P8-016 | Journal survives crash boundaries with exact ACK deletion | IMPLEMENTING | deterministic fault injection |
| P8-017 | Logical idempotency under duplicate send/ACK/lost ACK/out-of-order | IMPLEMENTING | device + cloud tests |
| P8-018 | SOS cannot be starved by ordinary location/evidence/diagnostics | IMPLEMENTING | synthetic backlog tests |
| P8-019 | 1/7/14 day offline backlog drains safely | IMPLEMENTING | synthetic long-offline tests |
| P8-020 | Low-storage/write failure/corruption degrades safely | IMPLEMENTING | storage pressure tests |
| P8-021 | Optional provider crash/hang cannot kill Brick Core | IMPLEMENTING | provider fault injection |
| P8-022 | Recovery/watchdog has bounded backoff and no restart storm | IMPLEMENTING | crash-loop/network-flap tests |
| P8-023 | Network chaos self-recovers without manual reboot/resync | IMPLEMENTING | DNS/TLS/timeout/429/5xx/lost-ACK/transport-switch tests |
| P8-024 | SOS remains durable under offline/restart/storage/network faults | IMPLEMENTING | SOS torture suite |
| P8-025 | Android manifest/exported/intents/filesystem/Keystore/TLS security audit | IMPLEMENTING | static + runtime security gates |
| P8-026 | Shizuku stays optional and typed/allowlisted; no generic remote shell | IMPLEMENTING | source audit + tests |
| P8-027 | Parent/cloud authn/authz/session/origin/CSRF/WebSocket/family isolation | IMPLEMENTING | cloud security suite |
| P8-028 | Server command nonce/replay/expiry/device binding proven | IMPLEMENTING | cloud + Android tests |
| P8-029 | Revoked device cannot upload/re-enrol while old history stays readable | IMPLEMENTING | revocation integration test |
| P8-030 | No ads/analytics SDKs or public fingerprint database | IMPLEMENTING | dependency + source audit |
| P8-031 | Retention rules enforced per raw evidence/history/diagnostic class | IMPLEMENTING | expiry/cleanup tests |
| P8-032 | Logs never expose exact coords, identifiers, tokens, keys or auth headers | IMPLEMENTING | automated log/source scan |
| P8-033 | Backup is proven by destructive restore and data comparison | IMPLEMENTING | restore rehearsal evidence |
| P8-034 | Battery/CPU/RAM/wakeup/sensor/radio/network/storage budgets measured | IMPLEMENTING | benchmark report |
| P8-035 | Cloud Worker/D1/Queue/R2 operation/storage budgets measured where actually used | IMPLEMENTING | architecture-backed metrics; no assumed services |
| P8-036 | Dependency locks, Actions pins, vulnerable/unexpected SDK review | IMPLEMENTING | supply-chain gate |
| P8-037 | Cumulative Phase 2-8 regression remains green | IMPLEMENTING | CI |
| P8-038 | Every unsupported/device-dependent item is explicit, never guessed as passed | IMPLEMENTING | closure ledger |
| P8-039 | Real OPPO/ColorOS endurance + OEM behavior qualification | PHASE 9 DEVICE VERIFICATION | exact Phase 8 release-candidate lineage |

Nothing in this ledger may be marked `ACCEPTED` without concrete evidence linked from `PHASE8-TEST-EVIDENCE.md`.
