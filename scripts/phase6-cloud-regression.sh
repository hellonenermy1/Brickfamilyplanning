#!/usr/bin/env bash
set -euo pipefail

# Keep the browser surface and all Cloud source type-safe.
npm run typecheck
npx tsc -p tsconfig.web.json --noEmit

# Phase 6 production setup/deployment must remain schema-safe and provenance-locked.
node --check scripts/setup.mjs
node --check scripts/setup-v1-phase6.mjs
node --check scripts/test-phase6-deploy-contract.mjs
node scripts/test-phase6-deploy-contract.mjs

# Phase 6 security, recovery and durability regressions plus Phase 8 identity-upgrade compatibility.
node --check scripts/test-phase6-access.mjs
node --check scripts/test-phase6-ops.mjs
node --check scripts/test-backup-restore.mjs
node --check scripts/test-dlq-recovery.mjs
node --check scripts/test-public-pairing-limits.mjs
node --check scripts/test-phase8-historical-identity.mjs
npx esbuild src/access-auth.ts --bundle --platform=node --format=esm --outfile=/tmp/brick-access-auth.mjs
npx esbuild src/battery-health.ts --bundle --platform=node --format=esm --outfile=/tmp/brick-battery-health.mjs
npx esbuild src/backup-v6.ts --bundle --platform=node --format=esm --outfile=/tmp/brick-backup-v6.mjs
npx esbuild src/backup-restore-v6.ts --bundle --platform=node --format=esm --outfile=/tmp/brick-backup-restore-v6.mjs
npx esbuild src/queue-v6.ts --bundle --platform=node --format=esm --outfile=/tmp/brick-queue-v6.mjs
npx esbuild src/device-json-security.ts --bundle --platform=node --format=esm --outfile=/tmp/brick-device-json-security.mjs
npx esbuild src/phase8-device-identity.ts --bundle --platform=node --format=esm --outfile=/tmp/brick-phase8-device-identity.mjs
node scripts/test-phase6-access.mjs file:///tmp/brick-access-auth.mjs
node scripts/test-phase6-ops.mjs /tmp/brick-battery-health.mjs /tmp/brick-backup-v6.mjs
node scripts/test-backup-restore.mjs /tmp/brick-backup-restore-v6.mjs
node scripts/test-dlq-recovery.mjs /tmp/brick-queue-v6.mjs
node scripts/test-public-pairing-limits.mjs /tmp/brick-device-json-security.mjs
node scripts/test-phase8-historical-identity.mjs /tmp/brick-phase8-device-identity.mjs

# A revoked device must be routed read-only before any Phase 6 parent mutation handler.
node --input-type=module <<'NODE'
import fs from 'node:fs';
const src = fs.readFileSync('src/worker-v6.ts', 'utf8');
const lifecycle = src.indexOf('const life = await lifecycle(env, deviceId);');
const revoked = src.indexOf('if (life.revoked_at !== null) return archivedRead(req, env, deviceId, suffix);');
const locationMutation = src.indexOf('if (suffix === "/location-control" && req.method === "POST")');
const anchorMutation = src.indexOf('if (suffix === "/ble-anchors" && req.method === "POST")');
if (!(lifecycle >= 0 && revoked > lifecycle && locationMutation > revoked && anchorMutation > revoked)) {
  throw new Error('revocation guard must precede Phase 6 parent mutations');
}
NODE

# Retain the full Phase 5 semantic/security regression surface.
node --check scripts/test-phase5-fusion-protocol.mjs
node --check scripts/test-phase5-witness.mjs
node --check scripts/test-phase5-ground.mjs
node --check scripts/test-phase5-places.mjs
node --check scripts/test-phase5-smoothing.mjs
node --check scripts/test-phase5-external-constraints.mjs
node --check scripts/test-phase5-current-refinement.mjs
node --check scripts/test-phase5-parent-live.mjs
node --check scripts/test-phase5-live-state-order.mjs
node --check scripts/test-phase5-coarse-network.mjs
node --check scripts/test-phase5-refined-history.mjs
npx esbuild src/protocol.ts --bundle --platform=node --format=esm --outfile=/tmp/brick-protocol.mjs
npx esbuild src/phase5-evidence.ts --bundle --platform=node --format=esm --outfile=/tmp/brick-phase5-evidence.mjs
npx esbuild src/ground-receiver.ts --bundle --platform=node --format=esm --outfile=/tmp/brick-ground-receiver.mjs
npx esbuild src/phase5-places.ts --bundle --platform=node --format=esm --outfile=/tmp/brick-phase5-places.mjs
npx esbuild src/phase5-smoothing.ts --bundle --platform=node --format=esm --outfile=/tmp/brick-phase5-smoothing.mjs
npx esbuild src/phase5-external-constraints.ts --bundle --platform=node --format=esm --outfile=/tmp/brick-phase5-external-constraints.mjs
npx esbuild src/phase5-current-refinement.ts --bundle --platform=node --format=esm --outfile=/tmp/brick-phase5-current-refinement.mjs
npx esbuild src/live-state-order.ts --bundle --platform=node --format=esm --outfile=/tmp/brick-live-state-order.mjs
npx esbuild src/parent-v6.ts --bundle --platform=node --format=esm --outfile=/tmp/brick-parent-v6.mjs
npx esbuild src/phase5-coarse-network.ts --bundle --platform=node --format=esm --outfile=/tmp/brick-phase5-coarse-network.mjs
npx esbuild src/phase5-refined-history.ts --bundle --platform=node --format=esm --outfile=/tmp/brick-phase5-refined-history.mjs
node scripts/test-phase5-fusion-protocol.mjs /tmp/brick-protocol.mjs
node scripts/test-phase5-witness.mjs /tmp/brick-phase5-evidence.mjs
node scripts/test-phase5-ground.mjs /tmp/brick-ground-receiver.mjs /tmp/brick-phase5-evidence.mjs
node scripts/test-phase5-places.mjs /tmp/brick-phase5-places.mjs
node scripts/test-phase5-smoothing.mjs /tmp/brick-phase5-smoothing.mjs
node scripts/test-phase5-external-constraints.mjs /tmp/brick-phase5-external-constraints.mjs
node scripts/test-phase5-current-refinement.mjs /tmp/brick-phase5-current-refinement.mjs
node scripts/test-phase5-live-state-order.mjs /tmp/brick-live-state-order.mjs
node scripts/test-phase5-parent-live.mjs /tmp/brick-parent-v6.mjs
node scripts/test-phase5-coarse-network.mjs /tmp/brick-phase5-coarse-network.mjs
node scripts/test-phase5-refined-history.mjs /tmp/brick-phase5-refined-history.mjs

# Retain Phase 4 / 3 / 2 Cloud regressions and route constraints.
node --check scripts/test-phase4-provider-contract.mjs
npx esbuild src/evidence-protocol.ts --bundle --platform=node --format=esm --outfile=/tmp/brick-evidence-protocol.mjs
node scripts/test-phase4-provider-contract.mjs /tmp/brick-evidence-protocol.mjs
npx esbuild src/route-graph-data.ts --bundle --platform=node --format=esm --outfile=/tmp/brick-route-graph-data.mjs
npx esbuild src/route-graph.ts --bundle --platform=node --format=esm --outfile=/tmp/brick-route-graph.mjs
node scripts/test-phase3-route-graph.mjs /tmp/brick-route-graph-data.mjs /tmp/brick-route-graph.mjs
npx esbuild src/evidence-ingest.ts --bundle --platform=node --format=esm --outfile=/tmp/brick-evidence-ingest.mjs
node scripts/test-phase2-evidence.mjs /tmp/brick-evidence-protocol.mjs /tmp/brick-evidence-ingest.mjs
node scripts/test-phase2-evidence-link-integrity.mjs /tmp/brick-evidence-ingest.mjs
npx esbuild src/evidence-route.ts --bundle --platform=node --format=esm --outfile=/tmp/brick-evidence-route.mjs
node scripts/test-phase2-evidence-route.mjs /tmp/brick-evidence-route.mjs
npx esbuild src/route-constraint.ts --bundle --platform=node --format=esm --outfile=/tmp/brick-route-constraint.mjs
node scripts/test-route-constraint.mjs /tmp/brick-route-constraint.mjs

# Privacy/source audit remains a hard gate.
node scripts/audit-privacy.mjs
