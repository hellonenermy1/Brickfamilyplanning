#!/usr/bin/env bash
set -euo pipefail
# Phase8D current contracts replace the stale legacy Phase6 runner; its source stays intact.
npm run typecheck
npx --no-install tsc -p tsconfig.web.json --noEmit
npm run build:parent-assets
node scripts/audit-phase8d-contract.mjs all
node scripts/test-beta-deployment.mjs
node scripts/test-phase8d-workerd-integration.mjs
node scripts/test-beta-workerd.mjs
node scripts/test-phase8d-full-store-recovery.mjs
node scripts/phase8d-current-private-key-scan.mjs
node scripts/test-phase8d-public-secret-surface.mjs
