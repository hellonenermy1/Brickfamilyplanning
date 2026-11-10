# Group 1 — explicit pinned operator entry

Baseline `d369c6aaf925a0c3f216a6ae75d0bdcf21a1e0a7`, integration base `141cbf42efaa61873c4fa87138ca5a0a19d404a2`. Requirement: G1.1/OPS-002/OPS-003, supporting existing P8D-002 P1 OPEN. No production installation, cloud operator run, credential change or deployment is authorized by this implementation.

## Missing connection and implementation

The four beta operator scripts had tested signed ownership hooks, but the controller was configured only within test processes. Invoking their actual Node CLI processes did not configure that controller. This source delivery provides an explicit entry that can install the existing signed client into the same shared module instance before importing exactly one allowlisted operator.

| Selector | Actual module |
| --- | --- |
| `probe` | `scripts/verify-beta-live.mjs` |
| `publication` | `scripts/publish-beta-d1-release.mjs` |
| `schema` | `scripts/ensure-beta-d1-columns.mjs` |
| `deployment` | `scripts/setup-beta-d1.mjs` |

`scripts/build-phase8d-operator-launcher.mjs` builds `scripts/.brick-operator-launcher.mjs` on an exact clean Git checkout, embeds its operator-code SHA and reports a bundle SHA256. It executes no operator and reads no key. Build refuses arguments, dirty/untracked selected source and replacement of an existing bundle. The generated local artifact is ignored by Git.

The built CLI accepts only `--config /absolute/private/config.json --tool SELECTOR`. There is no arbitrary module path, credential argument, environment activation flag, automatic provisioning, retry or recurring timer. The generated bundle is the entry; the unbundled source is not a direct Node command.

Before importing either the shared controller or the operator, the launcher checks the owner-private regular single-link config (nofollow/nonblocking, 16KiB limit, stable read), location outside the source checkout, exact schema, canonical 32-byte external-writer key, HTTPS endpoint, independently retained source/resource/epoch pins, two distinct database IDs and beta-only host/Worker scope. It checks exact embedded operator Git SHA, clean tracked source and absence of unexpected untracked source. Dirty helper code therefore cannot execute before the dirty-tree refusal.

The operator-code SHA and active-resource source SHA are distinct explicit fields. The caller's `GITHUB_SHA` must match the active-source pin; this launcher never rewrites that variable or an existing provenance file. Deployment additionally requires operator code and source pin to be the same SHA. It refuses an unreviewed source transition instead of silently relabelling the running application. A transition/rollback across different source identities remains a separate gate.

The external client uses the existing authenticated reservation/START/cancel/exit protocol and a bounded transport deadline. A successful tool with unconfirmed writer release exits unqualified; it does not replay the operation or assert that its writer stopped. Tool errors and notices are redacted to fixed codes at the launcher boundary.

## Private input contract

The object has exactly `format`, `operatorSourceSha`, `url`, `pin`, `key`, `scope`. Format is `brick-pinned-beta-operator-v1`; pin has `sourceSha`, `resourceSetSha256`, `authorityEpoch`; key has `id`, `role: external-writer`, canonical `base64`; scope has `accountId`, two `databaseIds`, `workerName: brick-family-beta`, and `workerHost`. All real values and the key must be supplied through protected non-chat custody after reviewing the selected host and authority. No example secret or raw resource IDs are committed.

Building or possessing this artifact does not approve invoking any of its tools against real resources. `probe` is also a writer: it creates/deletes a parent session and its HTTP traffic may start server maintenance.

## Qualification and limits

The native suite launches fresh Node processes against the four actual modules, with a synthetic HTTPS bridge to a real local durable HMAC authority/replay store. It proves successful verification/publication ownership through cleanup, held-capture refusal for all four tools, unknown cleanup/release without replay, bad signature/epoch rejection, private-file and source checks, deferred helper import and actual clean builder behaviour. Schema/provisioner success paths retain their separate existing native suite. The fixture bridge is not real TLS/provider or independent failure-domain proof.

Direct tool invocation and account/API/console/raw credential access can still bypass this opt-in entry. An operator controlling the host, Git, Node startup, dependency installation or private configuration is outside its adversarial boundary. Preflight checks do not freeze files against later same-user mutation, authenticate an artifact distributor, prove independent key custody or establish anti-rollback. Trusted immutable host/artifact/custody and complete credential restrictions remain operational prerequisites.

Four direct beta mutators remain classified UNFENCED. The inventory now separately records the staged launcher; it is not counted as installed production enforcement. Complete Worker/DO/D1/deferred/process/raw controls, guard/replay/custody, actual schedule, synthetic-only cloud restore/interruption/rollback and measured agreed RTO/RPO/independent review remain open. No partial live fence was activated. Group1 NOT READY; Phase8D NOT PASS.

## Local result

28 fresh-process/native checks and23 source-inventory checks pass. The complete local26-run-step card-free campaign passed, including existing operator/provisioner tests, signed ownership/guard/replay, encrypted archive/monitor, full destruction/fresh41+4/deviceDO recovery, ACK/retention/scheduler and original production trust/recovery. The90-file runtime source projection matches its preserved inventory. The strengthened dirty-helper execution control was rerun on the final test file. Hosted exact-source qualification is recorded separately; no live installation is inferred. Evidence: PHASE8D_GROUP1_PINNED_OPERATOR_LAUNCHER_EVIDENCE.json.

Final local launcher qualification has28 cases. Metadata fixtures now normalize implicit GET correctly and require signed admission (without START) in all four held-capture cases; an early unrelated error cannot satisfy that assertion. A new case rejects even an owner-private credential config inside the source checkout. These final launcher changes were rerun as a complete28-case suite after the broad local campaign; final hosted evidence is recorded separately.
