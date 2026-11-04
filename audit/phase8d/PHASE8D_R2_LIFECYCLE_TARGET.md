# Phase 8D.17 — R2 lifecycle target (NOT applied)
Cloudflare lifecycle target for the **production history bucket**, based on the actual `history-store.ts` new raw/trusted object prefixes. Source policy alone is not runtime proof.

- `history/raw/` must expire after **30 days** (2,592,000 seconds).
- `history/trusted/` must expire after **90 days** (7,776,000 seconds).
- Do **not** use a bucket-wide delete rule or replace an existing lifecycle configuration blindly. Inspect and merge any unrelated rules (backup/evidence/hypotheses/refined) before an authorized change.
- Legacy `history/<device>/...` objects, evidence, refined and backup namespaces require independent classification and separate lifecycle proof. The two rules do not cover them.
- Cloudflare object lifecycle removal is asynchronous; verify via read-only lifecycle GET, object expiration metadata and representative age-boundary samples. Cloudflare documents usual removal within approximately 24h but possible delays.
- No production API, retention setting, or bucket policy change is authorized by this file.
- Source: https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/lifecycle/ and https://developers.cloudflare.com/r2/buckets/object-lifecycles/

P8D-014 remains OPEN until actual Cloudflare rules, historical objects and isolated expiry exercise verify effectiveness and isolation.
