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
  const reason=!token&&!validId?"Dedicated read token AND account ID missing/invalid"
    : !token?"Dedicated read-only audit token not configured"
      :"Cloudflare account ID missing or invalid";
  for(const label of ["production_deployment","development_deployment","production_bindings","development_isolation","queue_dlq","history_lifecycle","parent_access"])
    record(label,"BLOCKED",reason+"; no account requests made");
  return result();
 }
 const getEnvelope=async path=>{
  if(typeof path!=="string"||!path.startsWith("/accounts/"+accountId+"/")||/[#]/.test(path))throw Error("path not allowlisted");
  const permitted=[
    /^\/accounts\/[a-f0-9]{32}\/workers\/scripts\/(?:brick-family-v1|brick-family-v1-dev)\/(?:deployments|settings)$/i,
    /^\/accounts\/[a-f0-9]{32}\/queues(?:\?per_page=100&page=(?:[1-9]|1[0-9]|20))?$/i,
    /^\/accounts\/[a-f0-9]{32}\/workers\/scripts\/(?:brick-family-v1|brick-family-v1-dev)\/versions\/[0-9a-f-]{36}$/i,
    /^\/accounts\/[a-f0-9]{32}\/r2\/buckets\/(?:brick-family-v1-history|brick-family-v1-maps)(?:\/lifecycle)?$/i,
    /^\/accounts\/[a-f0-9]{32}\/access\/apps$/i
  ];
  if(!permitted.some(rx=>rx.test(path)))throw Error("GET path refused");
  const res=await request(API+path,{method:"GET",headers:{Authorization:"Bearer "+token,Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(15000)});
  if(!res?.ok)throw Error("Cloudflare GET returned HTTP "+(res?.status??"unknown"));
  const data=await res.json();
  if(data?.success!==true||data.result==null)throw Error("Cloudflare GET response unavailable");
  return {result:data.result,resultInfo:data.result_info??null};
 };
 const get=async path=>(await getEnvelope(path)).result;
 const attempt=async(name,fn)=>{
  try{const x=await fn();record(name,x.ok?"ATTESTED":x.blocked?"BLOCKED":"DRIFT",x.detail);if(x.evidence)evidence[name]=x.evidence;}
  catch(e){record(name,"BLOCKED",/^Cloudflare GET returned HTTP (?:401|403)$/.test(String(e?.message))?"Cloudflare token lacks read permission": "Metadata GET unavailable or unexpected shape");}
 };
 const activeVersions=new Map(); // Only the precise 100%-serving Worker version can certify active bindings.
 const deployment=async script=>{
  const data=await get("/accounts/"+accountId+"/workers/scripts/"+script+"/deployments");
  const arr=Array.isArray(data?.deployments)?data.deployments:null;
  if(!arr?.length)return {blocked:true,detail:"No active Worker deployment record returned"};
  const d=arr[0],v=d?.versions;
  if(typeof d.id!=="string"||!Array.isArray(v)||!v.length)return {blocked:true,detail:"Active deployment ID/traffic split not available"};
  const valid=v.every(x=>/^[0-9a-f-]{36}$/i.test(x.version_id??"")&&typeof x.percentage==="number"&&x.percentage>0&&x.percentage<=100);
  const total=v.reduce((sum,x)=>sum+Number(x.percentage||0),0);
  if(!valid||Math.abs(total-100)>0.001)return {ok:false,detail:"Active deployment has invalid traffic weights or version IDs"};
  const evidence={deploymentId:d.id,versionIds:v.map(x=>x.version_id),trafficPercentages:v.map(x=>x.percentage),sourceShaPrefix:null,provenanceSource:"none"};
  if(v.length!==1||v[0].percentage!==100)return {blocked:true,detail:"Multiple live Worker versions; cannot assert single-release provenance",evidence};
  // Deployment object annotations do not reliably identify the active Worker
  // version. Cloudflare exposes version-specific annotations separately.
  let version;
  try{version=await get("/accounts/"+accountId+"/workers/scripts/"+script+"/versions/"+v[0].version_id);}
  catch{return {blocked:true,detail:"Active version metadata unreadable (possible Worker version permission); source SHA remains unverified",evidence};}
  if(version?.id&&version.id!==v[0].version_id)return {blocked:true,detail:"Version-detail ID does not match active deployment version",evidence};
  activeVersions.set(script,version);
  const activeBindings=version?.resources?.bindings;
  evidence.activeVersionBindingCount=Array.isArray(activeBindings)?activeBindings.length:null;
  evidence.scriptContentHash=typeof version?.resources?.script?.etag==="string"?version.resources.script.etag:null;
  evidence.activeVersionSource=version?.metadata?.source??null;
  const candidates=[version?.annotations,version?.metadata?.annotations,version?.resources?.settings?.annotations,version?.resources?.script?.annotations];
  const ann=candidates.find(a=>a&&typeof a==="object"&&("workers/tag" in a||"workers/message" in a))??null;
  const fields=[ann?.["workers/tag"],ann?.["workers/message"]].filter(x=>typeof x==="string").join(" ");
  const sha=(fields.match(/(?:brick-git-|source\\s+)([0-9a-f]{12,40})/i)||[])[1]??null;
  evidence.sourceShaPrefix=sha;
  evidence.provenanceSource=sha?"active-version-annotations":"none";
  return sha?{ok:true,detail:"Active Worker version has an identified Git source annotation at 100% traffic (not current audit SHA parity)",evidence}
    :{blocked:true,detail:"Active version has no readable Git source annotation; this is not proof the code is defective",evidence};
 };
 await attempt("production_deployment",()=>deployment(PROD));
 await attempt("development_deployment",()=>deployment(DEV));
 let prodSettings=null,devSettings=null;
 await attempt("production_bindings",async()=>{
  const active=activeVersions.get(PROD);
  prodSettings=await get("/accounts/"+accountId+"/workers/scripts/"+PROD+"/settings");
  const activeBindings=active?.resources?.bindings,latestBindings=prodSettings?.bindings;
  if(!Array.isArray(activeBindings)||!Array.isArray(latestBindings))return {blocked:true,detail:"Active Worker version and script settings bindings BOTH required to verify active and next-release safety"};
  const expected=["DB","HISTORY","MAPS","BRICK_DEVICE","EVENTS","DEVICE_RATE","PAIR_RATE","PARENT_HISTORY_RATE","PARENT_WS_RATE","PARENT_GEOCODE_RATE","PARENT_COMMUTE_RATE"];
  const activeNames=new Set(activeBindings.map(x=>x?.name)),latestNames=new Set(latestBindings.map(x=>x?.name));
  const missingActive=expected.filter(x=>!activeNames.has(x)),missingSettings=expected.filter(x=>!latestNames.has(x));
  const refs=Object.fromEntries(activeBindings.filter(x=>["DB","HISTORY","MAPS","EVENTS"].includes(x?.name)).map(x=>[x.name,x.id??x.database_id??x.bucket_name??x.queue_name??x.queue??null]));
  const exact=refs.HISTORY===HISTORY&&refs.MAPS===MAPS&&refs.EVENTS===QUEUE;
  const evidence={activeBindingCount:activeBindings.length,latestBindingCount:latestBindings.length,missingActiveBindings:missingActive,missingScriptSettingsBindings:missingSettings,storageTargetsKnown:exact};
  if(missingActive.length||missingSettings.length)return {ok:false,detail:"Missing ACTIVE: "+(missingActive.join(",")||"none")+"; missing latest settings: "+(missingSettings.join(",")||"none"),evidence};
  return {ok:exact,blocked:!exact,detail:exact?"Both active Worker version and latest settings expose expected bindings/targets":"Binding target values not visible or differ from template; requires review",evidence};
 });
 await attempt("development_isolation",async()=>{
  const prodActive=activeVersions.get(PROD)?.resources?.bindings,devActive=activeVersions.get(DEV)?.resources?.bindings;
  devSettings=await get("/accounts/"+accountId+"/workers/scripts/"+DEV+"/settings");
  const latest=devSettings?.bindings,expected=["DB","BRICK_DEVICE","PARENT_LOGIN_RATE","PARENT_GEOCODE_RATE","PARENT_COMMUTE_RATE"];
  if(!Array.isArray(prodActive)||!Array.isArray(devActive)||!Array.isArray(latest))return {blocked:true,detail:"Production/development active-version bindings and dev script settings not fully readable"};
  const activeNames=new Set(devActive.map(x=>x?.name)),latestNames=new Set(latest.map(x=>x?.name));
  const missingActive=expected.filter(x=>!activeNames.has(x)),missingSettings=expected.filter(x=>!latestNames.has(x));
  const source=prodActive.find(x=>x.name==="DB"),target=devActive.find(x=>x.name==="DB");
  const prodId=source?.id??source?.database_id,devId=target?.id??target?.database_id;
  const idsKnown=typeof prodId==="string"&&prodId.length>0&&typeof devId==="string"&&devId.length>0;
  const same=idsKnown&&prodId===devId,shared=activeNames.has("EVENTS")||activeNames.has("HISTORY")||latestNames.has("EVENTS")||latestNames.has("HISTORY");
  const evidence={missingActiveBindings:missingActive,missingScriptSettingsBindings:missingSettings,databaseReferencesDistinct:idsKnown&&!same,unwantedProdStorage:shared};
  if(!idsKnown)return {blocked:true,detail:"Active D1 UUID references unavailable; isolation cannot be proven",evidence};
  if(same||shared)return {ok:false,detail:same?"CRITICAL: active production and development D1 database IDs identical":"Development includes production Queue/HISTORY binding",evidence};
  if(missingActive.length||missingSettings.length)return {ok:false,detail:"Missing ACTIVE dev: "+(missingActive.join(",")||"none")+"; missing latest settings: "+(missingSettings.join(",")||"none"),evidence};
  return {ok:true,detail:"Active development D1 distinct from production; no production Queue/HISTORY, required rate/DO bindings present",evidence};
 });
 await attempt("queue_dlq",async()=>{
  const all=[],maxPages=20;
  for(let page=1;page<=maxPages;page++){
    const response=await getEnvelope("/accounts/"+accountId+"/queues?per_page=100&page="+page);
    const list=Array.isArray(response.result)?response.result:Array.isArray(response.result?.queues)?response.result.queues:null;
    if(!list)return {blocked:true,detail:"Cloudflare Queue listing response shape unknown"};
    all.push(...list);
    const pages=Number(response.resultInfo?.total_pages);
    if(Number.isInteger(pages)&&pages>maxPages)return {blocked:true,detail:"Queue listing exceeds 20-page safety bound",evidence:{pagesInspected:page,queueCount:all.length}};
    if((Number.isInteger(pages)&&pages>0&&page>=pages)||list.length<100)break;
    if(page===maxPages)return {blocked:true,detail:"Queue inventory truncated; cannot assert complete absence",evidence:{pagesInspected:page,queueCount:all.length}};
  }
  const q=all.find(x=>x.queue_name===QUEUE),dlq=all.find(x=>x.queue_name===DLQ);
  const inventory={queueCount:all.length,queueFound:!!q,deadLetterFound:!!dlq};
  if(!q||!dlq)return {ok:false,detail:"Expected Queue/DLQ absent from paginated account listing; verify deployed account before any creation",evidence:inventory};
  const consumer=Array.isArray(q.consumers)?q.consumers.find(x=>x.script_name===PROD):null;
  const replay=Array.isArray(dlq.consumers)?dlq.consumers.find(x=>x.script_name===PROD):null;
  if(!consumer||!replay)return {blocked:true,detail:"Queue/DLQ found; consumer metadata unavailable",evidence:inventory};
  const enabled=q.settings?.delivery_paused!==true&&dlq.settings?.delivery_paused!==true;
  const correct=consumer.dead_letter_queue===DLQ&&Number(consumer.settings?.max_retries)>=5&&Number(replay.settings?.max_retries)>=20;
  return {ok:enabled&&correct,detail:!enabled?"Queue delivery paused":!correct?"Queue consumer/DLQ retry or linkage drift":"Queue and DLQ active, consumers and replay retries verified",
    evidence:{...inventory,mainRetries:consumer.settings?.max_retries??null,dlqRetries:replay.settings?.max_retries??null,deadLetterTargetMatches:consumer.dead_letter_queue===DLQ}};
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
