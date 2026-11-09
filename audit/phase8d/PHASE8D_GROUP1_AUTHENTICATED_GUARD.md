# Phase8D Group1 authenticated guard transport

## 2026-11-10 — authenticated independent guard transport source and native recovery qualified

Candidate `ae0f33f89aa11925dd9f6802ed9952381ebc9203`, tree `4a0b12a6b120588edcd48623d239cd08a68e83f0`, baseline `da4b0271eaf0c7b32dc1c5eaa546f11c699c1037`, unchanged integration base `141cbf42efaa61873c4fa87138ca5a0a19d404a2`. New inert quarantine transport supplies own HMAC domains, request-bound signed replies, separate capture-read/runtime-poison keys, independently pinned guard epoch and durable replay before guard work. Missing/corrupt/full replay state refuses; no network initialization or reset. Trusted-owner configuration contract rejects shared origins/epochs/key IDs/key material and emits a secret-free manifest with actualFailureDomainQualified=false. Distinct origins are configuration checks, not actual independent failure-domain proof. No endpoint/env/route/key installer activated.

70 new focused cases pass (26 contract,44 native authenticated guard). Native fixtures exercise all capture operations, urgent fallback, poison/restart, exact replay, role/protocol/pin/shape refusal and lost acknowledgement preventing source work. Full encrypted41+4/deviceDO destruction/fresh restore now uses actual guard transport with separate fixture keys/origin/epoch/replay. Interrupted encrypted journal resumes >45 entries without source page/device rereads; authenticated guarded release precedes sealing. Exact33-row/16-table parity, revocation/credential/nonce/expiry and restart remain verified. All26 local workflow groups pass on this exact source. Both hosted audits pass33/33, Phase2 passes14/14 and portal10/10; full logs, exact checkout, merge parents/tree verified. See audit/phase8d/PHASE8D_GROUP1_AUTHENTICATED_GUARD.md and audit/phase8d/PHASE8D_GROUP1_AUTHENTICATED_GUARD_EVIDENCE.json. Fresh full verification was used because staged control-plane changes are outside the unchanged90-file production runtime projection.

Group1 NOT READY; P8D-002 P1 OPEN;8D NOT PASS; four-day forecast AT RISK. Authenticated guard protocol and candidate separation validation are implemented/qualified source work; do not repeat them as missing source. Actual trusted installer/TLS/key custody/failure-domain and complete writer/operator/credential/raw bypass/STARTED reconciliation remain. Four external beta-tool hooks uninstalled. Restricted B2 runtime credential and durable manifest/key/context, installed schedule/readback/age/failure/real-recipient monitoring, current scoped PITR and isolated cloud restore/interruption/rollback/RTO/RPO remain open. No partial activation, new provider work, family-data/cloud/credential/permission/billing/R2/card/APK/UI/phone changes, merge or deployment.525 canonical acceptance/owner/review/disposition fields and214/311 mappings remain unchanged; reviewedSourceSha=null. No fabricated completion percentage.

### Hosted source qualification

- pull_request Phase 8D D1 storage and recovery audit (no cloud writes): run42653454606, job129285600417; 33/33 steps; log SHA256 `7ddd0f8bd404d241aca4b3bfc8aada0ca42f7f65178cd0df7e5ea1c616c3418b`.
- pull_request Brick Phase 2 — Isolated Parent Portal Verification: run42653454665, job129285599759; 14/14 steps; log SHA256 `34255e696d2ee97730d9b758cc788047daf77db49004ad0d080ae0c59ffa2fdf`.
- pull_request Brick Beta Map and Portal Regression (no cloud writes): run42653454552, job129285600096; 10/10 steps; log SHA256 `8a4286d34bce13b06df2477c2c860e2460d56412fa95f78480f463d81f818938`.
- push Phase 8D D1 storage and recovery audit (no cloud writes): run42653440783, job129285559020; 33/33 steps; log SHA256 `676f225f5220366b28b61f6985e258e9abd8ec3a824c0869f55621d6a0e47a51`.

### Remaining acceptance gates

- Trusted actual installation with protected TLS endpoint, restricted key custody/rotation and independent failure-domain evidence; distinct configured origins do not prove that domain.
- Complete declared final writer/operator/credential effects, raw/lower-level/direct binding bypass restrictions, four external beta-tool hooks and STARTED/legacy unknown-outcome reconciliation; authority installation/rollback compatibility.
- Restricted B2 runtime credential and separately durable version manifest/key/context; installed schedule/readback/age/failure and real-recipient monitoring.
- Current least-privilege PITR evidence and isolated cloud restore/interruption/rollback with measured RTO/RPO.
