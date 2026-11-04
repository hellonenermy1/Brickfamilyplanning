import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { newDatabase, adapter, ecdsa, addDevice, DEVICE_A } from './phase8d-native-fixture.mjs';
import { deviceState } from './phase8d-do-state-fixture.mjs';
const { default: worker, BrickDevice }=await import(pathToFileURL(process.argv[2]).href);
const ID='33333333-3333-4333-8333-333333333333',OTHER='44444444-4444-4444-8444-444444444444';
let failures=0;
async function check(label,fn){try{await fn();console.log('PASS '+label);}catch(e){failures++;console.error('FAIL '+label+': '+e.message);}}
async function fixture(initialHigh=0){
 const db=newDatabase(),key=await ecdsa();addDevice(db,DEVICE_A,key.spki);const state=deviceState({safetyHighWater:initialHigh}),actual=new BrickDevice(state,{});let queues=0;
 const env={DB:adapter(db),EVENTS:{async send(){queues++;}},DEVICE_RATE:{async limit(){return{success:true};}},BRICK_DEVICE:{idFromName(x){return x;},get(){return actual;}}};
 const createdAt=Date.now();const send=async(extra={})=>worker.fetch(await key.signed('https://brick.invalid/api/device/'+DEVICE_A+'/event',{protocol:1,kind:'fall_detected',eventId:ID,eventSequence:10,createdAtMs:createdAt,latitude:1.35,longitude:103.8,accuracyM:10,detail:{confidence:'high',nested:{a:1,b:2}},...extra}),env,{waitUntil(){}});
 return{db,state,actual,send,get queues(){return queues;}};
}
for(const kind of ['fall_detected','sos_started'])for(const [label,extra] of [
 ['timestamp',{createdAtMs:Date.now()-1000}],['coordinates',{latitude:1.4}],['accuracy',{accuracyM:99}],['detail',{detail:{confidence:'high',nested:{a:99,b:2}}}]
])await check('P8D-061 same UUID changed '+label+' conflicts: '+kind,async()=>{
 const f=await fixture();try{assert.equal((await f.send({kind})).status,200);const before=f.db.prepare('SELECT * FROM safety_events').get();assert.equal((await f.send({kind,...extra})).status,409);assert.deepEqual(f.db.prepare('SELECT * FROM safety_events').get(),before);}finally{f.db.close();}
});
await check('P8D-061 semantically identical detail with different object key order remains duplicate',async()=>{
 const f=await fixture();try{assert.equal((await f.send()).status,200);const r=await f.send({detail:{nested:{b:2,a:1},confidence:'high'}});assert.equal(r.status,200);assert.equal((await r.json()).duplicate,true);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM safety_events').get().n,1);}finally{f.db.close();}
});
for(const kind of ['fall_detected','sos_started'])await check('P8D-061 array order/type remain immutable: '+kind,async()=>{
 const f=await fixture();try{assert.equal((await f.send({kind,detail:{confidence:'high',items:[1,2]}})).status,200);assert.equal((await f.send({kind,detail:{confidence:'high',items:[2,1]}})).status,409);assert.equal((await f.send({kind,detail:{confidence:'high',items:{0:1,1:2}}})).status,409);}finally{f.db.close();}
});
await check('P8D-062 older queued fall survives a higher delivered fall sequence',async()=>{
 const f=await fixture();try{assert.equal((await f.send({eventSequence:20})).status,200);assert.equal((await f.send({eventId:OTHER,eventSequence:19})).status,200);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM safety_events').get().n,2);assert.equal(await f.actual.readSafetyHighWater(),20);}finally{f.db.close();}
});
await check('P8D-062 reconstructed DO diagnostic high-water does not discard valid UUID',async()=>{
 const f=await fixture(100);try{assert.equal((await f.send({eventSequence:99})).status,200);assert.equal((await f.send({eventSequence:99})).status,200);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM safety_events').get().n,1);}finally{f.db.close();}
});
await check('P8D-062 stale timestamp still refused despite distinct valid UUID',async()=>{
 const f=await fixture(100);try{assert.equal((await f.send({createdAtMs:Date.now()-31*86_400_000})).status,409);assert.equal(f.queues,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM safety_events').get().n,0);}finally{f.db.close();}
});
if(failures)process.exitCode=1;
