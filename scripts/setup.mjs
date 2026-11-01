// Canonical Brick V1 setup entrypoint. Keep this small so every deployment path uses the same
// schema-safe Phase 6 provisioner rather than an older phase wrapper.
await import('./setup-v1-phase6.mjs');
