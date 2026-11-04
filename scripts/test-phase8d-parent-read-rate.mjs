#!/usr/bin/env node
// P8D-015 8D.14: actual layered entrypoint must isolate costly parent reads
// from device and pairing budgets, fail closed if the binding is missing.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
const bundle=process.argv[2];assert(bundle);
const worker=(await import(pathToFileURL(bundle).href)).default;
const id="00000000-0000-4000-8000-000000000001";
const origin="http://localhost", calls=[];
const rates={
 history:{async limit(args){calls.push({kind:"history",...args});return {success:false};}},
 ws:{async limit(args){calls.push({kind:"ws",...args});return {success:false};}}
};
const env={APP_ENV:"development",DEV_PARENT_AUTH_MODE:"none",
 PARENT_HISTORY_RATE:rates.history,PARENT_WS_RATE:rates.ws,
 DB:{prepare(){throw Error("Rate-limited request unexpectedly reached D1");}},
 BRICK_DEVICE:{get(){throw Error("Rate-limited request unexpectedly reached DO");}},
 PAIR_RATE:{async limit(){throw Error("Wrong pairing limiter used");}},
 DEVICE_RATE:{async limit(){throw Error("Wrong device ingestion limiter used");}}
};
const ctx={waitUntil(){}};
const req=(path,headers={})=>new Request(origin+"/parent/api/device/"+id+"/"+path,{method:"GET",headers:{"CF-Connecting-IP":"203.0.113.12",...headers}});
const history=await worker.fetch(req("history?from=1&to=100"),env,ctx);
assert.equal(history.status,429,"history must hit dedicated limit before D1/R2");
assert.equal(calls.at(-1).kind,"history");
const noOrigin=await worker.fetch(req("ws",{Upgrade:"websocket"}),env,ctx);
assert.equal(noOrigin.status,403,"Cross-site/missing Origin socket must be rejected before rate counter");
const wrongOrigin=await worker.fetch(req("ws",{Upgrade:"websocket",Origin:"https://attacker.invalid"}),env,ctx);
assert.equal(wrongOrigin.status,403);
const ws=await worker.fetch(req("ws",{Upgrade:"websocket",Origin:origin}),env,ctx);
assert.equal(ws.status,429,"WS must hit dedicated limit before opening connection");
assert.equal(calls.at(-1).kind,"ws");
assert.equal(calls.length,2,"untrusted/malformed WS must not consume parent quota");
assert(calls.every(x=>x.key.includes("203.0.113.12")),"per-client edge IP should be bound");
const missingHistory={...env,PARENT_HISTORY_RATE:undefined};
assert.equal((await worker.fetch(req("history"),missingHistory,ctx)).status,503,"missing read limiter must fail closed");
const missingWs={...env,PARENT_WS_RATE:undefined};
assert.equal((await worker.fetch(req("ws",{Upgrade:"websocket",Origin:origin}),missingWs,ctx)).status,503,"missing WS limiter must fail closed");
for(const filename of ["wrangler.template.jsonc","wrangler.development.template.jsonc"]){
 const config=JSON.parse(readFileSync(filename,"utf8"));
 const x=config.ratelimits.filter(r=>r.name==="PARENT_HISTORY_RATE"||r.name==="PARENT_WS_RATE");
 assert.equal(x.length,2,filename+" must bind two dedicated quotas");
 assert.equal(new Set(x.map(r=>r.namespace_id)).size,2,"rate namespace collision");
 assert(x.every(r=>r.simple.period===60&&r.simple.limit>=12&&r.simple.limit<=120));
}
console.log("PASS P8D-015: real Worker history/WS read quotas, forbidden Origin exclusion, missing binding fails closed, production+dev distinct namespace configs (live edge enforcement pending)");
