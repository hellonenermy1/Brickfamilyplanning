# Phase 8D development-login migration — no credentials in Git or ChatGPT

- The old public six-digit PIN verifier must be treated as compromised even after current source removes it; Git history is immutable.
- To deploy dev Worker v10 from an accepted source, generate a *new independent* 32-byte random token locally using Node `require('node:crypto').randomBytes(32).toString('base64url')`; store privately in a password manager.
- Provide it only as the private environment variable `BRICK_DEV_PARENT_ACCESS_TOKEN` to the authorized setup process. NEVER echo it to logs, commit it, or paste it into a chat.
- `scripts/setup-v1-phase6-development-free.mjs` validates token presence before Cloudflare mutations, deploys dev Worker, then puts its SHA-256 into the Worker secret binding `DEV_PARENT_LOGIN_HASH`. Template `wrangler.development.template.jsonc` contains no credential verifier.
- Existing browser D1 sessions and the old deployed version are not automatically invalidated by a source commit. Authorized operator must validate the deployed hostname and migrate the dev Worker, verify no old six-digit credential works, and revoke pre-rotation `dev_parent_sessions` with a reversible/audited plan.
- The setup may perform dev Cloudflare mutations and is NOT automatically run during Phase 8D source CI. No live credentials or environments were accessed in the current audit.
