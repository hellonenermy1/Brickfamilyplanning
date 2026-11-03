# Brick V1 — Phase 8A Ledger Schema and Reconstruction Rules

## Canonical reconstruction

The current Brick V1 contract is reconstructed as follows:

1. Start from the pinned 469-ID `Brick_V1_Final_Product_AI_Acceptance_Checklist.pdf` identified in `PHASE8A_CHECKLIST_SOURCE_INDEX.md`.
2. Default every baseline ID to `CURRENT`.
3. Mark exactly these three historical baseline IDs `SUPERSEDED`:
   - `DPM-003`
   - `SHZ-007`
   - `SHZ-020`
4. Apply the current text in `PHASE8A_AMENDED_EXISTING_REQUIREMENTS.md` to the 14 baseline IDs marked `CURRENT — AMENDED`.
5. Add the 59 genuinely new requirements in `PHASE8A_NEW_01...07`.
6. Preserve all 24 FORBIDDEN, all 14 OPTIONAL-IF-SUPPORTED and both FUTURE-INTERFACE checklist rows unless later explicitly superseded; none is superseded in Phase 8A.

This yields exactly **525 current unique requirements** plus the 3 superseded historical rows retained for traceability.

## Required fields for every current requirement

Every current requirement must resolve to:

- stable ID;
- class;
- profile;
- current requirement text;
- authoritative source;
- owner subsystem;
- target original implementation phase;
- current audit owner (8B-8F as applicable);
- dependencies;
- expected Android component role;
- expected backend component role;
- expected portal component role;
- expected test/evidence type;
- field-test requirement;
- source-gap status.

No current requirement may remain `UNKNOWN` or unmapped at Phase 8A closure.

## Default owner mappings for unchanged baseline IDs

These rules are used to reconstruct the generated normalized ledger; they do not claim that implementation exists.

- `GOV`, `COV`: governance/coverage; original phases 1/9; audit 8B-8F as applicable.
- `PLT`: Android platform/provisioning; phases 1/2/6; audit 8C/8F.
- `LOC`: location validation; phases 3/5; audit 8C/8F.
- `ACT`: activity/sampling; phases 3/5; audit 8C/8F.
- `MOT`: motion/particle; phases 3/5; audit 8C/8F.
- `FUS`: fusion/fallback; phase 5; audit 8C/8D/8E/8F.
- `ATL`: Environmental Atlas; phase 4; audit 8C/8D/8E/8F.
- `WIT`: Witness/Ground Network; phase 5; audit 8C/8D/8E/8F.
- `DPM`, `SHZ`: Device Owner/Shizuku; phase 6; audit 8C/8F.
- `REL`, `DAT`, `SEC`: reliability/data/security; phase 8; audit 8C/8D/8E/8F.
- `SAFE`: safety; phase 7 with reliability verification in 8/9; audit 8C/8D/8E/8F.
- `HIS`, `PORT`: history/parent portal; phase 7; audit 8E/8F, with backend evidence in 8D where applicable.
- `CUI`: child UI; phase 7; audit 8C/8F.
- `BE`: Cloudflare/backend; phases 2/7; audit 8D/8F.
- `OPS`, `QA`: release/qualification; phase 9; audit 8B-8F as applicable.
- `NO`: forbidden/non-goal; phases 1/8/9; proof is absence by code/package/network/regression evidence.

## Default evidence mappings by profile

- `UI`: production device/browser state matrix + integration + stale/offline/error-state evidence.
- `FEAT`: source reachability + unit/integration + real-device evidence where platform dependent.
- `ALG`: deterministic/simulation + integration trace + adversarial evidence + real physical scenario where needed.
- `PERF`: measured cadence/CPU/RAM/wakeups/scans/battery/thermal/network/storage on exact target release.
- `REL`: fault injection + automatic repair/verify/escalation + containment/recovery evidence; a successful manual restart does not pass.
- `DATA`: transaction/crash/corruption/retention/reconciliation tests.
- `PROTO`: schema/fuzz/replay/order/duplicate/auth integration tests.
- `SEC`: static/config/package review + authenticated/unauthenticated adversarial tests.
- `TEST`: exact named production-like scenario with timestamped expected-vs-actual evidence.
- `RELEASE`: build/artifact/deployment identity + packaged inspection + reproducibility evidence.
- `OPT`: per-device capability detection + supported end-to-end PASS or `VERIFIED UNSUPPORTED` on each target.
- `FUT`: interface/abstraction tests + runtime capability honesty.
- `NO`: code/package/network inspection + negative regression proving the forbidden path is absent.
- `ID`: identity creation/storage/rotation/revocation/auth tests.

## Dependency-family defaults

- Location depends on platform capability and durable time/state.
- Activity/motion depends on platform sensors and location calibration.
- Fusion depends on location, motion, Atlas and Witness evidence where available.
- Atlas depends on evidence plumbing, durable data and trusted-position calibration.
- Witness/Ground depends on identity/security/backend and fusion.
- Device Owner/Shizuku depends on Android capability plus command/security boundaries.
- Reliability/data depends on phone state, durable journal/backend semantics and provider health.
- Safety depends on durable data, position state, backend delivery and parent presentation.
- History/portal depends on backend current/history APIs and authentication/authorization.
- Release/QA depends on exact release identity plus the relevant functional requirements.

Specific new-requirement dependencies are written directly in `PHASE8A_NEW_01...07`.

## Generated ledger verification

A full normalized 528-row working ledger was generated and validated locally:

- 525 current unique requirements;
- 3 superseded historical rows;
- 485 mandatory;
- 24 forbidden;
- 14 optional-if-supported;
- 2 future-interface;
- exactly one open source-value gap: `LIVE-005` / `P8A-GAP-002`.

Generated ledger SHA-256:

`d012f6a3e8df7491ffa8207240d7c53a9f48d5b65e585aab0d83f86497fcc614`

This hash is a reproducibility check; the authoritative contract is the pinned source + committed normalization/amendment files above.
