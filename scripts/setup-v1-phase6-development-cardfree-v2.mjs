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

// Older development provisioners applied schema/002 but did not add the Phase 2 summary columns
// to devices. Repair them idempotently in place before any follow-up beta verification. This does
// not reset devices, pairing, sessions, history, or parent data.
await run(node, ['scripts/ensure-development-legacy-columns.mjs']);

const config = await fs.readFile('wrangler.development.jsonc', 'utf8');
if (config.includes('r2_buckets') || config.includes('"queues"') || config.includes('CF_ACCESS_') || config.includes('"triggers"')) {
  throw new Error('Refusing Phase 6C v2 migration: generated development config is not fully card-free.');
}

// Post-base migrations are idempotent and upgrade the existing beta DB in place without resetting
// paired phones, parent sessions, or prior evidence. Phase 8 identity uniqueness deliberately fails
// if historical duplicate device keys exist; silently choosing one would be unsafe.
for (const migration of [
  'schema/014_phase6c_virtual_history.sql',
  'schema/015_phase8_device_identity.sql'
]) {
  await run(npx, [
    'wrangler', 'd1', 'execute', 'brick-family-v1-dev', '--remote',
    '--file', migration, '--yes',
    '--config', 'wrangler.development.jsonc'
  ]);
}

console.log('Phase 6C virtual-history + Phase 8 device-identity migrations applied.');

// Deployment is not considered healthy merely because the login page responds. Create an
// ephemeral hashed parent session and exercise the same authenticated APIs the browser uses.
// If an active paired phone exists, also require its state endpoint and WebSocket upgrade.
await run(node, ['scripts/verify-development-parent-live.mjs']);
