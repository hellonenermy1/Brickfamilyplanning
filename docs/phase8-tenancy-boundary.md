# Brick V1 Phase 8 tenancy boundary

Brick V1 production is intentionally **single-family per Cloudflare deployment/account boundary**. It is not a multi-family SaaS database.

## Security boundary

One production deployment owns one canonical Worker plus its private D1 database, history/map R2 buckets, event Queue/DLQ, Durable Object namespace, rate-limit namespaces, and Cloudflare Access application. The parent surface is protected by the exact Access application audience and team domain generated for that deployment.

Device data is then isolated inside that family deployment by cryptographic device identity: a device request is accepted only when its signature matches the public key registered to the device ID in that deployment. A device key cannot be used against another device ID, and revoked public keys remain tombstoned.

## What Brick V1 does not support

Brick V1 does not accept a caller-provided `familyId`, tenant/database name, bucket name, queue name, Access audience, or Cloudflare account selector on HTTP routes. There is no row-level multi-family authorization model to accidentally misconfigure.

Two unrelated families must **not** share one Brick Cloudflare account/deployment. A second family must use a separate Cloudflare account/deployment so it receives a separate Access trust boundary and separate account-scoped storage/queue resources. The production setup intentionally uses one canonical resource set per account instead of pretending multiple families are isolated inside one database.

Cloudflare account membership therefore defines the parent trust group for that family deployment. Do not add unrelated people as account members to a family deployment.

## Phase 8 acceptance

The Phase 8 deployment contract must fail if:

- production stops using the canonical private resource bindings;
- setup starts accepting a request-controlled tenant/resource selector;
- Cloudflare Access no longer protects exactly `/parent*` with the deployment's verified audience/team domain;
- device authentication can authorize a different device ID;
- the permanent public-key tombstone/uniqueness migration is absent.

A future multi-family hosted product would require a separate tenancy design and migration with explicit family ownership on every parent-readable/mutable object. It must not be inferred from this V1 architecture.
