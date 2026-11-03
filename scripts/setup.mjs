// Canonical Brick V1 setup entrypoint. Keep this small so every deployment path uses the same
// Phase 8 identity preflight and schema-safe production provisioner rather than an older wrapper.
const { preflightPhase8LiveDeviceIdentities } = await import('./phase8-live-identity-preflight.mjs');
await preflightPhase8LiveDeviceIdentities();
await import('./setup-v1-phase6.mjs');
await import('./setup-v1-phase8-finalize.mjs');
