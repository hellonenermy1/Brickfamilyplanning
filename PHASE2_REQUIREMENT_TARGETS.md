# Brick V1 Phase 2 — Requirement Targets

Date: 2026-10-31
Status: ACTIVE

Phase 2 directly owns or materially advances these V1 requirement IDs from `V1_REQUIREMENTS.md`:

- `ARCH-001` — add evidence/fusion platform structure without disturbing existing safety/reliability stack.
- `RAW-001`, `RAW-002` — keep raw observations separate and durable.
- `FB-005`, `EVD-001` — establish parallel-provider evidence plumbing (fusion algorithm itself remains Phase 5).
- `EVD-012` — evidence records carry source/age metadata needed later for explanations.
- `RTT-004` — define capability states so unsupported optional providers fail cleanly.
- `RNG-001` — provider/evidence interfaces must admit future ranging without architecture rewrite.
- `TRUST-007`, `IND-001` — enforce independence-group identity at the evidence-model boundary.
- `TRUST-008` — model provider/source health independently.
- `PKT-001` — preserve live-location packet compatibility while adding a separate evidence protocol.
- `SUP-001` — add evidence/journal/provider health to independent monitored loops without replacing the existing supervisor.

Phase 2 also establishes storage/protocol foundations needed by later requirements but does not claim those later features implemented:

- Atlas/provider metadata foundations for Phase 4;
- witness/receiver registration foundations for Phase 5;
- parent-command foundations for Phase 6;
- refined-history metadata foundations for Phase 5/7.

No Phase 3–6 algorithm may be marked implemented merely because its database/interface placeholder exists in Phase 2.
