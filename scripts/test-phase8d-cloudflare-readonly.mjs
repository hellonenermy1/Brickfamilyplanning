import assert from "node:assert/strict";
import {attest,reportSummary} from "./phase8d-cloudflare-readonly.mjs";
const id="a".repeat(32),prefix="/client/v4/accounts/"+id,host="brick-family-v1";
const prodBindings=["DB","HISTORY","MAPS","BRICK_DEVICE","EVENTS","DEVICE_RATE","PAIR_RATE","PARENT_HISTORY_RATE","PARENT_WS_RATE","PARENT_GEOCODE_RATE","PARENT_COMMUTE_RATE"].map(name=>({name,type:name.endsWith("_RATE")?"ratelimit":"other",...(name==="DB"?{id:"prod-db"}:name==="HISTORY"?{bucket_name:host+"-history"}:name==="MAPS"?{bucket_name:host+"-maps"}:name==="EVENTS"?{queue_name:host+"-events"}:{})}));
const devBindings=["DB","BRICK_DEVICE","PARENT_LOGIN_RATE","PARENT_GEOCODE_RATE","PARENT_COMMUTE_RATE"].map(name=>({name,type:"other",...(name==="DB"?{id:"dev-db"}:{})}));
const versions={prod:"11111111-1111-4111-8111-111111111111",dev:"22222222-2222-4222-8222-222222222222"};
const deployment=n=>({deployments:[{id:n,versions:[{version_id:versions[n],percentage:100}]}]});
const versionMetadata=()=>({metadata:{annotations:{"workers/tag":"brick-git-0123456789ab"}}});
const age=86400;
const rules=[["brick-raw-history-30d","history/raw/",30],["brick-trusted-history-90d","history/trusted/",90],["brick-raw-evidence-30d","evidence/raw/",30],["brick-abort-multipart-7d","",7]].map(([id,prefix,days],i)=>({id,enabled:true,conditions:{prefix},[i===3?"abortMultipartUploadsTransition":"deleteObjectsTransition"]:{condition:{type:"Age",maxAge:age*days}}}));
function data(){
 return {
  ["/workers/scripts/"+host+"/deployments"]:deployment("prod"),
  ["/workers/scripts/"+host+"-dev/deployments"]:deployment("dev"),
  ["/workers/scripts/"+host+"/versions/"+versions.prod]:versionMetadata(),
  ["/workers/scripts/"+host+"-dev/versions/"+versions.dev]:versionMetadata(),
  ["/workers/scripts/"+host+"/settings"]:{bindings:structuredClone(prodBindings)},
  ["/workers/scripts/"+host+"-dev/settings"]:{bindings:structuredClone(devBindings)},
  ["/queues?per_page=100&page=1"]:[{queue_name:host+"-events",settings:{delivery_paused:false},consumers:[{script_name:host,dead_letter_queue:host+"-dlq",settings:{max_retries:5}}]},{queue_name:host+"-dlq",settings:{delivery_paused:false},consumers:[{script_name:host,settings:{max_retries:100}}]}],
  ["/r2/buckets/"+host+"-history"]:{name:host+"-history"},
  ["/r2/buckets/"+host+"-maps"]:{name:host+"-maps"},
  ["/r2/buckets/"+host+"-history/lifecycle"]:{rules:structuredClone(rules)},
  ["/access/apps"]:[{id:"access-id",destinations:[{uri:host+".synthetic.workers.dev/parent*"}]}]
 };
}
async function run(d=data(),hasToken=true){
 const calls=[];
 const request=async(url,opts)=>{
  const p=new URL(url).pathname;calls.push(opts.method);
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
assert.equal(yes.calls.length,11);
for(const [label,mutation,section] of [
 ["missing version",d=>{delete d["/workers/scripts/"+host+"/versions/"+versions.prod].metadata.annotations;},"production_deployment"],
 ["missing Queue",d=>{d["/workers/scripts/"+host+"/settings"].bindings=d["/workers/scripts/"+host+"/settings"].bindings.filter(x=>x.name!=="EVENTS");},"production_bindings"],
 ["same DB",d=>{d["/workers/scripts/"+host+"-dev/settings"].bindings[0].id="prod-db";},"development_isolation"],
 ["wrong DLQ",d=>{d["/queues?per_page=100&page=1"][0].consumers[0].dead_letter_queue="missing";},"queue_dlq"],
 ["queue paused",d=>{d["/queues"][0].settings.delivery_paused=true;},"queue_dlq"],
 ["no retention",d=>{d["/r2/buckets/"+host+"-history/lifecycle"].rules[1].enabled=false;},"history_lifecycle"],
 ["no Access",d=>{d["/access/apps"]=[];},"parent_access"]
]){
 const d=data();mutation(d);const r=await run(d);
 assert.equal(r.output.allPass,false,label);
 assert.notEqual(r.output.checks.find(x=>x.name===section).status,"ATTESTED",label);
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
const noCred=await run(data(),false);
assert(noCred.output.checks.every(x=>x.status==="BLOCKED"));assert.equal(noCred.calls.length,0);
console.log("PASS 8D: 7 Cloudflare read-only account gates, 11 positive GETs, 7 drift cases, paginated Queue and version metadata permission and absent-account-credential fail-closed");
