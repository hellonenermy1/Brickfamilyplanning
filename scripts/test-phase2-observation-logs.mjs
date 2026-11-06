import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {pathToFileURL} from 'node:url';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const file=process.argv[2];if(!file)throw Error('Provide bundled beta-api module');
const {betaParent}=await import(pathToFileURL(file).href);
const now=Date.now();
const device='device-a';
const rows=Array.from({length:101},(_,i)=>({
 run_id:'run-a',record_id:i+1,received_at:now-i*1000,
 payload:JSON.stringify({wallMs:now-i*1000,bootChanged:i===4,sameBootGapMs:i===4?200000:0,health:{
  network:'wifi',locationAgeMs:i===0?240000:2000,ackAgeMs:1000,pendingRecords:i===0?101:0,
  latitude:1.2345,longitude:103.87654,deviceToken:'SECRET-MUST-NOT-LEAK'
 }})
}));
let queried=false,cutoff=0;
const env={
 DB:{prepare(sql){assert(sql.includes('revoked_at IS NULL'));return{bind(id){return{async first(){return id===device?{public_key_spki_b64:'public'}:null}}}}}},
 BETA_DB:{prepare(sql){assert(sql.includes('WHERE device_id=?1 AND received_at>=?2'));return{bind(id,c){assert.equal(id,device);queried=true;cutoff=c;return{async all(){return{results:rows}}}}}}}
};
const reply=await betaParent(new Request('https://beta.invalid/parent/api/device/device-a/beta/logs'),env,device,'logs');
assert.equal(reply.status,200);
const body=await reply.json();
assert(queried,'Logs route must query actual per-device D1 data');
assert.equal(body.source,'beta_health_observations_only');
assert.equal(body.fullAndroidDiagnosticLogAvailable,false);
assert.equal(body.retainedLocalDays,7);
assert.equal(body.truncated,true);
assert.equal(body.logs.length,100);
assert.equal(body.logs[0].status,'ATTENTION');
assert.equal(body.logs[0].locationAgeMs,240000);
assert(body.logs[4].bootChanged);
assert(cutoff<now&&cutoff>=now-7*86400000-86400000,'calendar boundary must be bounded');
assert(!JSON.stringify(body).includes('103.87654'),'no raw coordinates in logs');
assert(!JSON.stringify(body).includes('SECRET-MUST-NOT-LEAK'),'no arbitrary health keys in logs');
const denied=await betaParent(new Request('https://beta.invalid/parent/api/device/device-b/beta/logs'),env,'device-b','logs');
assert.equal(denied.status,404);
console.log('PASS Phase2 private seven-calendar-day observation logs, pagination, redaction and device isolation');
