#!/usr/bin/env node
// 8D.10: exercise the full production entry with synthetic parent auth and D1.
// The 'localhost' Access bypass is ONLY a test fixture, never live Access evidence.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const file=process.argv[2];assert(file,"pass bundled worker-p8b module");
const worker=(await import(pathToFileURL(file).href)).default;
const a="00000000-0000-4000-8000-000000000001";
const b="00000000-0000-4000-8000-000000000002";
const absent="00000000-0000-4000-8000-000000000003";
const origin="http://localhost";
const seen=[],rates=[];
const env={APP_ENV:"development",DEV_PARENT_AUTH_MODE:"none",
 PARENT_WS_RATE:{async limit(o){rates.push(o);return {success:true};}},
 PARENT_HISTORY_RATE:{async limit(){throw Error("wrong rate scope");}},
 DB:{prepare(sql){return {bind(...params){return {
 async first(){
  if(!sql.includes("FROM devices"))throw Error("Unexpected D1 query: "+sql);
  const id=params.find(x=>x===a||x===b||x===absent);
  return id===absent?null:id?{id,revoked_at:null}:null;
 },
 async all(){return {results:[]}}
 };}};}},
 BRICK_DEVICE:{idFromName(id){return id},get(id){return {
 async fetch(req){
  seen.push({device:id,headers:Object.fromEntries(req.headers),method:req.method,path:new URL(req.url).pathname});
  return Response.json({ok:true,device:id});
 }}}},
 PAIR_RATE:{async limit(){throw Error("wrong pair limiter");}},
 DEVICE_RATE:{async limit(){throw Error("wrong device limiter");}}
};
const ctx={waitUntil(){}};
const wsReq=(id,extra={},method="GET")=>new Request(origin+"/parent/api/device/"+id+"/ws",{method,headers:{Upgrade:"websocket",Origin:origin,"CF-Connecting-IP":"203.0.113.8",...extra}});
for(const request of [
 wsReq(a,{Origin:"https://attacker.invalid"}),
 wsReq(a,{Origin:"http://localhost.attacker.invalid"}),
 wsReq(a,{Origin:""}),
 wsReq(a,{Upgrade:""}),
 wsReq(a,{}, "POST")
]){
 const response=await worker.fetch(request,env,ctx);
 assert.equal(response.status,403,"invalid websocket route admitted");
}
assert.equal(seen.length,0,"forbidden upgrade touched DO");
const now=Date.now();
const attacker=wsReq(a,{"X-Brick-Internal-Ws-Lease-Until":String(now+99_999_999),"Cookie":"secret-cookie","Cf-Access-Jwt-Assertion":"attacker-jwt"});
const valid=await worker.fetch(attacker,env,ctx);
assert.equal(valid.status,200);
assert.equal(seen.length,1);
const x=seen[0];
assert.equal(x.device,a);
assert.equal(x.path,"/ws");
assert.equal(x.method,"GET");
assert.equal(x.headers.upgrade,"websocket");
assert(!("cookie" in x.headers),"browser cookies forwarded into DO");
assert(!("cf-access-jwt-assertion" in x.headers),"JWT forwarded into DO");
const lease=Number(x.headers["x-brick-internal-ws-lease-until"]);
assert(Number.isSafeInteger(lease)&&lease>now&&lease<=Date.now()+30_000,"forged unbounded WS lease accepted");
const second=await worker.fetch(wsReq(b),env,ctx);
assert.equal(second.status,200);
assert.deepEqual(seen.map(x=>x.device),[a,b],"DO routing not isolated per child");
const missing=await worker.fetch(wsReq(absent),env,ctx);
assert.equal(missing.status,404);
assert.equal(seen.length,2,"nonexistent child reached DO");
const withoutRate=await worker.fetch(wsReq(a),{...env,PARENT_WS_RATE:undefined},ctx);
assert.equal(withoutRate.status,503);
const productionNoJwt=await worker.fetch(wsReq(a),{...env,APP_ENV:"production",CF_ACCESS_TEAM_DOMAIN:undefined,CF_ACCESS_AUD:undefined},ctx);
assert.equal(productionNoJwt.status,403);
assert.equal(seen.length,2,"unauthorized / missing-rate request reached DO");
assert.equal(rates.length,3,"missing/invalid auth or upgrade consumed WS quota");
console.log("PASS 8D.10 Worker: 5 bad upgrades refused, JWT + cookie scrubbed, forged lease replaced with <=30s grant, two-device routing, unknown device and missing quota fail closed; local simulation ONLY");
