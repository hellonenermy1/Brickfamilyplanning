import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { shell: process.platform === 'win32', env: { ...process.env }, stdio: 'inherit' });
    p.on('error', reject);
    p.on('exit', code => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)));
  });
}

// Preserve the proven Phase 6 provisioning/setup path first. It creates/reconciles the Cloudflare
// resources, writes wrangler.jsonc with the exact account bindings, and obtains Access settings.
await import('./setup.mjs');

console.log('\n[Phase 2] Applying V1 evidence/data-foundation migration…');
await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
  'wrangler', 'd1', 'execute', 'brick-family-v1', '--remote',
  '--file', 'schema/008_v1_phase2_evidence.sql', '--yes', '--config', 'wrangler.jsonc'
]);

// setup.mjs performs its own final deploy before this new migration exists. Redeploy once after the
// evidence schema is present so the externally active Worker and its required tables converge before
// this wrapper reports success.
console.log('[Phase 2] Redeploying Worker after evidence schema convergence…');
await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', 'deploy', '--config', 'wrangler.jsonc']);

const state = JSON.parse(await fs.readFile('setup-state.json', 'utf8'));
state.v1ProgramPhase = 2;
state.v1Phase2EvidenceSchema = 'schema/008_v1_phase2_evidence.sql';
state.v1Phase2EvidenceProtocol = 1;
state.configuredAt = new Date().toISOString();
await fs.writeFile('setup-state.json', JSON.stringify(state, null, 2));

console.log('Brick V1 Phase 2 evidence/data foundation is provisioned. Release qualification remains unchanged.');
