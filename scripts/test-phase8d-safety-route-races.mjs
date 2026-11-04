import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { newDatabase, adapter, ecdsa, addDevice, DEVICE_A, DEVICE_B } from './phase8d-native-fixture.mjs';
const { default: worker } = await import(pathToFileURL(process.argv[2]).href);
const EVENT='33333333-3333-4333-8333-333333333333';
let failures=0;
async function check(name,fn){try{await fn();console.log('PASS '+name);}catch(e){failures++;console.error('FAIL '+name+': '+e.message);}}
async function fixture({revokeInQueue=false,revokeAtLastAuth=false,collision=false}={}){
 const db=newDatabase(),key=await ecdsa();addDevice(db,DEVICE_A,key.spki);
 if(collision){addDevice(db,DEVICE_B,(await ecdsa()).spki);db.prepare("INSERT INTO safety_events(id,device_id,kind,device_created_at,server_created_at,detail_json) VALUES(?1,?2,'sos',1,1,'{}')").run(EVENT,DEVICE_B);}
 let sends=0,pushes=0,authReads=0;
 const env={DB:adapter(db,(sql)=>{if(sql.includes('SELECT public_key_spki_b64,revoked_at')){authReads++;if(revokeAtLastAuth&&authReads===3)db.prepare('UPDATE devices SET revoked_at=1 WHERE id=?1').run(DEVICE_A);}}),
  EVENTS:{async send(){sends++;if(revokeInQueue)db.prepare('UPDATE devices SET revoked_at=1 WHERE id=?1').run(DEVICE_A);}},
  DEVICE_RATE:{async limit(){return{success:true};}},BRICK_DEVICE:{idFromName(x){return x;},get(){return{async readSafetyHighWater(){return 0;},async commitSafetyHighWater(){},async pushSafetyEvent(){pushes++;}};}}};
 const send=async(extra={})=>worker.fetch(await key.signed('https://brick.invalid/api/device/'+DEVICE_A+'/event',{protocol:1,kind:'fall_detected',eventId:EVENT,eventSequence:1,createdAtMs:Date.now(),detail:{confidence:'high'},...extra}),env,{waitUntil(){}});
 return{db,send,get sends(){return sends;},get pushes(){return pushes;},get authReads(){return authReads;}};
}
await check('P8D-057 fall revoked during Queue send returns401 without D1/DO event',async()=>{
 const f=await fixture({revokeInQueue:true});try{const r=await f.send();assert.equal(r.status,401);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM safety_events').get().n,0);assert.equal(f.pushes,0);}finally{f.db.close();}
});
await check('P8D-057 ordinary safety event revoked after final auth read returns401',async()=>{
 const f=await fixture({revokeAtLastAuth:true});try{const r=await f.send({kind:'sos_started'});assert.equal(f.authReads,3);assert.equal(r.status,401);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM safety_events').get().n,0);assert.equal(f.pushes,0);}finally{f.db.close();}
});
for(const kind of ['fall_detected','sos_started'])await check('P8D-058 global event-ID collision never falsely ACKs another device: '+kind,async()=>{
 const f=await fixture({collision:true});try{assert.equal((await f.send({kind})).status,409);assert.equal(f.pushes,0);assert.equal(f.db.prepare('SELECT device_id FROM safety_events WHERE id=?1').get(EVENT).device_id,DEVICE_B);}finally{f.db.close();}
});
for(const [label,extra] of [
 ['unpaired latitude',{latitude:1.35}],['unpaired longitude',{longitude:103.8}],['invalid latitude',{latitude:91,longitude:1}],['invalid longitude',{latitude:1,longitude:181}],['string coordinate',{latitude:'1',longitude:1}],['negative accuracy',{latitude:1,longitude:1,accuracyM:-1}],['scalar accuracy',{accuracyM:'10'}]
])await check('P8D-059 malformed fall '+label+' rejected before Queue/D1/DO',async()=>{
 const f=await fixture();try{assert.equal((await f.send(extra)).status,400);assert.equal(f.sends,0);assert.equal(f.pushes,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM safety_events').get().n,0);}finally{f.db.close();}
});
await check('P8D-057/059 active valid0,0 fall persists and exact retry is duplicate',async()=>{
 const f=await fixture();try{assert.equal((await f.send({latitude:0,longitude:0,accuracyM:0})).status,200);const row=f.db.prepare('SELECT latitude,longitude,accuracy_m FROM safety_events').get();assert.deepEqual({...row},{latitude:0,longitude:0,accuracy_m:0});assert.equal((await(await f.send({latitude:0,longitude:0,accuracyM:0})).json()).duplicate,true);assert.equal(f.pushes,1);}finally{f.db.close();}
});
if(failures)process.exitCode=1;
