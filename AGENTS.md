# Brick project rules

Read PROJECT_MEMORY.md before architecture, deployment or beta work.

## Hard user constraint: no credit card / no R2

- Jayvian has no credit card. Brick must run without requiring a credit card, billing activation or a paid subscription.
- Do not require, provision, enable or recommend Cloudflare R2 for this project. Do not ask the user to enable R2 again.
- Use a D1-first, card-free beta architecture. Reuse and qualify the existing D1-backed runtime where appropriate, while preserving current features and security.
- Evaluate Queues, Access, map sources, APK hosting and other dependencies against this constraint; do not replace R2 with another service that requires a card. Use the existing authenticated D1 parent-session path when suitable; do not make the portal public to avoid Access setup.
- Older R2-based plans, audit notes and deployment instructions are historical and superseded by this explicit user constraint. Keep their evidence honest; D1 tests must not be called proof of real R2/Queue operation.
- Changing this constraint requires an explicit new instruction from the user. It must not be inferred from a request to continue, deploy, finish a phase or preserve features.
- Preserve Phase8D and concurrent APK safety work. Implement beta changes on their designated branches.

## Continuation execution
- Current user-selected replan (7 November 2026): follow `audit/phase8d/PHASE8D_FOUR_DAY_CLOSURE_PLAN.md`. Target four active workdays, with a conditional Day10 contingency; neither is a guaranteed completion date while external dependencies remain unresolved. Preserve all four existing groups and the actual exit requirements.
- Keep one main implementation objective at a time. Shared access/authority/review preflight and evidence reconciliation start early; when a group is externally blocked, advance the next unblocked approved source task rather than extending unrelated helper machinery. A plain continue executes the largest practical connected batch in that plan. Moving to independent work never marks a blocked group closed or grants live mutation/deployment authority.
- Within Group 1, distinguish staged admission/transport components and controlled native fixtures from installed runtime writer coverage, independent custody, scheduling and actual cloud recovery. Do not activate a partial writer fence or treat writer timeout/expiry as proof that work stopped.
- A plain “continue” resumes the existing unresolved approved work. Read PROJECT_MEMORY.md, current refs, issue26 including comments and the formal audit handoff linked there.
- Complete the largest practical substantive batch per prompt: reproduce/record, correct, verify, and persist evidence/next requirements. Move to independent useful work when a dependency is blocked.
- Do not stop just to ask whether to continue. Stop for a concrete blocker, necessary missing input/decision, actual scope boundary or execution limit, after completing independent work.
- Preserve all features, existing signed APK safety fixes, user data and approved latest UI decisions. Do not restart phases or redesign without cause.
- Distinguish committed, locally tested, CI-tested, deployed, browser-verified and physical-device-qualified. Never infer a PASS or72h result.
- Reconcile older formal8D R2 obligations with approved D1 architecture; preserve every requirement and historical result. Existing beta deployment is not formal8D acceptance.
