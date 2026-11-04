// Source/CI provenance gate only. Does not generate approval or certify live proof.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const REPO='hellonenermy1/Brickfamilyplanning';
const SOURCE_WORKFLOW='.github/workflows/v1-phase8d-backend-audit-ci.yml';
const REQUIRED_JOBS=[
 'Phase 8D source baseline TypeScript and locked dependencies',
 'P8D-001 — Reproduce production deployment/schema drift',
 'P8D-002 — Reproduce backup coverage drift'
];
function requireValue(ok,message){if(!ok)throw Error('Phase8D release refused: '+message);}
function evidencePath(p){return typeof p==='string'&&/^audit\/phase8d\/[A-Za-z0-9_./-]+$/.test(p)&&p.split('/').every(x=>x&&x!=='.'&&x!=='..');}
function releaseDocumentPath(p){
 if(!evidencePath(p))return false;
 if(p==='audit/phase8d/PHASE8D_FINAL_ACCEPTANCE.json')return true;
 if(p.startsWith('audit/phase8d/release-evidence/'))return /\.(?:json|md|txt|csv|png|jpe?g|pdf)$/.test(p);
 return /\.(?:md|txt|png|jpe?g|pdf)$/.test(p);
}
export function requireFinalPassMarkdown(text){
 requireValue(typeof text==='string','missing final acceptance text');
 let fence=null;const statuses=[];
 for(const line of text.split(/\r?\n/)){
  const marker=line.match(/^\s{0,3}(`{3,}|~{3,})/);
  if(marker){const c=marker[1][0],n=marker[1].length;if(!fence)fence={c,n};else if(c===fence.c&&n>=fence.n)fence=null;continue;}
  if(!fence&&/^FINAL STATUS:/.test(line))statuses.push(line);
 }
 requireValue(statuses.length===1&&statuses[0]==='FINAL STATUS: PASS','exact unquoted final PASS verdict required');
}
export async function verifyPhase8dAcceptance(record,ctx){
 requireValue(ctx.repository===REPO&&record?.repository===REPO,'wrong repository');
 requireValue(ctx.branch==='v1-p8d-accepted-backend','separate accepted release branch required');
 requireValue(record?.format==='brick-phase8d-release-acceptance-v1'&&record.finalStatus==='PASS','structured final PASS required');
 requireValue(/^[0-9a-f]{40}$/.test(record.testedSourceSha??''),'invalid tested source SHA');
 requireValue(await ctx.isAncestor(record.testedSourceSha),'tested source must be an ancestor of release HEAD');
 const changed=await ctx.changedPaths(record.testedSourceSha);
 requireValue(Array.isArray(changed)&&changed.every(releaseDocumentPath),'code/config/workflow changed after tested source');
 requireValue(record.unresolvedP0===0&&record.unresolvedP1===0,'open critical/high findings');
 requireValue(record.requirements?.total===525&&record.requirements.unmapped===0&&record.requirements.unverifiedApplicable===0,'requirement evidence gaps');
 requireFinalPassMarkdown(await ctx.readFinalMarkdown());
 requireValue(Array.isArray(record.sections)&&record.sections.length===19,'all19 sections required');
 const seen=new Set();
 for(const section of record.sections){
  requireValue(/^8D\.([1-9]|1[0-9])$/.test(section.id??'')&&!seen.has(section.id),'invalid/duplicate section');seen.add(section.id);
  requireValue(['VERIFIED','VERIFIED_UNSUPPORTED'].includes(section.status),'unverified section');
  if(section.status==='VERIFIED_UNSUPPORTED')requireValue(typeof section.reason==='string'&&section.reason.trim().length>=20,'unsupported section requires reason');
  requireValue(Array.isArray(section.evidence)&&section.evidence.length>0,'section evidence missing');
  for(const e of section.evidence){
   requireValue(evidencePath(e.path)&&/^[0-9a-f]{64}$/.test(e.sha256??''),'invalid evidence path/hash');
   const bytes=await ctx.readTrackedFile(e.path);
   requireValue(crypto.createHash('sha256').update(bytes).digest('hex')===e.sha256,'evidence hash mismatch');
  }
 }
 requireValue(Number.isSafeInteger(record.sourceCi?.runId)&&record.sourceCi.runId>0&&Number.isSafeInteger(record.sourceCi.runAttempt)&&record.sourceCi.runAttempt>0,'invalid CI identity');
 requireValue(typeof ctx.githubToken==='string'&&ctx.githubToken.length>0,'GitHub Actions read token required');
 async function get(suffix){
  const r=await ctx.fetchImpl('https://api.github.com/repos/'+REPO+suffix,{headers:{Authorization:'Bearer '+ctx.githubToken,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(30_000)});
  requireValue(r.ok,'GitHub evidence HTTP '+r.status);
  return r.json();
 }
 const run=await get('/actions/runs/'+record.sourceCi.runId);
 requireValue(run.id===record.sourceCi.runId&&run.run_attempt===record.sourceCi.runAttempt,'stale/mismatched CI attempt');
 requireValue(run.repository?.full_name===REPO&&run.head_repository?.full_name===REPO,'CI repository mismatch');
 requireValue(run.head_sha===record.testedSourceSha&&run.path===SOURCE_WORKFLOW,'wrong CI source/workflow');
 requireValue(run.status==='completed'&&run.conclusion==='success','CI not successfully completed');
 const jobs=[];let total;
 for(let page=1;page<=10;page++){
  const result=await get('/actions/runs/'+record.sourceCi.runId+'/attempts/'+record.sourceCi.runAttempt+'/jobs?per_page=100&page='+page);
  requireValue(Array.isArray(result.jobs)&&Number.isSafeInteger(result.total_count),'invalid jobs response');
  if(total===undefined)total=result.total_count;requireValue(total===result.total_count,'unstable jobs inventory');
  jobs.push(...result.jobs);if(jobs.length>=total)break;requireValue(result.jobs.length>0,'incomplete jobs inventory');
 }
 requireValue(jobs.length===total,'unbounded/incomplete CI jobs');
 requireValue(new Set(jobs.map(j=>j.id)).size===jobs.length,'duplicate CI jobs');
 requireValue(jobs.every(j=>j.run_id===record.sourceCi.runId&&j.status==='completed'&&j.conclusion==='success'),'failed/skipped/incomplete CI job');
 for(const name of REQUIRED_JOBS)requireValue(jobs.filter(j=>j.name===name).length===1,'missing/duplicate required source job');
 return {verified:true,testedSourceSha:record.testedSourceSha,sourceRunId:run.id,sections:seen.size,liveEvidenceSemantics:'requires independent reviewed audit evidence; structural verification is not new live proof'};
}
function git(args){return execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const recordPath='audit/phase8d/PHASE8D_FINAL_ACCEPTANCE.json';
 requireValue(fs.existsSync(recordPath),'final structured acceptance record absent');
 const head=git(['rev-parse','HEAD']).trim();requireValue(head===process.env.GITHUB_SHA,'checkout/Actions SHA mismatch');
 const record=JSON.parse(git(['show',head+':'+recordPath]));
 const result=await verifyPhase8dAcceptance(record,{
  repository:process.env.GITHUB_REPOSITORY,branch:process.env.GITHUB_REF_NAME,githubToken:process.env.GH_TOKEN,fetchImpl:fetch,
  isAncestor(sha){try{git(['merge-base','--is-ancestor',sha,head]);return true;}catch{return false;}},
  changedPaths(sha){return git(['diff','--name-only','--no-renames',sha,head]).trim().split('\n').filter(Boolean);},
  readFinalMarkdown(){return git(['show',head+':audit/phase8d/PHASE8D_FINAL_ACCEPTANCE.md']);},
  readTrackedFile(p){const entry=git(['ls-tree',head,'--',p]);requireValue(/^100(?:644|755) blob [0-9a-f]{40}\t/.test(entry),'evidence must be tracked regular file');return execFileSync('git',['show',head+':'+p],{stdio:['ignore','pipe','pipe']});}
 });
 console.log(JSON.stringify(result));
}
