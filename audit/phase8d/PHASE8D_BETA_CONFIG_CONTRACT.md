# Beta deployment preflight isolation — P8D-091

Phase8D NOT PASS; operational recovery P8D-002 remains P1 OPEN. This source correction qualifies the local beta configuration validator and actual setup's early refusal, not a current deployment or a release approval. The existing Wrangler template, runtime, APK, UI and actual cloud resources are unchanged.

## Reproduced gap

The previous validator accepted all14 synthetic rendered mutations recorded in PHASE8D_BETA_CONFIG_RED.json: destructive DO deletion, class transfer, migration tag drift, alternate routes, a nested environment with an R2 binding, an extra KV binding, asset behavior override, observability activation, rate binding-name drift, login quota weakening, compatibility-date drift, malformed UUID, case-aliased same database and an extra lowercase secret-like variable. Only the actual validator was called. No Wrangler deploy, provider query, account access or destructive operation occurred. A source preflight accepting a configuration is not proof that Wrangler would accept every field or that the configuration was ever deployed.

## Correction

The validator now requires the exact existing template's root/nested key inventory. It pins the current Worker entry/name, runtime date, workers.dev setting, disabled observability, public asset directory, empty cron list, current variable set/auth/storage/channel/version, DO binding/class pairs, migration tag/class sequence and all nine rate binding/name/namespace/quota/period tuples. Unknown fields, including alternate routes, environments, service/storage bindings, extra migration actions, asset behavior and logging overrides, fail generically. Configuration evolution requires a reviewed contract update alongside its template change; an extra Wrangler field is not silently authorized.

Template mode requires the exact four existing placeholders. Rendered mode requires an exact lowercase40-character source SHA, the existing allowed Protomaps URL envelope and correctly grouped hexadecimal UUIDs. Distinct database comparison is case-insensitive. Database/DO/rate collection order and JSON key order remain irrelevant; migration order remains pinned. Distinct uppercase UUIDs are accepted. Sparse class arrays cannot skip validation. No arbitrary config/secret value enters the validator's error message.

The actual setup already validates its template before token/account/resource selection and validates the rendered config before using it. The new suite executes that real script under synthetic invalid configs with fetch/process capabilities blocked, and verifies refusal before credentials, network/process use, generated config or setup state. A valid existing template passes preflight and stops at the intentionally missing credential gate. The setup script is not modified and no credential is supplied by these tests.

## Verification and limits

`scripts/test-phase8d-beta-config.mjs` has56 cases, including positive template/rendered/order/uppercase behavior, both-mode refusal for40 independent mutations, malformed IDs/aliasing/placeholders/shape and seven actual provisioner early-gate cases. The original beta deployment test is preserved. Both suites now run in the existing no-cloud-write audit workflow's provisioner step; no new deployment trigger is introduced.

Partial canonical scope is OPS-011 (safe deployment/migration preflight) and SEC-014 (configured rate-limit mappings). This does not prove live migration/rollback, active-device continuity, real quota enforcement/WAF, schema validation or provider resource identity. A syntactically distinct D1 ID does not prove it belongs to the intended beta account/store; current read-only provider attestation is still required. SHA shape does not prove checked-out source identity; runtime/date/asset contract conformance is not provider/version attestation. No claim is made about real Cloudflare deployment success, imported runtime behavior, full request limits, scheduling, backup independence or phone endurance.

P8D-091 is a P1 source preflight finding because supported destructive migration/config drift could pass the asserted isolation gate. Its source correction must be qualified on the exact hosted source before being marked source/CI verified. No operational P1, canonical status/criterion/owner/review/final disposition or phase boundary is waived. Existing failed Cloudflare login and denied read-token blockers remain; no retries or broad-credential fallback, R2/card/billing activation, cloud writes or merge/deployment are part of this work.
