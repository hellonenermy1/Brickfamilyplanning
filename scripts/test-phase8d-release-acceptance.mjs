import assert from 'node:assert/strict';
import {fixture} from './phase8d-release-fixture.mjs';
import { verifyPhase8dAcceptance, requireFinalPassMarkdown } from './verify-phase8d-release-acceptance.mjs';
let checks=0;
const f=fixture();assert.equal((await verifyPhase8dAcceptance(f.record,f.ctx)).verified,true);checks++;
const cases=[
 ['actual requirement ledger absent',f=>delete f.record.requirements.ledger],
 ['wrong branch',f=>f.ctx.branch='v1-p8d-backend-deep-audit'],['wrong repository',f=>f.ctx.repository='other/repo'],
 ['not pass',f=>f.record.finalStatus='NOT PASS'],['bad SHA',f=>f.record.testedSourceSha='main'],
 ['not ancestor',f=>f.ctx.isAncestor=async()=>false],['code changed',f=>f.ctx.changedPaths=async()=>['src/index.ts']],
 ['operational audit JSON changed',f=>f.ctx.changedPaths=async()=>['audit/phase8d/PHASE8D_R2_LIFECYCLE_TARGET.json']],
 ['audit script changed',f=>f.ctx.changedPaths=async()=>['audit/phase8d/bypass.mjs']],
 ['P1 open',f=>f.record.unresolvedP1=1],['requirements gap',f=>f.record.requirements.unverifiedApplicable=1],
 ['section absent',f=>f.record.sections.pop()],['duplicate section',f=>f.record.sections[1].id='8D.1'],
 ['section blocked',f=>f.record.sections[0].status='BLOCKED'],['unsupported reason absent',f=>f.record.sections[0].status='VERIFIED_UNSUPPORTED'],
 ['path traversal',f=>f.record.sections[0].evidence[0].path='audit/phase8d/../../secret'],
 ['hash mismatch',f=>f.record.sections[0].evidence[0].sha256='0'.repeat(64)],
 ['CI queued',f=>f.run.status='queued'],['CI failed',f=>f.run.conclusion='failure'],
 ['CI stale attempt',f=>f.run.run_attempt=3],['CI wrong source',f=>f.run.head_sha='b'.repeat(40)],
 ['CI wrong workflow',f=>f.run.path='.github/workflows/other.yml'],['CI fork',f=>f.run.head_repository.full_name='other/repo'],
 ['job failed',f=>f.jobs[0].conclusion='failure'],['duplicate job ID',f=>f.jobs[1].id=f.jobs[0].id],['duplicate job name',f=>f.jobs[1].name=f.jobs[0].name],
 ['job skipped',f=>f.jobs[0].conclusion='skipped'],['required job absent',f=>f.jobs.pop()],
 ['missing token',f=>f.ctx.githubToken=''],['HTTP denied',f=>f.ctx.fetchImpl=async()=>new Response('',{status:403})],
 ['incomplete jobs',f=>f.ctx.fetchImpl=async url=>Response.json(url.includes('/attempts/')?{jobs:[],total_count:3}:f.run)]
];
for(const [name,change]of cases){const f=fixture();change(f);await assert.rejects(verifyPhase8dAcceptance(f.record,f.ctx),/Phase8D release refused/,name);checks++;}
for(const bad of ['FINAL STATUS: PASS (pending)','Example: FINAL STATUS: PASS\nFINAL STATUS: NOT PASS','```text\nFINAL STATUS: PASS\n```','> FINAL STATUS: PASS','FINAL STATUS: PASS\nFINAL STATUS: NOT PASS']){assert.throws(()=>requireFinalPassMarkdown(bad),/release refused/);checks++;}
const paged=fixture();let pages=0;
paged.ctx.fetchImpl=async url=>{if(!url.includes('/attempts/'))return Response.json(paged.run);pages++;return Response.json({jobs:pages===1?paged.jobs.slice(0,1):paged.jobs.slice(1),total_count:3});};
assert.equal((await verifyPhase8dAcceptance(paged.record,paged.ctx)).verified,true);assert.equal(pages,2);checks++;
const altered=fixture();let requests=0;altered.ctx.changedPaths=async()=>['src/index.ts'];altered.ctx.fetchImpl=async()=>{requests++;throw Error('must reject before network');};await assert.rejects(verifyPhase8dAcceptance(altered.record,altered.ctx));assert.equal(requests,0);checks++;
console.log('PASS P8D-063 '
+checks+' release acceptance cases: structured19-section evidence, unchanged tested source, real CI identity/attempt/jobs, negative/quoted PASS and fail-closed API boundaries (synthetic only)');
