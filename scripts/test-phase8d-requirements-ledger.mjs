import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fixture} from './phase8d-release-fixture.mjs';
import {verifyPhase8dAcceptance} from './verify-phase8d-release-acceptance.mjs';
import {BASELINE_PATH,LEDGER_PATH,parseCsv,hash,verifyRequirementsForRelease} from './phase8d-requirements-ledger.mjs';
const cases=[
 ['no per-ID ledger',f=>delete f.record.requirements.ledger],
 ['document hash wrong',f=>f.record.requirements.ledger={path:LEDGER_PATH,sha256:'0'.repeat(64)}],
 ['path traversal',f=>f.record.requirements.ledger.path='audit/phase8d/release-evidence/../ledger.json'],
 ['outside release evidence',f=>f.record.requirements.ledger.path='audit/phase8d/operational.json'],
 ['wrong repository',f=>f.ledger.repository='other/repo'],
 ['wrong format',f=>f.ledger.format='other'],
 ['reviewed source stale',f=>f.ledger.reviewedSourceSha='b'.repeat(40)],
 ['canonical descriptor wrong',f=>f.ledger.baseline.sha256='0'.repeat(64)],
 ['canonical file changed',f=>{const read=f.ctx.readTrackedFile;f.ctx.readTrackedFile=async p=>p===BASELINE_PATH?Buffer.concat([f.baselineBytes,Buffer.from('x')]):read(p);}],
 ['one row missing',f=>f.ledger.requirements.pop()],
 ['one extra row',f=>f.ledger.requirements.push({...f.ledger.requirements[0]})],
 ['duplicate canonical ID',f=>f.ledger.requirements[1].id=f.ledger.requirements[0].id],
 ['invented ID',f=>f.ledger.requirements[0].id='FAKE-001'],
 ['class downgrade',f=>f.ledger.requirements[0].classification='FUTURE-INTERFACE'],
 ['wording digest changed',f=>f.ledger.requirements[0].requirementSha256='0'.repeat(64)],
 ['title changed',f=>f.ledger.requirements[0].title='different requirement'],
 ['profile changed',f=>f.ledger.requirements[0].profile='OPT'],
 ['scope unresolved',f=>f.ledger.requirements[0].scope='UNRECONCILED'],
 ['scope rationale absent',f=>delete f.ledger.requirements[0].scopeReason],
 ['phase mapping absent',f=>f.ledger.requirements[0].sections=[]],
 ['section invalid',f=>f.ledger.requirements[0].sections=['8D.20']],
 ['section duplicate',f=>f.ledger.requirements[0].sections=['8D.1','8D.1']],
 ['implementation owner absent',f=>f.ledger.requirements[0].implementationOwner=null],
 ['test owner placeholder',f=>f.ledger.requirements[0].testOwner='UNASSIGNED'],
 ['reviewer absent',f=>f.ledger.requirements[0].review=null],
 ['review date invalid',f=>f.ledger.requirements[0].review.reviewedAt='later'],
 ['CI-only status',f=>f.ledger.requirements[0].status='UNIT/CI VERIFIED'],
 ['open status',f=>f.ledger.requirements[0].status='OPEN BLOCKER'],
 ['mandatory unsupported',f=>{const r=f.ledger.requirements[0];r.status='VERIFIED UNSUPPORTED';r.reason='A fabricated exclusion must not release a mandatory item';}],
 ['optional unsupported no reason',f=>{f.ledger.requirements.find(r=>r.classification==='OPTIONAL-IF-SUPPORTED').status='VERIFIED UNSUPPORTED';}],
 ['optional unsupported no proof',f=>{const r=f.ledger.requirements.find(r=>r.classification==='OPTIONAL-IF-SUPPORTED');r.status='VERIFIED UNSUPPORTED';r.reason='Synthetic capability review says this optional feature unavailable';}],
 ['forbidden no prohibition proof',f=>{f.ledger.requirements.find(r=>r.classification==='FORBIDDEN').evidence[0].kind='SOURCE_CI';}],
 ['forbidden unsupported',f=>{const r=f.ledger.requirements.find(r=>r.classification==='FORBIDDEN');r.status='VERIFIED UNSUPPORTED';r.reason='A prohibition cannot be waived as unsupported';}],
 ['future interface unreviewed',f=>{f.ledger.requirements.find(r=>r.classification==='FUTURE-INTERFACE').evidence[0].kind='SOURCE_CI';}],
 ['cross-phase lacks review',f=>{const r=f.ledger.requirements[0];r.scope='CROSS_PHASE';r.disposition='CARRIED_FORWARD';r.carriedFromPhase='8C';}],
 ['scope review lacks feature proof',f=>{const r=f.ledger.requirements[0];r.scope='CROSS_PHASE';r.disposition='CARRIED_FORWARD';r.carriedFromPhase='8C';r.evidence[0].kind='SCOPE_REVIEW';}],
 ['row evidence absent',f=>f.ledger.requirements[0].evidence=[]],
 ['row evidence hash wrong',f=>f.ledger.requirements[0].evidence[0].sha256='0'.repeat(64)],
 ['candidate not proof',f=>f.ledger.requirements[0].evidence[0].kind='CANDIDATE'],
 ['row evidence traversal',f=>f.ledger.requirements[0].evidence[0].path='audit/phase8d/../../file'],
 ['self-attestation',f=>f.ledger.requirements[0].evidence[0].path=LEDGER_PATH],
 ['verdict not independent proof',f=>f.ledger.requirements[0].evidence[0].path='audit/phase8d/PHASE8D_FINAL_ACCEPTANCE.md'],
 ['proof not tracked/readable',f=>f.ctx.readTrackedFile=async()=>{throw Error('not tracked regular file');}]
];
let checks=0;
for(const [label,change] of cases){const f=fixture();change(f);let requests=0;f.ctx.fetchImpl=async()=>{requests++;throw Error('local invalid evidence must reject first');};await assert.rejects(verifyPhase8dAcceptance(f.record,f.ctx),/Phase8D release refused/,label);assert.equal(requests,0,label);checks++;}
const future=fixture(),q=future.ledger.requirements.find(r=>r.id==='QA-001');
q.scope='CROSS_PHASE';q.disposition='DEFERRED';q.targetPhase='9';q.blockingPhase8D=false;q.status='UNIT/CI VERIFIED';q.deferredReason='Synthetic reviewed plan defers actual OPPO endurance qualification to Phase9';q.evidence[0].kind='SCOPE_REVIEW';future.record.requirements.deferredCrossPhase=1;
assert.equal((await verifyPhase8dAcceptance(future.record,future.ctx)).requirements.deferredCrossPhase,1);checks++;
for(const [label,mutate]of [
 ['backend cannot defer as current scope',r=>r.scope='PHASE8D'],['arbitrary future phase',r=>r.targetPhase='10'],['deferred blocker',r=>r.blockingPhase8D=true],['defer open blocker',r=>r.status='OPEN BLOCKER'],['deferral no plan proof',r=>r.evidence[0].kind='SOURCE_CI'],['deferral no rationale',r=>delete r.deferredReason]
]){const f=fixture(),row=f.ledger.requirements.find(r=>r.id==='QA-001');Object.assign(row,structuredClone(q));f.record.requirements.deferredCrossPhase=1;mutate(row);let n=0;f.ctx.fetchImpl=async()=>{n++;throw Error('must refuse before network');};await assert.rejects(verifyPhase8dAcceptance(f.record,f.ctx),/release refused/,label);assert.equal(n,0);checks++;}
const hidden=fixture(),hiddenRow=hidden.ledger.requirements.find(r=>r.id==='QA-001');Object.assign(hiddenRow,structuredClone(q));await assert.rejects(verifyPhase8dAcceptance(hidden.record,hidden.ctx),/claimed totals/);checks++;
const good=fixture();assert.equal((await verifyPhase8dAcceptance(good.record,good.ctx)).requirements.total,525);checks++;
const optional=fixture(),row=optional.ledger.requirements.find(r=>r.classification==='OPTIONAL-IF-SUPPORTED');
row.status='VERIFIED UNSUPPORTED';row.reason='Synthetic reviewed optional capability unsupported with explicit test proof';row.evidence[0].kind='UNSUPPORTED_PROOF';
assert.equal((await verifyPhase8dAcceptance(optional.record,optional.ctx)).requirements.total,525);checks++;
const carried=fixture();carried.ledger.requirements[0].scope='CROSS_PHASE';carried.ledger.requirements[0].disposition='CARRIED_FORWARD';carried.ledger.requirements[0].carriedFromPhase='8C';carried.record.requirements.carriedForward=1;carried.ledger.requirements[0].evidence.push({...carried.ledger.requirements[0].evidence[0],kind:'SCOPE_REVIEW'});
assert.equal((await verifyPhase8dAcceptance(carried.record,carried.ctx)).verified,true);checks++;
assert.equal(good.reads.get(BASELINE_PATH),1);assert.equal(good.reads.get(LEDGER_PATH),1);assert.equal(good.reads.get('audit/phase8d/synthetic.json'),20); // one cached requirement read + existing19 section reads
checks++;
assert.deepEqual(parseCsv('id,text\r\n1,"a,b"\r\n2,"line1\nline2 ""quoted"""\r\n'),[['id','text'],['1','a,b'],['2','line1\nline2 "quoted"']]);checks++;
assert.throws(()=>parseCsv('id\n"unterminated'),/unterminated/);checks++;
assert.throws(()=>parseCsv('id\n"closed"garbage'),/closing quote/);checks++;
const draftRaw=fs.readFileSync(LEDGER_PATH),draft=JSON.parse(draftRaw);
// Exercise unreviewed variants without requiring the real inventory to stay unreviewed forever.
draft.reviewedSourceSha=null;const unreviewed=Buffer.from(JSON.stringify(draft));
const claim={total:525,unmapped:0,unverifiedApplicable:0,ledger:{path:LEDGER_PATH,sha256:hash(unreviewed)}};
await assert.rejects(verifyRequirementsForRelease(claim,{readTrackedFile:p=>p===LEDGER_PATH?unreviewed:fs.readFileSync(p)},'a'.repeat(40)),/reviewed source SHA mismatch/);checks++;
// Even an invented reviewed source cannot promote the real draft's unresolved owners/scope to PASS.
draft.reviewedSourceSha='a'.repeat(40);draft.requirements[0].implementationOwner=null;const forged=Buffer.from(JSON.stringify(draft));claim.ledger.sha256=hash(forged);
await assert.rejects(verifyRequirementsForRelease(claim,{readTrackedFile:p=>p===LEDGER_PATH?forged:fs.readFileSync(p)},draft.reviewedSourceSha),/owner unassigned/);checks++;
const reinitialize=spawnSync(process.execPath,['scripts/audit-phase8d-requirements.mjs','--initialize'],{encoding:'utf8'});
assert.notEqual(reinitialize.status,0);assert.match(reinitialize.stderr,/existing ledger will not be overwritten/);assert.equal(hash(fs.readFileSync(LEDGER_PATH)),hash(draftRaw));checks++;
console.log('PASS P8D-067 '+checks+' per-ID acceptance cases: exact canonical525, owners/reviews/evidence/classes/scope, optional/cross-phase/prohibition rules, missing/tampered/circular proof rejected before network; synthetic only');
