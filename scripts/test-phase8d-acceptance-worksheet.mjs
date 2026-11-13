import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture, syntheticCriteria} from './phase8d-release-fixture.mjs';
import {verifyPhase8dAcceptance} from './verify-phase8d-release-acceptance.mjs';
import {LEDGER_PATH, hash} from './phase8d-requirements-ledger.mjs';
const before = hash(fs.readFileSync(LEDGER_PATH));
const cases = [
  ['criteria missing', r => delete r.criteria],
  ['criteria all unreviewed', r => r.criteria = Object.fromEntries(['C1','C2','C3','C4'].map(k => [k,'NOT REVIEWED']))],
  ['one criterion missing', r => delete r.criteria.C4],
  ['invented criterion', r => r.criteria.C5 = structuredClone(r.criteria.C1)],
  ['criteria array', r => r.criteria = Object.values(r.criteria)],
  ['criterion array', r => r.criteria.C1 = []],
  ['criterion failed', r => r.criteria.C2.status = 'FAIL'],
  ['criterion pending', r => r.criteria.C3.status = 'PENDING'],
  ['unrecognized status', r => r.criteria.C1.status = 'ACCEPTED'],
  ['unreviewed rationale', r => r.criteria.C1.rationale = 'NOT REVIEWED but padded to appear complete'],
  ['short rationale', r => r.criteria.C1.rationale = 'tested'],
  ['missing proof refs', r => delete r.criteria.C1.evidenceRefs],
  ['empty proof refs', r => r.criteria.C1.evidenceRefs = []],
  ['out of range proof', r => r.criteria.C1.evidenceRefs = [1]],
  ['negative proof', r => r.criteria.C1.evidenceRefs = [-1]],
  ['fractional proof', r => r.criteria.C1.evidenceRefs = [0.1]],
  ['string proof', r => r.criteria.C1.evidenceRefs = ['0']],
  ['duplicate proof', r => r.criteria.C1.evidenceRefs = [0,0]],
  ['unbounded proof refs', r => r.criteria.C1.evidenceRefs = Array(33).fill(0)],
  ['scope-only PASS', r => r.evidence[0].kind = 'SCOPE_REVIEW'],
  ['not applicable without scope', r => r.criteria.C1.status = 'NOT_APPLICABLE'],
  ['all not applicable', r => {r.criteria=syntheticCriteria('NOT_APPLICABLE');r.evidence[0].kind='SCOPE_REVIEW';}],
  ['mandatory criterion unsupported', r => r.criteria.C1.status = 'VERIFIED_UNSUPPORTED'],
  ['accepted criterion deferred', r => r.criteria.C1.status = 'DEFERRED'],
  ['unexpected criterion fields', r => r.criteria.C1.waived = true],
  ['reviewer is implementer', r => r.review.reviewer = r.implementationOwner],
  ['reviewer is tester', r => r.review.reviewer = r.testOwner],
  ['normalized reviewer same', r => r.review.reviewer = '  SYNTHETIC\tIMPLEMENTER  '],
  ['unicode-width reviewer same', r => r.review.reviewer = 'Ｓｙｎｔｈｅｔｉｃ implementer'],
  ['review source absent', r => delete r.review.sourceSha],
  ['review source stale', r => r.review.sourceSha = 'b'.repeat(40)],
  ['impossible review calendar', r => r.review.reviewedAt = '2026-02-31T00:00:00Z']
];
let passed=0;
async function rejected(label, setup) {
  const f=fixture();setup(f);let requests=0;
  f.ctx.fetchImpl=async()=>{requests++;throw Error('invalid worksheet must reject before network');};
  await assert.rejects(verifyPhase8dAcceptance(f.record,f.ctx), /Phase8D release refused/, label);
  assert.equal(requests,0,label);passed++;console.log('PASS '+label);
}
for(const [label, mutate] of cases) await rejected(label, f=>mutate(f.ledger.requirements[0]));
function deferred(f) {
  const r=f.ledger.requirements.find(x=>x.id==='QA-001');
  Object.assign(r,{scope:'CROSS_PHASE',disposition:'DEFERRED',targetPhase:'9',blockingPhase8D:false,status:'UNIT/CI VERIFIED',deferredReason:'Synthetic plan-backed device-only qualification belongs in Phase9',criteria:syntheticCriteria('DEFERRED','9')});
  r.evidence[0].kind='SCOPE_REVIEW';f.record.requirements.deferredCrossPhase=1;return r;
}
for(const [label,mutate] of [
  ['deferral still claims PASS',r=>r.criteria.C1.status='PASS'],
  ['criterion targets other phase',r=>r.criteria.C1.targetPhase='8F'],
  ['criterion target missing',r=>delete r.criteria.C1.targetPhase],
  ['deferred criterion no plan proof',r=>{r.evidence.push({...r.evidence[0],kind:'SOURCE_CI'});r.criteria.C1.evidenceRefs=[1];}]
]) await rejected(label,f=>mutate(deferred(f)));
await rejected('optional unsupported still claims PASS',f=>{const r=f.ledger.requirements.find(x=>x.classification==='OPTIONAL-IF-SUPPORTED');r.status='VERIFIED UNSUPPORTED';r.reason='Synthetic explicit optional capability proof for negative test';r.evidence[0].kind='UNSUPPORTED_PROOF';});
const good=fixture();assert.equal((await verifyPhase8dAcceptance(good.record,good.ctx)).verified,true);passed++;
const na=fixture(),r=na.ledger.requirements[0];r.evidence.push({...r.evidence[0],kind:'SCOPE_REVIEW'});r.criteria.C3={status:'NOT_APPLICABLE',rationale:'Synthetic reviewed scope rationale for just this criterion',evidenceRefs:[1]};assert.equal((await verifyPhase8dAcceptance(na.record,na.ctx)).verified,true);passed++;
const future=fixture();deferred(future);assert.equal((await verifyPhase8dAcceptance(future.record,future.ctx)).requirements.deferredCrossPhase,1);passed++;
const optional=fixture(),o=optional.ledger.requirements.find(x=>x.classification==='OPTIONAL-IF-SUPPORTED');o.status='VERIFIED UNSUPPORTED';o.reason='Synthetic explicit optional capability proof for positive contract test';o.evidence[0].kind='UNSUPPORTED_PROOF';o.criteria=syntheticCriteria('VERIFIED_UNSUPPORTED');assert.equal((await verifyPhase8dAcceptance(optional.record,optional.ctx)).verified,true);passed++;
const ms=fixture();ms.ledger.requirements[0].review.reviewedAt='2026-11-05T00:00:00.123Z';assert.equal((await verifyPhase8dAcceptance(ms.record,ms.ctx)).verified,true);passed++;
assert.equal(hash(fs.readFileSync(LEDGER_PATH)),before);
console.log(JSON.stringify({suite:'acceptance-worksheet',passed,failed:0,realLedgerUnchanged:true,scope:'synthetic release records only; normalized reviewer labels are not authenticated identities and evidence hashes do not establish truth or define C1-C4 semantics'}));
