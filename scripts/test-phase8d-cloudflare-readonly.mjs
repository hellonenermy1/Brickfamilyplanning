import assert from "node:assert/strict";
import {attest,reportSummary} from "./phase8d-cloudflare-readonly.mjs";
const id="a".repeat(32),prefix="/client/v4/accounts/"+id,host="brick-family-v1";
const prodBindings=["DB","HISTORY","MAPS","BRICK_DEVICE","EVENTS","DEVICE_RATE","PAIR_RATE","PARENT_HISTORY_RATE","PARENT_WS_RATE","PARENT_GEOCODE_RATE","PARENT_COMMUTE_RATE"].map(name=>({name,type:name.endsWith("_RATE")?"ratelimit":"other",...(name==="DB"?{id:"prod-db"}:name==="HISTORY"?{bucket_name:host+"-history"}:name==="MAPS"?{bucket_name:host+"-maps"}:name==="EVENTS"?{queue_name:host+"-events"}:{})}));
const devBindings=["DB","BRICK_DEVICE","PARENT_LOGIN_RATE","PARENT_GEOCODE_RATE","PARENT_COMMUTE_RATE"].map(name=>({name,type:"other",...(name==="DB"?{id:"dev-db"}:{})}));
const deployment=n=>({deployments:[{id:n,versions:[{version_id:n+"-v",percentage:100}],annotations:{"workers/tag":"brick-git-0123456789ab"}}]});
const age=86400;
const rules=[["brick-raw-history-30d","history/raw/",30],["brick-trusted-history-90d","history/trusted/",90],["brick-raw-evidence-30d","evidence/raw/",30],["brick-abort-multipart-7d","",7]].map(([id,prefix,days],i)=>({id,enabled:true,conditions:{prefix},[i===3?"abortMultipartUploadsTransition":"deleteObjectsTransition"]:{condition:{type:"Age",maxAge:age*days}}}));
function data(){
 return {
  ["/workers/scripts/"+host+"/deployments"]:deployment("prod"),
  ["/workers/scripts/"+host+"-dev/deployments"]:deployment("dev"),
  ["/workers/scripts/"+host+"/settings"]:{bindings:structuredClone(prodBindings)},
  ["/workers/scripts/"+host+"-dev/settings"]:{bindings:structuredClone(devBindings)},
  ["/queues"]:[{queue_name:host+"-events",settings:{delivery_paused:false},consumers:[{script_name:host,dead_letter_queue:host+"-dlq",settings:{max_retries:5}}]},{queue_name:host+"-dlq",settings:{delivery_paused:false},consumers:[{script_name:host,settings:{max_retries:100}}]}],
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
assert.equal(yes.calls.length,9);
for(const [label,mutation,section] of [
 ["missing version",d=>{delete d["/workers/scripts/"+host+"/deployments"].deployments[0].annotations;},"production_deployment"],
 ["missing Queue",d=>{d["/workers/scripts/"+host+"/settings"].bindings=d["/workers/scripts/"+host+"/settings"].bindings.filter(x=>x.name!=="EVENTS");},"production_bindings"],
 ["same DB",d=>{d["/workers/scripts/"+host+"-dev/settings"].bindings[0].id="prod-db";},"development_isolation"],
 ["wrong DLQ",d=>{d["/queues"][0].consumers[0].dead_letter_queue="missing";},"queue_dlq"],
 ["queue paused",d=>{d["/queues"][0].settings.delivery_paused=true;},"queue_dlq"],
 ["no retention",d=>{d["/r2/buckets/"+host+"-history/lifecycle"].rules[1].enabled=false;},"history_lifecycle"],
 ["no Access",d=>{d["/access/apps"]=[];},"parent_access"]
]){
 const d=data();mutation(d);const r=await run(d);
 assert.equal(r.output.allPass,false,label);
 assert.notEqual(r.output.checks.find(x=>x.name===section).status,"ATTESTED",label);
}
const noCred=await run(data(),false);
assert(noCred.output.checks.every(x=>x.status==="BLOCKED"));assert.equal(noCred.calls.length,0);
console.log("PASS 8D: 7 Cloudflare read-only account gates, 9 positive GETs, 7 drift cases and absent-account-credential fail-closed");
