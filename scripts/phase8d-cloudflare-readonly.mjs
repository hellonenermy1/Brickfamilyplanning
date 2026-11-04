#!/usr/bin/env node
// Phase 8D acceptance evidence: GET-ONLY Cloudflare account metadata. No D1 data,
// R2 objects, User/Access tokens, Worker source, or secrets are read or printed.
import fs from "node:fs";
import {pathToFileURL} from "node:url";

const API="https://api.cloudflare.com/client/v4";
const PROD="brick-family-v1",DEV="brick-family-v1-dev";
const HISTORY="brick-family-v1-history",MAPS="brick-family-v1-maps";
const QUEUE="brick-family-v1-events",DLQ="brick-family-v1-dlq";
const DAY=86_400;
const EXPECTED=[
 ["brick-raw-history-30d","history/raw/",30*DAY,"deleteObjectsTransition"],
 ["brick-trusted-history-90d","history/trusted/",90*DAY,"deleteObjectsTransition"],
 ["brick-raw-evidence-30d","evidence/raw/",30*DAY,"deleteObjectsTransition"],
 ["brick-abort-multipart-7d","",7*DAY,"abortMultipartUploadsTransition"]
];

export async function attest({token,accountId,request=fetch}={}) {
 const checks=[], evidence={}; // Never store response bodies, user/secret values or auth headers.
 const record=(name,status,detail)=>checks.push({name,status,detail});
 const result=()=>({format:"brick-phase8d-cloudflare-readonly-v1",
   allPass:checks.length===7&&checks.every(x=>x.status==="ATTESTED"),
   checks,evidence});
 const validId=typeof accountId==="string"&&/^[a-f0-9]{32}$/i.test(accountId);
 if(!token||!validId){
  for(const label of ["production_deployment","development_deployment","production_bindings","development_isolation","queue_dlq","history_lifecycle","parent_access"])record(label,"BLOCKED","Scoped Cloudflare token/account ID missing; no account requests made");
  return result();
 }
 const get=async path=>{
  if(typeof path!=="string"||!path.startsWith("/accounts/"+accountId+"/")||/[?#]/.test(path))throw Error("path not allowlisted");
  const permitted=[
    /^\/accounts\/[a-f0-9]{32}\/workers\/scripts\/(?:brick-family-v1|brick-family-v1-dev)\/(?:deployments|settings)$/i,
    /^\/accounts\/[a-f0-9]{32}\/queues$/i,
    /^\/accounts\/[a-f0-9]{32}\/r2\/buckets\/(?:brick-family-v1-history|brick-family-v1-maps)(?:\/lifecycle)?$/i,
    /^\/accounts\/[a-f0-9]{32}\/access\/apps$/i
  ];
  if(!permitted.some(rx=>rx.test(path)))throw Error("GET path refused");
  const res=await request(API+path,{method:"GET",headers:{Authorization:"Bearer "+token,Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(15000)});
  if(!res?.ok)throw Error("Cloudflare GET returned HTTP "+(res?.status??"unknown"));
  const data=await res.json();
  if(data?.success!==true||data.result==null)throw Error("Cloudflare GET response unavailable");
  return data.result;
 };
 const attempt=async(name,fn)=>{
  try{const x=await fn();record(name,x.ok?"ATTESTED":x.blocked?"BLOCKED":"DRIFT",x.detail);if(x.evidence)evidence[name]=x.evidence;}
  catch(e){record(name,"BLOCKED",/^Cloudflare GET returned HTTP (?:401|403)$/.test(String(e?.message))?"Cloudflare token lacks read permission": "Metadata GET unavailable or unexpected shape");}
 };
 const deployment=async script=>{
  const result=await get("/accounts/"+accountId+"/workers/scripts/"+script+"/deployments");
  const arr=Array.isArray(result?.deployments)?result.deployments:null;
  if(!arr?.length)return {blocked:true,detail:"No active deployment record returned"};
  const d=arr[0],v=d?.versions;
  if(typeof d.id!=="string"||!Array.isArray(v)||!v.length)return {blocked:true,detail:"Deployment ID/version percentages not available"};
  const valid=v.every(x=>typeof x.version_id==="string"&&typeof x.percentage==="number"&&x.percentage>0&&x.percentage<=100);
  const total=v.reduce((sum,x)=>sum+Number(x.percentage||0),0);
  if(!valid||Math.abs(total-100)>0.001)return {ok:false,detail:"Active deployment has invalid traffic weights"};
  const tag=d.annotations?.["workers/tag"],message=d.annotations?.["workers/message"];
  // A matching source Git SHA is mandatory for release attestation. A deployment ID
  // alone does not establish code provenance and never passes the final identity gate.
  const git=(typeof tag==="string"?tag+" ":"")+(typeof message==="string"?message:"");
  const sha=(git.match(/(?:brick-git-|source\s+)([0-9a-f]{12,40})/i)||[])[1];
  return {ok:Boolean(sha)&&v.length===1&&v[0].percentage===100,
   detail:sha?"Deployment ID and source Git SHA annotation present; single-version 100% required":"Active versions visible, exact Git SHA annotation not independently attested",
   evidence:{deploymentId:d.id,versionIds:v.map(x=>x.version_id),trafficPercentages:v.map(x=>x.percentage),sourceShaPrefix:sha??null}};
 };
 await attempt("production_deployment",()=>deployment(PROD));
 await attempt("development_deployment",()=>deployment(DEV));
 let prodSettings=null,devSettings=null;
 await attempt("production_bindings",async()=>{
  prodSettings=await get("/accounts/"+accountId+"/workers/scripts/"+PROD+"/settings");
  const bindings=Array.isArray(prodSettings?.bindings)?prodSettings.bindings:null;
  if(!bindings)return {blocked:true,detail:"Cloudflare Worker setting bindings absent"};
  const names=new Set(bindings.map(x=>x?.name));
  const expected=["DB","HISTORY","MAPS","BRICK_DEVICE","EVENTS","DEVICE_RATE","PAIR_RATE","PARENT_HISTORY_RATE","PARENT_WS_RATE","PARENT_GEOCODE_RATE","PARENT_COMMUTE_RATE"];
  const missing=expected.filter(x=>!names.has(x));
  const refs=Object.fromEntries(bindings.filter(x=>["DB","HISTORY","MAPS","EVENTS"].includes(x?.name)).map(x=>[x.name,x.id??x.bucket_name??x.queue_name??x.queue??null]));
  const match=refs.HISTORY===HISTORY&&refs.MAPS===MAPS&&refs.EVENTS===QUEUE;
  return {ok:missing.length===0&&match,detail:missing.length?("Missing required bindings: "+missing.join(",")):!match?"Production storage binding targets differ or are not visible":"Required production Worker binding names and storage targets present",
    evidence:{bindingNames:expected.filter(x=>names.has(x)),bindingCount:bindings.length,storageReferences:refs}};
 });
 await attempt("development_isolation",async()=>{
  devSettings=await get("/accounts/"+accountId+"/workers/scripts/"+DEV+"/settings");
  const bs=Array.isArray(devSettings?.bindings)?devSettings.bindings:null;
  if(!bs||!Array.isArray(prodSettings?.bindings))return {blocked:true,detail:"Both Worker settings required for isolation comparison"};
  const prod=prodSettings.bindings,child=bs.find(x=>x.name==="DB"),parent=prod.find(x=>x.name==="DB");
  const names=new Set(bs.map(x=>x?.name)),rate=bs.filter(x=>x.type==="ratelimit");
  const same=child&&parent&&(child.id??child.database_id)===(parent.id??parent.database_id);
  const expected=["DB","BRICK_DEVICE","PARENT_LOGIN_RATE","PARENT_GEOCODE_RATE","PARENT_COMMUTE_RATE"];
  const missing=expected.filter(n=>!names.has(n));
  return {ok:!!child&&!same&&missing.length===0&&!names.has("EVENTS")&&!names.has("HISTORY"),
    detail:same?"CRITICAL: development and production D1 database bindings identical":missing.length?("Missing development bindings: "+missing.join(",")):"Development D1 and parent login/expensive rate paths separate, no production Queue/HISTORY binding",
    evidence:{databaseReferencesDistinct:!!child&&!same,missingBindings:missing,unwantedProdQueue: names.has("EVENTS"),rateBindingCount:rate.length}};
 });
 await attempt("queue_dlq",async()=>{
  const r=await get("/accounts/"+accountId+"/queues");
  const list=Array.isArray(r)?r:Array.isArray(r?.queues)?r.queues:null;
  if(!list)return {blocked:true,detail:"Cloudflare Queue listing response shape unknown"};
  const q=list.find(x=>x.queue_name===QUEUE),dlq=list.find(x=>x.queue_name===DLQ);
  if(!q||!dlq)return {ok:false,detail:"Event Queue or DLQ missing"};
  const consumer=Array.isArray(q.consumers)?q.consumers.find(x=>x.script_name===PROD):null;
  const replay=Array.isArray(dlq.consumers)?dlq.consumers.find(x=>x.script_name===PROD):null;
  if(!consumer||!replay)return {blocked:true,detail:"Queue/DLQ consumer metadata incomplete"};
  const enabled=q.settings?.delivery_paused!==true&&dlq.settings?.delivery_paused!==true;
  const correct=consumer.dead_letter_queue===DLQ&&Number(consumer.settings?.max_retries)>=5&&Number(replay.settings?.max_retries)>=20;
  return {ok:enabled&&correct,detail:!enabled?"Queue delivery paused":!correct?"Queue consumer/DLQ retry or linkage drift":"Queue and DLQ active, consumers and replay retries verified",
    evidence:{queueFound:true,deadLetterFound:true,mainRetries:consumer.settings?.max_retries??null,dlqRetries:replay.settings?.max_retries??null,deadLetterTarget:consumer.dead_letter_queue??null}};
 });
 await attempt("history_lifecycle",async()=>{
  await get("/accounts/"+accountId+"/r2/buckets/"+HISTORY);
  await get("/accounts/"+accountId+"/r2/buckets/"+MAPS);
  const lc=await get("/accounts/"+accountId+"/r2/buckets/"+HISTORY+"/lifecycle");
  if(!Array.isArray(lc?.rules))return {blocked:true,detail:"History R2 lifecycle rules not visible"};
  const errors=[];
  for(const [id,prefix,age,kind] of EXPECTED){
   const v=lc.rules.find(x=>x.id===id),c=v?.[kind]?.condition;
   if(!v||v.enabled!==true||v.conditions?.prefix!==prefix||c?.type!=="Age"||Number(c?.maxAge)!==age)errors.push(id);
  }
  return {ok:errors.length===0,detail:errors.length?"Missing/drifted lifecycle: "+errors.join(","):"All four required history/raw/evidence/multipart lifecycle rules actually deployed",
   evidence:{verifiedRules:EXPECTED.filter(x=>!errors.includes(x[0])).map(x=>x[0]),ruleCount:lc.rules.length}};
 });
 await attempt("parent_access",async()=>{
  const r=await get("/accounts/"+accountId+"/access/apps");
  const apps=Array.isArray(r)?r:Array.isArray(r?.apps)?r.apps:null;
  if(!apps)return {blocked:true,detail:"Cloudflare Access app listing not available"};
  const match=apps.filter(x=>(Array.isArray(x.destinations)?x.destinations.map(d=>d.uri):[x.domain]).some(s=>typeof s==="string"&&/^brick-family-v1\.[a-z0-9.-]+\.workers\.dev\/parent\*$/i.test(s)));
  if(match.length!==1)return {ok:false,detail:"Exactly one production Access parent* app not attested"};
  const app=match[0];
  // A matching route proves only application presence; include/exclude policies,
  // Access issuer/audience and actual user ownership remain a separate live gate.
  return {ok:true,detail:"Production parent* Access application route found (policy, RS256 JWT and family ownership still require separate tests)",
    evidence:{appCount:1,appId:app.id??null,policyVerified:false}};
 });
 return result();
}

export function reportSummary(r){
 return r.checks.map(x=>x.name+": "+x.status+" — "+x.detail).join("\n")+"\nResult: "+(r.allPass?"ALL SEVEN ATTESTED":"LIVE PHASE 8D NOT ATTESTED");
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const accountId=process.env.CLOUDFLARE_ACCOUNT_ID||"",token=process.env.CLOUDFLARE_API_TOKEN||"";
 const r=await attest({accountId,token});
 console.log(reportSummary(r));
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,"## Phase 8D Cloudflare account metadata (READ ONLY)\n\n"+reportSummary(r).replaceAll("\n","  \n")+"\n");
 // This result is intentionally non-secret; never store Cloudflare raw responses.
 fs.writeFileSync("phase8d-live-readonly-result.json",JSON.stringify(r,null,2)+"\n",{mode:0o600});
 if(!r.allPass)process.exitCode=2;
}
