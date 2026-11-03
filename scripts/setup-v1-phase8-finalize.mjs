import fs from 'node:fs/promises';

const CURRENT_APP_VERSION = '0.8.0-phase8-beta1-test';
const statePath = 'setup-state.json';

const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
if (state.v1ProgramPhase !== 8 || state.schemaVersion !== 15 || state.workerEntry !== 'src/worker-v9.ts') {
  throw new Error('Refusing to finalize release metadata for a non-Phase-8 deployment state.');
}

// setup-v1-phase6.mjs is intentionally retained as the mature resource/migration provisioner.
// Its historical release label is not authoritative for Phase 8; the Worker template and this
// finalization step are the Phase 8 release metadata source of truth.
state.currentRelease = CURRENT_APP_VERSION;
state.releaseMetadataFinalizedBy = 'setup-v1-phase8-finalize.mjs';
await fs.writeFile(statePath, JSON.stringify(state, null, 2));

console.log(`Phase 8 release metadata finalized: ${CURRENT_APP_VERSION}`);
