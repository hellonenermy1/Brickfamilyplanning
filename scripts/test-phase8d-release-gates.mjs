#!/usr/bin/env node
// 8D.19 SOURCE-only release guard audit: do not deploy or access Cloudflare.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const deploy=readFileSync(".github/workflows/deploy-brick.yml","utf8");
const audit=readFileSync(".github/workflows/v1-phase8d-backend-audit-ci.yml","utf8");
const prod=JSON.parse(readFileSync("wrangler.template.jsonc","utf8"));
const dev=JSON.parse(readFileSync("wrangler.development.template.jsonc","utf8"));
const setup=readFileSync("scripts/setup-v1-phase6.mjs","utf8");
const entries=[["deploy-brick",deploy],["phase8d-ci",audit]];
for(const [name,text] of entries){
 const uses=[...text.matchAll(/^\s+-\s+uses:\s*(\S+)/gm)].map(x=>x[1]);
 assert(uses.length>=2,name+" unexpectedly empty checkout/action set");
 for(const action of uses){
  if(action.startsWith("./"))continue;
  assert.match(action,/@[0-9a-f]{40}$/i,name+" action not pinned to immutable commit: "+action.split("@")[0]);
 }
 assert.match(text,/permissions:\n  contents: read/,"workflow must be read-only at GitHub repo scope");
 assert.doesNotMatch(text,/pull_request_target\s*:/,"high-risk privileged pull_request_target not allowed");
}
assert.match(deploy,/test "\$GITHUB_REF_NAME" = "v1-p8d-accepted-backend"/);
assert.match(deploy,/PHASE8D_FINAL_ACCEPTANCE\.md/);
assert.match(deploy,/FINAL STATUS: PASS/);
assert.match(deploy,/test "\$\(git rev-parse HEAD\)" = "\$GITHUB_SHA"/);
assert.match(deploy,/npm ci --no-audit --no-fund/);
assert.match(deploy,/npm audit --audit-level=high/);
assert.match(deploy,/npx wrangler deploy --strict/);
assert.match(deploy,/scripts\/verify-cloudflare-deployment\.mjs/);
assert.match(deploy,/brick-git-\$\{GITHUB_SHA:0:12\}/);
assert.match(deploy,/workflow_dispatch:/);
assert.doesNotMatch(deploy,/^  push:/m,"production deploy cannot trigger from ordinary pushes");
assert.equal(prod.main,"src/worker-p8b.ts");
assert.equal(dev.main,"src/worker-v10.ts");
assert.equal(prod.vars.APP_ENV,"production");
assert.equal(dev.vars.APP_ENV,"development");
assert.match(setup,/mergeR2LifecycleRules/,"lifecycle setup cannot blindly replace unrelated rules");
assert.match(audit,/test-phase8d-atomic-backup\.mjs/);
assert.match(audit,/test-phase8d-location-control-revoke-race\.mjs/);
assert.match(audit,/test-phase8d-parent-read-rate\.mjs/);
console.log("PASS 8D.19: commit-pinned actions, separate accepted branch/final PASS gate, source SHA, locked deps, migration/deploy checks, R2 merge and key regressions; live rollback and branch protections still OPEN");
