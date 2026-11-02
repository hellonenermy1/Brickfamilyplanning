# Brick V1 — Phase 8 Cloud Hardening

Baseline: `820fb8974ae185d74b4963b31b18a7fa0eafedf6` (`v1-p7-cloud-ux`).

This branch hardens the cloud/parent side without pretending undeployed Cloudflare products exist.

## Architecture truth at Phase 8 start

The Phase 7 development runtime uses `src/worker-v10.ts` with D1-backed development storage/session auth. Its development Wrangler template intentionally has no R2 bucket, Queue binding, Cloudflare Access variables, or cron trigger. Production remains frozen on `src/worker-v9.ts`.

Therefore Phase 8 must measure and attack the deployed path first. Requirements that specifically depend on Queue/R2/Access stay explicit until those bindings actually exist; they are not marked complete from dormant helper modules.

## Retained security/durability evidence

The inherited regression suite already exercises Access JWT verification, operational/backup behavior, fresh-D1 restore validation, DLQ recovery logic, public pairing limits, revoked-device mutation ordering, Phase 5 fusion/history semantics, evidence link integrity, route constraints and the privacy audit.

Phase 8 adds rather than renames tests.

## New Phase 8 protection

State-changing development-parent requests now require an exact same-origin `Origin` in addition to the existing `Secure; HttpOnly; SameSite=Strict` session cookie. Missing, malformed, wrong-scheme and wrong-host origins fail closed. The externally supplied internal-auth header remains stripped before authorization and re-added only after a valid D1 session.

## Still open

- full request/response size and rate-limit review for every device/parent route;
- family/device authorization enumeration tests;
- lost-ACK/duplicate/replay chaos against the current ingest path;
- revoked-device re-enrol/upload integration test with retained history proof;
- live destructive restore rehearsal against an isolated disposable D1 target;
- retention verification by data class;
- cloud operation/storage budget measurements;
- dependency and GitHub Actions supply-chain pin review;
- live browser attack tests against the Phase 8 deployment;
- any Queue/R2/Access-specific requirement whose binding is not actually deployed.
