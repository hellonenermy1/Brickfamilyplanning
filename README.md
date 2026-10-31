# Brick — Cloudflare 1-Click Setup

This is the canonical **Cloudflare deployment branch** for Brick.

Use GitHub Actions. Do not manually copy old Phase 5/Phase 6 setup files from archived branches.

## Deploy Brick

1. Open **Actions**.
2. Select **Deploy Brick Phase 6 Candidate**.
3. Click **Run workflow**.
4. Keep the branch as `main`.
5. Enter the Cloudflare Account ID.
6. Leave **Install/update the private Singapore map** enabled unless you intentionally want to skip the map.
7. Run the workflow.

Required GitHub Actions secret:

- `CLOUDFLARE_API_TOKEN`

Cloudflare Zero Trust must already be onboarded and R2 must be available for the account. For real production use, Brick should use Workers Paid because the durable Queue/history design can exceed Free-tier Queue limits during high-rate movement.

The deployment workflow validates the selected source, provisions/reconciles D1, R2, Queues/DLQ and Cloudflare Access, applies the schema, optionally installs the private Singapore map, deploys the Worker, and runs post-deployment verification. A successful deployment uploads non-secret deployment evidence as a workflow artifact.

## APK download

The Android source is kept separately on branch **`apk-download`**.

From Actions, run **Brick — Build / Download APK**. That workflow always checks out `apk-download` and uploads:

- `Brick-APK-debug` — installable debug APK for functional testing.
- `Brick-APK-release-candidate` — release variant; may be unsigned if production signing secrets are missing.
- `Brick-APK-production-signed` — only appears when all stable signing secrets are configured.
- `Brick-APK-evidence` — hashes, signing evidence and merged APK metadata.

Production signing secrets, when used:

- `BRICK_ANDROID_KEYSTORE_B64`
- `BRICK_ANDROID_KEYSTORE_PASSWORD`
- `BRICK_ANDROID_KEY_ALIAS`
- `BRICK_ANDROID_KEY_PASSWORD`

Do not treat an unsigned release candidate as a production APK.

## Audit and progress

All Brick audit records, project rules and ongoing progress are kept on branch **`audit-progress`**.

That branch contains the standing project memory and progress log. Brick work should be logged there automatically as it is completed.

## Canonical branch layout

- `main` — Cloudflare 1-click setup and deployment runtime.
- `apk-download` — Android app source used by the APK build/download workflow.
- `audit-progress` — audits, acceptance state, project memory and chronological progress.

Current release truth remains `0.6.0-phase6-rc`, `versionCode 6`, and `candidate-not-real-device-qualified` until stable signing, live Phase 6 Cloudflare deployment, authenticated browser smoke testing, and real OPPO/ColorOS qualification are complete.
