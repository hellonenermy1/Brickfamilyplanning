import assert from "node:assert/strict";
import {attest,reportSummary} from "./phase8d-cloudflare-readonly.mjs";
const id="a".repeat(32),prefix="/client/v4/accounts/"+id,host="brick-family-v1";
const prodBindings=["DB","HISTORY","MAPS","BRICK_DEVICE","EVENTS","DEVICE_RATE","PAIR_RATE","PARENT_HISTORY_RATE","PARENT_WS_RATE","PARENT_GEOCODE_RATE","PARENT_COMMUTE_RATE"].map(name=>({name,type:name.endsWith("_RATE")?"ratelimit":"other",...(name==="DB"?{id:"prod-db"}:name==="HISTORY"?{bucket_name:host+"-history"}:name==="MAPS"?{bucket_name:host+"-maps"}:name==="EVENTS"?{queue_name:host+"-events"}:{})}));
const devBindings=["DB","BRICK_DEVICE","PARENT_LOGIN_RATE","PARENT_GEOCODE_RATE","PARENT_COMMUTE_RATE"].map(name=>({name,type:"other",...(name==="DB"?{id:"dev-db"}:{})}));
const versions={prod:"11111111-1111-4111-8111-111111111111",dev:"22222222-2222-4222-8222-222222222222"};
const deployment=n=>({deployments:[{id:n,versions:[{version_id:versions[n],percentage:100}]}]});
const versionMetadata=(kind)=>({id:versions[kind],metadata:{annotations:{"workers/tag":"brick-git-0123456789ab"},source:"wrangler"},resources:{bindings:structuredClone(kind==="prod"?prodBindings:devBindings),script:{etag:"sha256-source-fixture"}}});
const accessId="33333333-3333-4333-8333-333333333333";
const accessTarget=host+".synthetic.workers.dev/parent*";
const accessApp={id:accessId,type:"self_hosted",aud:"long-test-audience-1234567890",session_duration:"24h",
 enable_binding_cookie:true,http_only_cookie_attribute:true,same_site_cookie_attribute:"lax",path_cookie_attribute:true,allow_iframe:false,app_launcher_visible:false,
 destinations:[{type:"public",uri:accessTarget}]};
const age=86400;
const rules=[["brick-raw-history-30d","history/raw/",30],["brick-trusted-history-90d","history/trusted/",90],["brick-raw-evidence-30d","evidence/raw/",30],["brick-abort-multipart-7d","",7]].map(([id,prefix,days],i)=>({id,enabled:true,conditions:{prefix},[i===3?"abortMultipartUploadsTransition":"deleteObjectsTransition"]:{condition:{type:"Age",maxAge:age*days}}}));
function data(){
 return {
  ["/workers/scripts/"+host+"/deployments"]:deployment("prod"),
  ["/workers/scripts/"+host+"-dev/deployments"]:deployment("dev"),
  ["/workers/scripts/"+host+"/versions/"+versions.prod]:versionMetadata("prod"),
  ["/workers/scripts/"+host+"-dev/versions/"+versions.dev]:versionMetadata("dev"),
  ["/workers/scripts/"+host+"/settings"]:{bindings:structuredClone(prodBindings)},
  ["/workers/scripts/"+host+"-dev/settings"]:{bindings:structuredClone(devBindings)},
  ["/queues?per_page=100&page=1"]:[{queue_name:host+"-events",settings:{delivery_paused:false},consumers:[{script_name:host,dead_letter_queue:host+"-dlq",settings:{max_retries:5}}]},{queue_name:host+"-dlq",settings:{delivery_paused:false},consumers:[{script_name:host,settings:{max_retries:100}}]}],
  ["/r2/buckets/"+host+"-history"]:{name:host+"-history"},
  ["/r2/buckets/"+host+"-maps"]:{name:host+"-maps"},
  ["/r2/buckets/"+host+"-history/lifecycle"]:{rules:structuredClone(rules)},
  ["/access/apps"]:[{id:accessId,destinations:[{uri:accessTarget}]}],
  ["/access/apps/"+accessId]:structuredClone(accessApp),
  ["/access/apps/"+accessId+"/policies"]:[{decision:"allow",precedence:1,include:[{cloudflare_account_member:{account_id:id}}],exclude:[],require:[]}]
 };
}
async function run(d=data(),hasToken=true){
 const calls=[];
 const request=async(url,opts)=>{
  const parsed=new URL(url),p=parsed.pathname+parsed.search;calls.push(opts.method);
  assert.equal(opts.method,"GET");
  assert.equal(new URL(url).origin,"https://api.cloudflare.com");
  assert(p.startsWith(prefix));
  const r=d[p.slice(prefix.length)];
  return {ok:r!==undefined,status:r!==undefined?200:404,async json(){return{success:r!==undefined,result:r??null}}};
 };
 const output=await attest({token:hasToken?"synthetic":undefined,accountId:id,request});
 return {output,calls};
}
const yes=await run();
assert(yes.output.allPass,reportSummary(yes.output));
assert.equal(yes.output.checks.length,7);
assert.equal(yes.calls.length,13);
for(const [label,mutation,section] of [
 ["missing version",d=>{delete d["/workers/scripts/"+host+"/versions/"+versions.prod].metadata.annotations;},"production_deployment"],
 ["missing Queue",d=>{d["/workers/scripts/"+host+"/settings"].bindings=d["/workers/scripts/"+host+"/settings"].bindings.filter(x=>x.name!=="EVENTS");},"production_bindings"],
 ["same DB",d=>{d["/workers/scripts/"+host+"-dev/versions/"+versions.dev].resources.bindings[0].id="prod-db";},"development_isolation"],
 ["wrong DLQ",d=>{d["/queues?per_page=100&page=1"][0].consumers[0].dead_letter_queue="missing";},"queue_dlq"],
 ["queue paused",d=>{d["/queues?per_page=100&page=1"][0].settings.delivery_paused=true;},"queue_dlq"],
 ["no retention",d=>{d["/r2/buckets/"+host+"-history/lifecycle"].rules[1].enabled=false;},"history_lifecycle"],
 ["no Access",d=>{d["/access/apps"]=[];},"parent_access"]
]){
 const d=data();mutation(d);const r=await run(d);
 assert.equal(r.output.allPass,false,label);
 assert.notEqual(r.output.checks.find(x=>x.name===section).status,"ATTESTED",label);
}
// The active serving version is authoritative: a correct template or latest
// script settings must not hide broken active Worker bindings.
{
 const d=data();
 d["/workers/scripts/"+host+"/versions/"+versions.prod].resources.bindings=
  d["/workers/scripts/"+host+"/versions/"+versions.prod].resources.bindings.filter(x=>x.name!=="EVENTS");
 const r=await run(d);
 assert.equal(r.output.checks.find(x=>x.name==="production_bindings").status,"DRIFT");
 assert(r.output.evidence.production_bindings.missingActiveBindings.includes("EVENTS"));
}
{
 const d=data();
 delete d["/workers/scripts/"+host+"-dev/versions/"+versions.dev].resources.bindings;
 const r=await run(d);
 assert.equal(r.output.checks.find(x=>x.name==="development_isolation").status,"BLOCKED");
}
{
 const d=data();
 d["/workers/scripts/"+host+"-dev/versions/"+versions.dev].resources.bindings=
  d["/workers/scripts/"+host+"-dev/versions/"+versions.dev].resources.bindings.filter(x=>x.name!=="PARENT_COMMUTE_RATE");
 const r=await run(d);
 assert.equal(r.output.checks.find(x=>x.name==="development_isolation").status,"DRIFT");
}
// A paginated Queue list cannot be declared missing just because page 1 has 100 unrelated queues.
{
 const d=data(),expected=d["/queues?per_page=100&page=1"];
 d["/queues?per_page=100&page=1"]=Array.from({length:100},(_,i)=>({queue_name:"other-queue-"+i}));
 d["/queues?per_page=100&page=2"]=expected;
 const r=await run(d);
 assert.equal(r.output.checks.find(x=>x.name==="queue_dlq").status,"ATTESTED");
 assert.equal(r.output.evidence.queue_dlq.queueCount,102);
}
// Can't inspect the active version metadata? Fail as BLOCKED, never claim a code defect.
{
 const d=data();delete d["/workers/scripts/"+host+"/versions/"+versions.prod];
 const r=await run(d);
 assert.equal(r.output.checks.find(x=>x.name==="production_deployment").status,"BLOCKED");
}
{
 const d=data();d["/workers/scripts/"+host+"/deployments"].deployments[0].versions.push({version_id:versions.dev,percentage:20});
 d["/workers/scripts/"+host+"/deployments"].deployments[0].versions[0].percentage=80;
 const r=await run(d);
 assert.equal(r.output.checks.find(x=>x.name==="production_deployment").status,"BLOCKED");
}
// Access app presence alone is never proof that its actual policy excludes bypass.
for(const mutate of [
 d=>{d["/access/apps/"+accessId+"/policies"][0].decision="bypass";},
 d=>{d["/access/apps/"+accessId+"/policies"][0].include[0].cloudflare_account_member.account_id="b".repeat(32);},
 d=>{d["/access/apps/"+accessId].enable_binding_cookie=false;},
 d=>{d["/access/apps/"+accessId].destinations.push({uri:"unprotected.example/parent*"});},
 d=>{d["/access/apps/"+accessId+"/policies"].push({decision:"allow",include:[{everyone:{}}]});}
]){
 const d=data();mutate(d);
 const r=await run(d);assert.equal(r.output.allPass,false);
 assert.equal(r.output.checks.find(x=>x.name==="parent_access").status,"DRIFT");
}
{
 const d=data();delete d["/access/apps/"+accessId+"/policies"];
 const r=await run(d);assert.equal(r.output.checks.find(x=>x.name==="parent_access").status,"BLOCKED");
}
const noCred=await run(data(),false);
assert(noCred.output.checks.every(x=>x.status==="BLOCKED"));assert.equal(noCred.calls.length,0);
console.log("PASS 8D: 7 Cloudflare read-only account gates, 13 positive GETs, active version binding/DB isolation negatives, 7 drift cases, paginated Queue and version metadata permission and absent-account-credential fail-closed");
