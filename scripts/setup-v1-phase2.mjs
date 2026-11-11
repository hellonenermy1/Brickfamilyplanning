import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

const TEMPLATE_PATH = 'wrangler.template.jsonc';
const GENERATED_CONFIG = 'wrangler.jsonc';
const EVIDENCE_SCHEMA = 'schema/008_v1_phase2_evidence.sql';
const WORKER_V6 = '"main": "src/worker-v6.ts"';
const WORKER_V7 = '"main": "src/worker-v7.ts"';
const HISTORY_BUCKET = 'brick-family-v1-history';

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { shell: process.platform === 'win32', env: { ...process.env }, stdio: 'inherit' });
    p.on('error', reject);
    p.on('exit', code => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)));
  });
}

async function applyPhase2EvidenceRetention(state) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token || !state?.accountId) throw new Error('Phase 2 retention requires the same scoped Cloudflare token/account selected by setup.mjs.');
  const day = 86_400;
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${state.accountId}/r2/buckets/${HISTORY_BUCKET}/lifecycle`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ rules: [
      { id: 'brick-raw-history-30d', enabled: true, conditions: { prefix: 'history/raw/' }, deleteObjectsTransition: { condition: { type: 'Age', maxAge: 30 * day } } },
      { id: 'brick-trusted-history-90d', enabled: true, conditions: { prefix: 'history/trusted/' }, deleteObjectsTransition: { condition: { type: 'Age', maxAge: 90 * day } } },
      { id: 'brick-raw-evidence-30d', enabled: true, conditions: { prefix: 'evidence/raw/' }, deleteObjectsTransition: { condition: { type: 'Age', maxAge: 30 * day } } },
      { id: 'brick-abort-multipart-7d', enabled: true, conditions: { prefix: '' }, abortMultipartUploadsTransition: { condition: { type: 'Age', maxAge: 7 * day } } }
    ] })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    throw new Error(`Could not apply Phase 2 raw-evidence retention: ${JSON.stringify(body.errors || body)}`);
  }
}

// setup.mjs is the already-audited resource/Access provisioning path. Phase 2 must not briefly expose
// worker-v7 before schema 008 exists, so bootstrap/provision with worker-v6, restore the canonical
// template immediately, migrate D1, then switch the generated config to worker-v7 and deploy once.
const originalTemplate = await fs.readFile(TEMPLATE_PATH, 'utf8');
if (!originalTemplate.includes(WORKER_V7)) throw new Error('Phase 2 requires wrangler.template.jsonc to target worker-v7.');
const bootstrapTemplate = originalTemplate.replace(WORKER_V7, WORKER_V6);
if (bootstrapTemplate === originalTemplate) throw new Error('Could not prepare Phase 2 worker-v6 bootstrap template.');

await fs.writeFile(TEMPLATE_PATH, bootstrapTemplate);
try {
  await import('./setup.mjs');
} finally {
  await fs.writeFile(TEMPLATE_PATH, originalTemplate);
}

console.log('\n[Phase 2] Applying V1 evidence/data-foundation migration before worker-v7 activation…');
await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
  'wrangler', 'd1', 'execute', 'brick-family-v1', '--remote',
  '--file', EVIDENCE_SCHEMA, '--yes', '--config', GENERATED_CONFIG
]);

const generated = await fs.readFile(GENERATED_CONFIG, 'utf8');
if (!generated.includes(WORKER_V6)) throw new Error('Expected Phase 6 bootstrap worker in generated wrangler config.');
const phase2Config = generated.replace(WORKER_V6, WORKER_V7);
if (!phase2Config.includes(WORKER_V7)) throw new Error('Could not activate worker-v7 in generated wrangler config.');
await fs.writeFile(GENERATED_CONFIG, phase2Config);

const state = JSON.parse(await fs.readFile('setup-state.json', 'utf8'));
console.log('[Phase 2] Applying bounded raw-evidence R2 retention…');
await applyPhase2EvidenceRetention(state);

console.log('[Phase 2] Deploying worker-v7 only after schema and retention are ready…');
await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', 'deploy', '--config', GENERATED_CONFIG]);

state.v1ProgramPhase = 2;
state.v1Phase2EvidenceSchema = EVIDENCE_SCHEMA;
state.v1Phase2EvidenceProtocol = 1;
state.retention = { ...(state.retention || {}), rawEvidenceDays: 30 };
state.configuredAt = new Date().toISOString();
await fs.writeFile('setup-state.json', JSON.stringify(state, null, 2));

console.log('Brick V1 Phase 2 evidence/data foundation is provisioned. Release qualification remains unchanged.');
