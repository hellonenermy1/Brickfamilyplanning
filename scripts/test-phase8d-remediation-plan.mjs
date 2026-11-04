import assert from "node:assert/strict";
import {planFromAudit} from "./phase8d-remediation-plan.mjs";
const entries=[
 ["production_deployment","BLOCKED"],["development_deployment","BLOCKED"],
 ["production_bindings","DRIFT"],["development_isolation","DRIFT"],
 ["queue_dlq","DRIFT"],["history_lifecycle","BLOCKED"],["parent_access","BLOCKED"]
].map(([name,status])=>({name,status,detail:"synthetic proof only"}));
const report={checks:entries};
const p=planFromAudit(report);
assert.equal(p.phase8d,"IN_PROGRESS_NOT_PASS");
assert.equal(p.automaticMutationAllowed,false);
assert.equal(p.liveReadyForRelease,false);
assert.deepEqual(p.counts,{attested:0,drift:3,blocked:4});
assert.equal(p.steps.length,7);
assert.equal(p.steps.find(x=>x.id==="production_bindings").priority,"P1");
assert(p.steps.find(x=>x.id==="production_bindings").nextAction.includes("503"));
assert(p.steps.find(x=>x.id==="queue_dlq").nextAction.includes("brick-family-v1-dlq"));
assert(p.steps.find(x=>x.id==="parent_access").nextAction.includes("Access: Apps and Policies Read"));
assert(p.steps.find(x=>x.id==="history_lifecycle").nextAction.includes("Workers R2 Storage Read"));
assert.equal(p.steps[0].id,"history_lifecycle","Read authorization before mutations");
for(const bad of [
 {},{checks:entries.slice(1)}, {checks:[...entries.slice(0,6),entries[0]]},
 {checks:entries.map((x,i)=>i===6?{...x,status:"UNKNOWN"}:x)},
 {checks:[...entries.slice(0,6),{name:"unexpected",status:"DRIFT"}]}
])assert.throws(()=>planFromAudit(bad),"corrupted/partial audit wrongly accepted");
const allPass=planFromAudit({checks:entries.map(x=>({...x,status:"ATTESTED"}))});
assert.equal(allPass.counts.attested,7);
assert.equal(allPass.liveReadyForRelease,false,"seven metadata checks alone cannot authorize Phase 8D/production deploy");
assert.equal(allPass.automaticMutationAllowed,false);
console.log("PASS P8D-041: seven audited remediation paths, no unsafe automatic mutation, strict partial/duplicate/UNKNOWN rejection and live metadata not release approval");
