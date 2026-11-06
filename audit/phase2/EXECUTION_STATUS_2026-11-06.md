# Brick V1 Phase 2 parent portal — verified implementation status

Date: 2026-11-06 (Singapore). Isolated feature branch: `feat/v1-phase2-parent-20261106`; base `beta/backend-portal`; draft PR #45.

## Non-negotiable constraints
- Keep current beta portal hostname: `https://brick-family-beta.lumjayvian.workers.dev/parent/login`.
- D1 primary, D1 chunked objects, separate diagnostics D1, existing SQLite Durable Objects and D1-based maintenance. **NO R2, paid Queues, card, billing upgrade, Zero Trust requirement**.
- Preserve all existing pages, pairings, device identities, Device Owner, old history, API safety boundaries, public map-data sourcing, other Cloudflare Workers, existing beta portal and Phase 8D branch.
- User-reported false positives: ordinary phone placement caused at least nine displayed fall alerts within approximately ten seconds. Historical screenshot shows approximate home position: **DO NOT UPLOAD IT TO PUBLIC GITHUB**.
- User requires disabling automatic human-fall sensor in the next signed APK. Android safety fix is in separate draft PR #47, not equivalent to merely suppressing the browser banner. SOS remains critical.
- User also wants non-emergency phone drop/put-down classification after safe validation (#43); not present in current builds.
- User requests a memorable parent passphrase (#44); plaintext must never be committed, exposed in logs, inserted into public CI input or documented in GitHub. Existing login continues until private verifier rotation is deployed.

## Implemented, exact code changes
- Parent safety feed groups distinct rapidly arriving historical `fall_detected` records into expandable 60-second rows, preserving every original event and event ID. WebSocket banner dedupe is by event ID; human fall percentages are not presented as probabilities. Original SOS and unrelated event behavior preserved.
- Delay MapLibre history route draw until style loaded. Phase7 history request generation/device capture prevents stale responses overwriting newer device/date data and stops previous playback timer when replacing history.
- Parent login now accepts 16–128 supported password characters. New passphrase hash uses per-rotation 128-bit salt and PBKDF2-SHA256/240k iterations as private Worker secret; prior 256-bit random-token SHA-256 verifier still supported for migration. Protected sessions, rate limits, CSRF/Origin and no-store headers retained. **Private password has not been rotated yet.**
- Exact signed diagnostic client allowlist recognises Beta1 v11 and Beta2 v12 identities without mixing release ID, SHA and version. **Beta2 is NOT automatically promoted as recommended portal download**; existing approved Beta1 artifact remains pinned until separate field safety fix qualifies.
- Adds authenticated beta observation Logs tab (last seven Singapore local calendar days) and read-only per-device D1 observations API. Explicitly labels source as beta observations, **not** the Android DiagnosticStore full operational logs. Routine seven-day upload/pruning for complete phone logs remains future work; beta evidence retention remains separate (35 days). Does not expose coordinates, raw radio IDs or keys.
- Adds D1 device/time index for bounded log query.
- Isolated CI runs Kotlin-unrelated web/server TypeScript, parent asset build, existing Workerd beta regression, legacy and new PBKDF2 auth, exact APK allowlist checks and dry-run Wrangler. No cloud writes.

## Acceptance limitations / outstanding work
- Exact deployed backend commit and real signed-in browser acceptance have **not** been verified for this branch: feature branch is NOT deployed.
- Signed Beta3 v13 safety APK separately building/testing in draft #47; after exact artifact pass, allowlist must add its exact release ID, APK source SHA and version.
- Backend test-run/phone logs remain subject to user phone/device state. Do not call absent observation results proof of health.
- Parent password change requires updating GitHub Actions private secret `BRICK_BETA_PARENT_ACCESS_TOKEN` or equivalent secure Cloudflare Worker secret path; no plaintext in chat, git, PR or CI logs. Test login then revoke existing sessions.
- Full Android operational log upload and seven-local-calendar-day daily pruning (issue #39), source-level human-fall sensor disablement in installed phone (#34), drop classifier (#43), History replay on real browser (#36), full phone/cloud device deletion (#37), phone-heading wedge (#38), real OPPO 72-hour endurance and Phase8D final acceptance remain unqualified.
- Public Github CI and source review can establish only source-level gates. Do not claim success of live APK pairing, background GPS, notification delivery, or actual Cloudflare deployment on the basis of unit tests.
