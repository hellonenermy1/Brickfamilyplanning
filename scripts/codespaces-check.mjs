import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

function run(cmd, args = []) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || r.stderr || '').trim() };
}
function line(name, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

let good = true;
const nodeMajor = Number(process.versions.node.split('.')[0]);
good = line('Node.js 24+', nodeMajor >= 24, `v${process.versions.node}`) && good;

const npm = run('npm', ['--version']);
good = line('npm', npm.ok, npm.out) && good;

const docker = run('docker', ['version', '--format', '{{.Server.Version}}']);
good = line('Docker daemon', docker.ok, docker.ok ? docker.out : 'not available; rebuild the Codespace if the devcontainer was just added') && good;

const wrangler = run('npx', ['wrangler', '--version']);
good = line('Wrangler', wrangler.ok, wrangler.out.split('\n')[0] || '') && good;

const files = [
  'wrangler.template.jsonc',
  'scripts/setup.mjs',
  'scripts/install-private-map.mjs',
  'web/brick-map.ts'
];
for (const file of files) good = line(file, fs.existsSync(file)) && good;

const tokenPresent = Boolean(process.env.CLOUDFLARE_API_TOKEN);
line('CLOUDFLARE_API_TOKEN', tokenPresent, tokenPresent ? 'available as a Codespaces secret' : 'not set; setup will securely prompt for it instead');

console.log('\nBrick Codespaces status: ' + (good ? 'READY' : 'NEEDS ATTENTION'));
console.log('Next commands:');
console.log('  npm run setup');
console.log('  npm run map:install');
console.log('  npm run dev        # optional local Wrangler preview');
if (!good) process.exit(1);
