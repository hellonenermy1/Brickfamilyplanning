import fs from 'node:fs';

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const entry = fs.readFileSync('scripts/setup.mjs', 'utf8');
const setup = fs.readFileSync('scripts/setup-v1-phase6.mjs', 'utf8');
const verifier = fs.readFileSync('scripts/verify-cloudflare-deployment.mjs', 'utf8');
const wrangler = fs.readFileSync('wrangler.template.jsonc', 'utf8');
const deployWorkflow = fs.readFileSync('.github/workflows/deploy-brick.yml', 'utf8');

requireCondition(pkg.scripts?.setup === 'node scripts/setup.mjs', 'npm setup must use the canonical setup entrypoint');
requireCondition(entry.includes("await import('./setup-v1-phase6.mjs')"), 'canonical setup must delegate to Phase 6 setup');
requireCondition(!fs.existsSync('scripts/setup-v1-phase2.mjs'), 'obsolete Phase 2 setup wrapper must not exist');
requireCondition(wrangler.includes('"main": "src/worker-v9.ts"'), 'production template must target worker-v9.ts');

const schemas = [
  'schema/001_init.sql',
  'schema/002_phase2_health.sql',
  'schema/003_phase4_safety.sql',
  'schema/004_phase5_operations.sql',
  'schema/007_phase5c_hardening.sql',
  'schema/008_v1_phase2_evidence.sql',
  'schema/009_v1_phase5_fusion.sql',
  'schema/010_phase5b_closure.sql',
  'schema/011_v1_phase6_location_control.sql'
];
for (const schema of schemas) requireCondition(setup.includes(`'${schema}'`), `Phase 6 setup is missing ${schema}`);

for (let i = 0; i < 9; i++) {
  requireCondition(setup.includes(`await applySchema(SCHEMAS[${i}]);`), `Phase 6 setup does not apply SCHEMAS[${i}]`);
}

const finalMigration = setup.indexOf('await applySchema(SCHEMAS[8]);');
const firstDeploy = setup.indexOf("['wrangler', 'deploy'");
const accessReconcile = setup.indexOf('const access = await ensureAccess(workerHost);');
const verifiedConfig = setup.indexOf("renderWrangler(template, d1Id, teamDomain, access.aud)");
const secondDeploy = setup.indexOf("['wrangler', 'deploy'", firstDeploy + 1);
requireCondition(finalMigration >= 0 && firstDeploy > finalMigration, 'worker-v9 must not activate before schema 011 is applied');
requireCondition(setup.indexOf("'phase6-bootstrap-not-valid'") >= 0 && setup.indexOf("'phase6-bootstrap-not-valid'") < firstDeploy,
  'first activation must use an invalid parent Access AUD');
requireCondition(accessReconcile > firstDeploy, 'Cloudflare Access must be reconciled after the exact workers.dev hostname is known');
requireCondition(verifiedConfig > accessReconcile, 'verified Access AUD must be written only after Access reconciliation');
requireCondition(secondDeploy > verifiedConfig, 'final worker deploy must use the verified Access configuration');

for (const marker of [
  "v1ProgramPhase: 6",
  "schemaVersion: 11",
  "workerEntry: 'src/worker-v9.ts'",
  "releaseState: 'candidate-not-real-device-qualified'",
  'sourceGitSha',
  'brick-raw-evidence-30d'
]) requireCondition(setup.includes(marker), `Phase 6 setup provenance/retention is missing ${marker}`);

for (const marker of [
  'const EXPECTED_V1_PROGRAM_PHASE = 6;',
  'const EXPECTED_SCHEMA_VERSION = 11;',
  "const EXPECTED_WORKER_ENTRY = 'src/worker-v9.ts';",
  "'schema/011_v1_phase6_location_control.sql'",
  "'device_location_control'",
  'state?.schemaVersion === EXPECTED_SCHEMA_VERSION',
  'state?.workerEntry === EXPECTED_WORKER_ENTRY',
  'Brick V1 Phase 6 deployment verified'
]) requireCondition(verifier.includes(marker), `post-deploy verifier is missing Phase 6 contract: ${marker}`);

for (const marker of [
  'name: Deploy Brick V1 Phase 6 Candidate',
  '\"main\": \"src/worker-v9.ts\"',
  "'schema/011_v1_phase6_location_control.sql'",
  'bash scripts/phase6-cloud-regression.sh',
  'run: npm run setup',
  's.schemaVersion !== 11',
  "s.workerEntry !== 'src/worker-v9.ts'"
]) requireCondition(deployWorkflow.includes(marker), `deployment workflow is missing Phase 6 gate: ${marker}`);

console.log('Phase 6 deployment contract passed: schema 001-011 precedes v9 activation, post-deploy verification is Phase 6 aware, and deployment provenance is enforced.');
