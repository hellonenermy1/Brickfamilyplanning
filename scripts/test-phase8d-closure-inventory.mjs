import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './phase8d-release-fixture.mjs';
import {BASELINE_PATH,LEDGER_PATH,hash} from './phase8d-requirements-ledger.mjs';
import {closureInventory} from './phase8d-closure-inventory.mjs';
const baselineBytes=fs.readFileSync(BASELINE_PATH),ledgerBytes=fs.readFileSync(LEDGER_PATH),sourceSha='a'.repeat(40),input={baselineBytes,ledgerBytes,sourceSha};
let passed=0;
const real=closureInventory(input),draft=JSON.parse(ledgerBytes);
assert.equal(real.summary.total,525);assert.equal(real.requirements.length,525);assert.equal(new Set(real.requirements.map(r=>r.id)).size,525);passed++;
assert.equal(real.summary.phase8dScope+real.summary.crossPhaseScope,525);assert.deepEqual(real.requirements.map(r=>r.id),draft.requirements.map(r=>r.id));passed++;
for(let i=0;i<525;i++)for(const key of ['criteria','evidence','severity','blockerReason','remediation'])assert.deepEqual(real.requirements[i][key],draft.requirements[i][key]);passed++;
assert.equal(real.remainingProductTestCount,null);assert.equal(real.reviewedSourceSha,draft.reviewedSourceSha);assert.equal(real.ledgerSha256,hash(ledgerBytes));assert.equal('verified' in real,false);passed++;
assert.deepEqual(closureInventory(input),real);assert.equal(hash(fs.readFileSync(LEDGER_PATH)),hash(ledgerBytes));passed++;
const f=fixture(),accepted=closureInventory({...input,ledgerBytes:Buffer.from(JSON.stringify(f.ledger))});assert.equal(accepted.summary.rowsWithWorksheetGaps,0);assert.equal(accepted.summary.criteriaSlotsWithGaps,0);assert.equal(accepted.remainingProductTestCount,null);passed++;
f.ledger.requirements[0].criteria.C4.status='FAIL';const failed=closureInventory({...input,ledgerBytes:Buffer.from(JSON.stringify(f.ledger))});assert.equal(failed.summary.criteriaSlotsWithGaps,1);assert.deepEqual(failed.requirements[0].criterionGaps.C4,['NONTERMINAL']);passed++;
f.ledger.requirements[0].criteria=Object.fromEntries(['C1','C2','C3','C4'].map(k=>[k,'NOT REVIEWED']));const missing=closureInventory({...input,ledgerBytes:Buffer.from(JSON.stringify(f.ledger))});assert.equal(missing.summary.criteriaSlotsWithGaps,4);assert.deepEqual(missing.requirements[0].criterionGaps.C1,['UNREVIEWED']);passed++;
for(const [name,mutate] of [
 ['source absent',i=>delete i.sourceSha],['source invalid',i=>i.sourceSha='latest'],['altered baseline',i=>i.baselineBytes=Buffer.concat([baselineBytes,Buffer.from('x')])],
 ['missing row',i=>{const l=JSON.parse(ledgerBytes);l.requirements.pop();i.ledgerBytes=Buffer.from(JSON.stringify(l));}],
 ['duplicate row',i=>{const l=JSON.parse(ledgerBytes);l.requirements[1]=l.requirements[0];i.ledgerBytes=Buffer.from(JSON.stringify(l));}],
 ['class drift',i=>{const l=JSON.parse(ledgerBytes);l.requirements[0].classification='FORBIDDEN';i.ledgerBytes=Buffer.from(JSON.stringify(l));}]
]){const i={...input};mutate(i);assert.throws(()=>closureInventory(i),undefined,name);passed++;}
console.log(JSON.stringify({suite:'closure-inventory',passed,failed:0,scope:'deterministic canonical worksheet inventory; no feature/test-total/acceptance or owner claim'}));
