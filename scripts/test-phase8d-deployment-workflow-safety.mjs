import assert from "node:assert/strict";
import fs from "node:fs";
const dev=fs.readFileSync(".github/workflows/deploy-brick-development.yml","utf8");
const prod=fs.readFileSync(".github/workflows/deploy-brick.yml","utf8");
const setup=fs.readFileSync("scripts/setup-v1-phase6-development-free.mjs","utf8");
const afterOn=(txt)=>txt.slice(txt.indexOf("\non:"),txt.indexOf("\npermissions:"));
const dOn=afterOn(dev),pOn=afterOn(prod);
for(const [name,on] of [["development",dOn],["production",pOn]]){
 assert(on.includes("workflow_dispatch:"),name+" deployment cannot be explicitly dispatched");
 assert(!/^\s+(push|pull_request|schedule|workflow_run):/m.test(on),name+" accidentally auto-deploys Worker");
}
assert(dev.includes('test "$GITHUB_REF_NAME" = "v1-p8d-backend-deep-audit"'),"dev source wrong audit branch");
assert(!dev.includes('test "$GITHUB_REF_NAME" = "v1-p6c-parent-beta-cloud"'),"old Phase6C gate still active");
assert(dev.includes("CLOUDFLARE_ACCOUNT_ID"),"dev Cloudflare account ID not explicitly bound");
assert(dev.includes("BRICK_DEV_PARENT_ACCESS_TOKEN"),"no secret high-entropy dev auth");
assert(dev.includes("npm run setup:development"),"dev not using current card-free script");
assert(!dev.includes("npm run setup\n"),"dev would provision production");
assert(dev.includes("PARENT_GEOCODE_RATE")&&dev.includes("PARENT_COMMUTE_RATE"),"missing newer dev quotas");
assert(dev.includes('w.name!==\'brick-family-v1-dev\''),"dev post-deploy must fence production Worker");
assert(setup.includes("wrangler', 'deploy'")&&setup.includes("GENERATED_CONFIG"),"dev setup not isolated to generated config");
assert(setup.includes("devAccessToken")&&setup.includes("secret', 'put', 'DEV_PARENT_LOGIN_HASH'"),"dev PIN secret must be generated securely");
assert(prod.includes('test "$GITHUB_REF_NAME" = "v1-p8d-accepted-backend"'),"production accepted-branch gate removed");
assert(prod.includes("PHASE8D_FINAL_ACCEPTANCE.md")&&prod.includes("FINAL STATUS: PASS"),"prod deploy lacks final audit signoff");
assert(!prod.includes("BRICK_DEV_PARENT_ACCESS_TOKEN"),"prod mistakenly exposed dev credential");
const verifier=fs.readFileSync("scripts/verify-cloudflare-deployment.mjs","utf8");
assert(verifier.includes("requireAccessChallenge(parent,"),"production must require actual Access challenge, not generic redirect");
assert(verifier.includes("requireNoPublicLocalLogin(localLogin,"),"production local login path must not be public");
assert(verifier.includes("requireProtectedDenial(forged,"),"production must reject dev-forged header");
assert(!verifier.includes("requireAccessDenial("),"unsafe legacy 303 allowlist still present");

console.log("PASS P8D-042: manual-only dev and prod Workflows, current dev audited branch, high-entropy secret, new quotas, isolated D1, accepted production final-PASS gate retained");
