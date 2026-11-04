import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
const worker=(await import(pathToFileURL(process.argv[2]).href)).default;
const origin="http://localhost",counts=[];
const failRate=(route,success)=>({async limit(input){counts.push({route,key:input.key});return {success}}});
const throwDB={prepare(){throw Error("rate blocked request reached expensive DB")}};
const env={APP_ENV:"development",DEV_PARENT_AUTH_MODE:"none",DB:throwDB,
 PARENT_GEOCODE_RATE:failRate("geocode",false),PARENT_COMMUTE_RATE:failRate("commutes",false)};
const ctx={waitUntil(){throw Error("rate denied request scheduled background work")}};
const req=(path)=>new Request(origin+path,{headers:{"CF-Connecting-IP":"203.0.113.6"}});
assert.equal((await worker.fetch(req("/parent/api/onemap/reverse?lat=1.3&lon=103.8"),env,ctx)).status,429);
assert.equal((await worker.fetch(req("/parent/api/device/12345678-1234-4234-8234-123456789abc/commutes"),env,ctx)).status,429);
assert.equal(counts.length,2);assert.notEqual(counts[0].key,counts[1].key);
assert.equal((await worker.fetch(req("/parent/api/onemap/reverse?lat=1.3&lon=103.8"),{...env,PARENT_GEOCODE_RATE:undefined},ctx)).status,503);
assert.equal((await worker.fetch(req("/parent/api/device/12345678-1234-4234-8234-123456789abc/commutes"),{...env,PARENT_COMMUTE_RATE:undefined},ctx)).status,503);
assert.equal(counts.length,2);
const untrusted={...env,APP_ENV:"production",CF_ACCESS_TEAM_DOMAIN:undefined,CF_ACCESS_AUD:undefined};
const denied=await worker.fetch(req("/parent/api/onemap/reverse?lat=1.3&lon=103.8"),untrusted,ctx);
assert.equal(denied.status,403);
assert.equal(counts.length,2,"anonymous request consumed expensive-route limiter");
for(const file of ["wrangler.template.jsonc","wrangler.development.template.jsonc"]){
 const j=JSON.parse(readFileSync(file,"utf8"));
 const vals=j.ratelimits.filter(x=>["PARENT_GEOCODE_RATE","PARENT_COMMUTE_RATE"].includes(x.name));
 assert.equal(vals.length,2,file+" missing expensive read binding");
 assert.equal(new Set(vals.map(x=>x.namespace_id)).size,2,"quota namespace overlap");
 assert(vals.every(v=>v.simple.period===60&&v.simple.limit>=10&&v.simple.limit<=180));
}
console.log("PASS P8D-029: full Worker geocode/commute quotas fail closed, deny unauthenticated calls first, separate config namespaces, no costly D1/ctx on reject");
