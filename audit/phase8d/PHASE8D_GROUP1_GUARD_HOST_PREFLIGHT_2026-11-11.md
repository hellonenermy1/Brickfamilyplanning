# Group 1 — guard host candidate preflight

Checked11 November2026, Singapore. Read-only primary-source research; no signup, service, credential, permission, deployment or billing change.

**Deno Deploy: do not select for a new Brick recovery guard/runner.** This is a candidate rejection, not a selected replacement platform or proof that all remaining host choices are blocked.

| Check | Official evidence | Brick implication |
| --- | --- | --- |
| Service continuity | Deno's9 October2026 announcement says the team is joining Cloudflare and Deploy will operate for six more months before shutdown. | A newly installed durable guard/custody service would inherit a known near-term migration; reject this candidate. |
| Administrative/failure independence | Cloudflare's announcement confirms the Deno team is joining it. | A different hostname alone cannot establish the separately required administrative/failure-domain/key-custody separation. Physical/shared-failure behavior was not tested. |
| No-card boundary | Deno's official changelog distinguishes restricted unverified Free limits from the full allowance unlocked by linking a credit card. | Do not call the advertised full Free allowance card-free. This does not mean every unverified free use requires a card; adequacy of restricted limits was not qualified. |

Primary sources, read directly:

- [Deno announcement](https://deno.com/blog/cloudflare)
- [Cloudflare announcement](https://blog.cloudflare.com/deno-joins-cloudflare/)
- [Deno official changelog](https://docs.deno.com/deploy/changelog/)

The rejection is Brick's planning judgment from the retirement notice and unresolved independence/custody conditions. It is not a provider outage observation, a technical assertion that every Deno failure is shared with Cloudflare, or a claim that an alternative host is already qualified.

Still required: select an approved viable runtime/failure domain; verify no-card limits and durable storage/restart behavior; establish protected TLS/source/resource/epoch/key custody; review complete startup/rollback and all raw/operator credential restrictions. Existing B2 storage is a destination, not an automatically selected compute host. A host choice does not authorize provisioning, uploading family data, creating credentials, changing production or accepting Group1.
