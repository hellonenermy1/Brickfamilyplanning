# Brick V1 Phase 8 — Supply-chain and architecture truth

Phase 8 hardening deliberately separates what is actually deployed from what older architecture plans may mention.

## Immutable CI actions

Resolved on 2026-11-02 and pinned by commit SHA in Phase 8 workflows:

- `actions/checkout` v5 -> `fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09`
- `actions/setup-node` v5 -> `a0853c24544627f65ddf259abe73b1d18a591444`
- Android Phase 8 separately pins setup-java, Gradle Actions and upload-artifact.

Historical Phase 2-7 workflows are retained as historical evidence and are not silently rewritten.

## npm dependency policy

Phase 8 cloud CI requires every direct runtime and development dependency in `package.json` to use an exact semver version and to match the root package-lock entry exactly. `npm ci` is mandatory. High-severity production dependency audit failures fail CI. Common advertising/analytics SDK families are explicitly rejected.

## Cloud architecture truth

The Phase 8 development runtime currently uses the Worker + D1 card-free path. Its development template intentionally has no R2 bucket, Cloudflare Queue, Cloudflare Access binding or cron trigger. Production remains frozen on the retained Phase 6 worker entrypoint until later release qualification.

Brick **does have** a parent WebSocket route in the retained worker chain. The retained worker requires parent authorization before forwarding `/parent/...` routes and requires an exact same-origin WebSocket upgrade for `/ws`. The Phase 8 development wrapper protects every `/parent/...` path with the D1 parent session before forwarding to that retained worker. The live browser qualification also forces the browser offline and verifies the portal WebSocket returns to `LIVE` after connectivity is restored.

This means WebSocket security is part of the Phase 8 parent-session surface and must remain covered. It must never be described as unsupported or absent.

Cloud budget evidence must cover only services actually used by the selected runtime. Queue/R2/Access budget claims are invalid for the card-free development runtime unless those bindings are deliberately introduced and qualified later.
