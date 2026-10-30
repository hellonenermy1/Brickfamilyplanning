# Brick V1 — Phase 1 Cloudflare Setup

This branch contains the Phase 1 Cloudflare backend and parent dashboard plus a one-command installer.

## What the installer creates

- D1 database (`brick-family-v1`) in the APAC location hint;
- private R2 bucket (`brick-family-v1-history`);
- Queue (`brick-family-v1-events`);
- dead-letter Queue (`brick-family-v1-dlq`);
- Worker + SQLite-backed Durable Object migration;
- built-in Worker rate-limiting bindings;
- D1 schema;
- Cloudflare Access protection for `/parent*`, restricted to Cloudflare account members;
- Workers Observability.

The child API endpoints remain outside Access because the Android device authenticates each packet with its own Android-Keystore P-256 key. The parent dashboard and parent WebSocket/API routes are under `/parent*` and require Cloudflare Access.

## One-command setup

Prerequisites: Node.js 20+ and a Cloudflare account with Workers, D1, R2, Queues and Zero Trust enabled.

Run:

```bash
npm run setup
```

The script prompts for the Cloudflare API token without echoing it. It never writes the token to the repository or `setup-state.json`.

If preferred, provide `CLOUDFLARE_API_TOKEN` and optionally `CLOUDFLARE_ACCOUNT_ID` as environment variables.

### API token permissions

Give the token only the permissions needed for this setup: Workers Scripts Write, D1 Write, Workers R2 Storage Write, Queues Write, Access Apps and Policies Write, Access Organizations/Identity Providers/Groups Write, plus enough Account read permission to enumerate the target account when `CLOUDFLARE_ACCOUNT_ID` is not supplied.

## Security layout

- `/parent*` — Cloudflare Access required.
- `/api/pair/complete` — public endpoint, but requires a short-lived one-time token and is rate limited.
- `/api/device/<id>/location` — public ingress endpoint, but requires the registered device's ECDSA signature and is rate limited per device.
- `/healthz` — contains no family/location data.

This path split is intentional: Cloudflare documents that Worker-level Access currently blocks WebSocket upgrades, while hostname/path-based Access supports protecting a WebSocket-backed parent application.

## Phase boundary

Phase 1 proves secure pairing + durable signed ingest + current live map. Detailed R2 location history is Phase 4; Device Owner and the self-healing Android reliability supervisor are Phase 2; advanced GPS quality/fallback is Phase 3; production map privacy and full Device Health UI are Phase 5; final torture/security/privacy audit is Phase 6.
