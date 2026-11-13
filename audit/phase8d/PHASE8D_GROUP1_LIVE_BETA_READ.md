# Group1 live beta read — partial evidence, D1 access denied

On10 November2026 at20:28 SGT, the approved read-only workflow ran on audit source917f63b09c8ea09459b9926cf2d4466ec0013771. Its executable files are identical to qualified311d78d4ee9fe43ff23d4f875e21ff8e0bb8fa5d. PR61's one-file inert launcher registration was merged into main ascb380fe821b16cf5304843af2ce713d21f575788; application PR32 remains draft/unmerged. No application deployment occurred.

Run: https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/42816014091 . Metadata job129829190871 checked out the exact source, loaded the private plan, used the existing masked dedicated audit credential and saved a sanitized result artifact. Its CLI exit2/job failure is a real blocked audit outcome, not a green result. Artifact13765700122 ZIP digest12c330b5cd0fec9fc3c34a3c3fe122d46a26875ffc0f34962ecc35f5fc0c52df was downloaded and verified; exact sanitized result is retained in the companion JSON. No raw provider IDs, secret, private plan or response bodies are committed.

Companion native job129829191412 completed33/33 successful steps on the exact917f63b checkout; its full decoded log was checked with zero error markers and44 focused synthetic cases retained. The overall workflow remains FAILURE because the live metadata job failed. Prior executable26-local-group and push/PR qualification is reused within its unchanged-source limits.

## Actual result

| Check | Result and limit |
| --- | --- |
| Serving beta deployment/version | Metadata read succeeded; active version and self-reported source label matched recorded141cbf42efaa61873c4fa87138ca5a0a19d404a2. This is not bytecode provenance. |
| Storage bindings and modes | Exactly2 expected D1 bindings and2 distinct valid native DO namespaces, approved beta modes and no R2/Queue binding passed the reader. DO IDs were observed as hashes; expected namespace pins remain independently unreviewed. |
| workers.dev hostname | Account subdomain and script enabled state matched the pinned beta host. This does not test routes/custom domains, every public API or continuous availability. |
| Primary D1 identity metadata | First D1 GET returned READ_ACCESS_DENIED. Reader maps HTTP401/403 to this sanitized code; exact status/provider response was not retained. Permission/account/resource-scope cause is not yet established. |
| Diagnostics/bookmarks/drift reread | Not requested after the failed D1 check. No current primary or diagnostic bookmark, retention window or final deployment stability proof. |

Total5 GET requests:4 Workers metadata reads and1 primary D1 metadata read. No mutation, SQL/query/export, backup upload, family-data access, notification, credential/permission change or broad deployment-token fallback. The denied request was not retried. Overall checksPassed=false, metadataReadCompleted=false and activeVersionBindingMetadataVerified=false remain intact. This is useful partial current-provider evidence, not a full G1.5/G3.1 acceptance.

## Concrete next access action

Responsible role: Cloudflare account/token administrator. Inspect the dedicated audit token's D1 Read permission and intended Brick account coverage. Official GET-database and GET-bookmark API references accept D1 Read; D1 Write is unnecessary for these reads. The existing credential is demonstrably present and permits Workers metadata. Do not assert it is missing or replace it with the deployment token. The sanitized denial does not reveal whether permission, account policy or another resource restriction caused it.

If correction is needed, obtain explicit authorization for that access change, retain existing Workers read capability and restrict the token to the intended account as the provider supports. Do not promise per-database token scoping without validating provider support. D1 Read is a provider capability, not intrinsically confined to these metadata URLs; the staged runner enforces the narrow GET-only path allowlist. Do not grant D1 Write, administrative/key-management/deployment permissions or access to unrelated accounts to satisfy this check. Any new secret must go directly through the secure provider/GitHub secret entry to CLOUDFLARE_AUDIT_READ_TOKEN; never chat, workflow plan inputs, logs or a public commit. No credential change has been performed or authorized by this metadata run.

After a material access correction, recheck the source and expected identity against current refs. Reuse the verified historical private plan and observation mode; independently review expected DO pins before attempting full pinned qualification. One current/historical bookmark alone cannot prove a complete retention window, consistency or recovery. Stop again on denial/drift/timeout; no unchanged retries.

## Remaining operational exit

Complete installed writer/bootstrap/raw/operator/credential coverage; independent guard/TLS/domain/epoch/replay custody; restricted B2 runtime host/key; separately durable key/selection-record/digest/config/current delivery journal custody; actual schedule/recipient; isolated two-D1/device-DO restore with schema/devices/history/places/config/relationship parity, interruption/rollback and agreed measured RTO/RPO/real review remain open. Prior actual B2 synthetic transfer/local recovery evidence is preserved without another provider upload. Group1 NOT READY; P8D-002 P1 OPEN; Phase8D NOT PASS; forecast AT RISK.525 canonical requirements and214/311 mappings unchanged.

Primary references:
- https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/get/
- https://developers.cloudflare.com/api/resources/d1/subresources/database/subresources/time_travel/methods/get_bookmark/
