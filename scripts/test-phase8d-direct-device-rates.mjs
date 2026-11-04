import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {newDatabase,adapter,ecdsa,addDevice,DEVICE_A} from './phase8d-native-fixture.mjs';
const {default:worker}=await import(pathToFileURL(process.argv[2]).href);
let failures=0;
async function check(name,fn){try{await fn();console.log('PASS P8D-066 '+name);}catch(e){failures++;console.error('FAIL P8D-066 '+name+': '+e.message);}}
async function fixture(mode){
 const db=newDatabase(),key=await ecdsa();addDevice(db,DEVICE_A,key.spki);let queued=0,pushed=0;const keys=[];
 const env={DB:adapter(db),EVENTS:{async send(){queued++;}},BRICK_DEVICE:{idFromName(x){return x;},get(){return{async readSafetyHighWater(){return 0;},async commitSafetyHighWater(){},async pushSafetyEvent(){pushed++;}};}}};
 if(mode!=='missing')env.DEVICE_RATE={async limit({key}){keys.push(key);if(mode==='throw')throw Error('synthetic unavailable');if(mode==='revoked')db.prepare('UPDATE devices SET revoked_at=1 WHERE id=?1').run(DEVICE_A);return{success:mode==='deny'?false:mode==='invalid'?'yes':true};}};
 const send=async(kind,unsigned=false)=>{
  const payload=kind==='fall'?{protocol:1,kind:'fall_detected',eventId:'33333333-3333-4333-8333-333333333333',eventSequence:1,createdAtMs:Date.now(),detail:{confidence:'high'}}:{protocol:1,localDay:new Date().toISOString().slice(0,10),totalForegroundMs:1,sessionCount:1,capturedAtMs:Date.now(),privacy:'aggregate_only_no_package_names'};
  const req=await key.signed('https://brick.invalid/api/device/'+DEVICE_A+(kind==='fall'?'/event':'/screen-time'),payload);if(unsigned)req.headers.delete('X-Brick-Signature');return worker.fetch(req,env,{waitUntil(){}});
 };
 return{db,send,keys,get queued(){return queued;},get pushed(){return pushed;}};
}
for(const kind of ['fall','screen-time'])for(const[mode,status]of[['deny',429],['missing',503],['throw',503],['invalid',429]])await check(kind+' '+mode+' quota refuses before state side effects',async()=>{
 const f=await fixture(mode);try{assert.equal((await f.send(kind)).status,status);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM safety_events').get().n,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM screen_time_daily').get().n,0);assert.equal(f.queued,0);assert.equal(f.pushed,0);}finally{f.db.close();}
});
for(const kind of ['fall','screen-time'])await check(kind+' unsigned request denied before authenticated quota',async()=>{
 const f=await fixture('allow');try{assert.equal((await f.send(kind,true)).status,401);assert.equal(f.keys.length,0);assert.equal(f.queued,0);}finally{f.db.close();}
});
for(const kind of ['fall','screen-time'])await check(kind+' revocation during limiter await still cannot write',async()=>{
 const f=await fixture('revoked');try{assert.equal((await f.send(kind)).status,401);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM safety_events').get().n,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM screen_time_daily').get().n,0);assert.equal(f.pushed,0);}finally{f.db.close();}
});
await check('active handlers use distinct keys and preserve normal success',async()=>{
 const f=await fixture('allow');try{assert.equal((await f.send('fall')).status,200);assert.equal((await f.send('screen-time')).status,200);assert.deepEqual(f.keys,[DEVICE_A+':fall',DEVICE_A+':screen-time']);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM safety_events').get().n,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM screen_time_daily').get().n,1);}finally{f.db.close();}
});
if(failures)process.exitCode=1;
