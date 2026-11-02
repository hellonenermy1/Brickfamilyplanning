import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      shell: process.platform === 'win32',
      env: { ...process.env },
      stdio: 'inherit'
    });
    p.on('error', reject);
    p.on('exit', code => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)));
  });
}

const node = process.execPath;
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

// Run the qualified card-free provisioner first. It creates/reuses D1, applies the base
// Phase 1-6 + card-free schemas, configures the reusable development parent PIN and generates the
// exact wrangler.development.jsonc with the real D1 UUID and map source.
await run(node, ['scripts/setup-v1-phase6-development-free.mjs']);

const config = await fs.readFile('wrangler.development.jsonc', 'utf8');
if (config.includes('r2_buckets') || config.includes('"queues"') || config.includes('CF_ACCESS_') || config.includes('"triggers"')) {
  throw new Error('Refusing Phase 6C v2 migration: generated development config is not fully card-free.');
}

// Schema 014 is intentionally idempotent. Apply it after the base provisioner so existing beta
// databases upgrade in place without resetting paired phones, parent sessions, or prior evidence.
await run(npx, [
  'wrangler', 'd1', 'execute', 'brick-family-v1-dev', '--remote',
  '--file', 'schema/014_phase6c_virtual_history.sql', '--yes',
  '--config', 'wrangler.development.jsonc'
]);

console.log('Phase 6C virtual-history migration applied: append-once D1 rows + synthesized history segments.');
