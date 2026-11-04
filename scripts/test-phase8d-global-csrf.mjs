#!/usr/bin/env node
// P8D.12 cross-site mutation matrix against the actual bundled layered production Worker.
// Synthetic same-host local-development Access bypass only; no live Access or user data.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const bundle=process.argv[2]; assert.ok(bundle,"pass worker bundle");
const worker=(await import(pathToFileURL(bundle).href)).default;
const base="http://localhost";
const id="00000000-0000-4000-8000-000000000001";
const rid="00000000-0000-4000-8000-000000000002";
let writes=0,readCount=0,doCalls=0;
const db={prepare(sql){readCount++;return {bind(...args){return {
 async first(){return {revoked_at:null,id,name:"Synthetic",n:0};},
 async all(){return {results:[]};},
 async run(){writes++;throw Error("CSRF reached DB write: "+sql);}
};}};},async batch(){writes++;throw Error("CSRF reached D1 batch");}};
const env={APP_ENV:"development",DEV_PARENT_AUTH_MODE:"none",DB:db,
 BRICK_DEVICE:{idFromName(){return id;},get(){doCalls++;throw Error("CSRF reached DO");}},
 PAIR_RATE:{async limit(){throw Error("CSRF reached rate limit before Origin");}},
 DEVICE_RATE:{async limit(){throw Error("CSRF reached device limit before Origin");}},
 HISTORY:{},MAPS:{},EVENTS:{},CURRENT_APP_VERSION:"test"};
const ctx={waitUntil(){},passThroughOnException(){}};
const matrix=[
 ["POST","/parent/api/pair/start",{}],
 ["POST","/parent/api/pair/pin/start",{}],
 ["POST","/parent/api/pair/pin/"+rid,{}],
 ["POST","/parent/api/device/"+id+"/geofences",{}],
 ["PATCH","/parent/api/device/"+id+"/geofences/"+rid,{}],
 ["DELETE","/parent/api/device/"+id+"/geofences/"+rid,null],
 ["POST","/parent/api/device/"+id+"/trips",{}],
 ["POST","/parent/api/device/"+id+"/trips/"+rid+"/end",{reason:"cancelled"}],
 ["PATCH","/parent/api/device/"+id+"/retention",{safetyEventDays:180}],
 ["POST","/parent/api/device/"+id+"/revoke",{}],
 ["POST","/parent/api/device/"+id+"/location-control",{}],
 ["POST","/parent/api/device/"+id+"/ble-anchors",{}],
 ["DELETE","/parent/api/device/"+id+"/ble-anchors/"+rid,null],
 ["POST","/parent/api/device/"+id+"/live-track",{}],
 ["POST","/parent/api/device/"+id+"/wifi-schedules",{}],
 ["POST","/parent/api/device/"+id+"/rename",{name:"Synthetic"}]
];
for(const [method,path,body] of matrix){
 for(const origin of [undefined,"https://attacker.invalid","http://localhost.attacker.invalid"]){
  const headers={"Content-Type":"application/json"};
  if(origin!==undefined) headers.Origin=origin;
  const request=new Request(base+path,{method,headers,...(body===null?{}:{body:JSON.stringify(body)})});
  const response=await worker.fetch(request,env,ctx);
  assert.equal(response.status,403,method+" "+path+" accepted foreign/missing origin: "+response.status);
 }
}
assert.equal(writes,0,"cross-site request mutated D1");
assert.equal(doCalls,0,"cross-site request sent a DO mutation");
console.log("PASS 8D.12: "+matrix.length+" distinct production parent mutation routes × missing/foreign/lookalike Origin = "+matrix.length*3+" denied, zero DB/DO writes (local simulated auth, not live Cloudflare)");
