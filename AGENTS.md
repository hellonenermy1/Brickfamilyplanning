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
