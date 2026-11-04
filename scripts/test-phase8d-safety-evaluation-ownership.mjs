import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { newDatabase, adapter, ecdsa, addDevice, DEVICE_A } from './phase8d-native-fixture.mjs';
const { evaluateSafetyBatchV6 }=await import(pathToFileURL(process.argv[2]).href);
let failures=0;
async function check(label,fn){try{await fn();console.log('PASS P8D-060 '+label);}catch(e){failures++;console.error('FAIL P8D-060 '+label+': '+e.message);}}
async function fixture(mode){
 const db=newDatabase();addDevice(db,DEVICE_A,(await ecdsa()).spki);const now=Date.now();
 db.prepare("INSERT INTO geofences(id,device_id,name,latitude,longitude,radius_m,enabled,created_at) VALUES('fence',?1,'Synthetic',0,0,100,1,?2)").run(DEVICE_A,now);
 db.prepare("INSERT INTO geofence_state(geofence_id,device_id,stable_state,candidate_state,candidate_since,candidate_count,last_epoch,last_sequence,updated_at) VALUES('fence',?1,'inside','outside',?2,1,1,1,?3)").run(DEVICE_A,now-20_000,now);
 const base=adapter(db);let serial=Promise.resolve(),batches=0,pushed=[];
 const env={DB:{prepare:base.prepare,batch(items){const result=serial.then(()=>{
  if(mode==='contention')db.prepare("UPDATE geofence_state SET last_sequence=last_sequence+1 WHERE geofence_id='fence'").run();
  if(batches++===0){if(mode==='newer')db.prepare("UPDATE geofence_state SET last_sequence=3,candidate_count=7 WHERE geofence_id='fence'").run();if(mode==='trip-newer')db.prepare("UPDATE trips SET last_eval_sequence=3,last_alert_at=999 WHERE id='trip'").run();if(mode==='revoked'||mode==='trip-revoked')db.prepare('UPDATE devices SET revoked_at=1 WHERE id=?1').run(DEVICE_A);}
  return base.batch(items);
 });serial=result.catch(()=>{});return result;}},BRICK_DEVICE:{idFromName(x){return x;},get(){return{async canEvaluateSafety(){return true;},async commitSafetyEvaluation(){},async pushSafetyEvent(e){pushed.push(e);}};}}};
 const packet={epoch:1,sequence:2,wallTimeMs:now,trustedLatE7:13_500_000,trustedLonE7:1_038_000_000,uncertaintyCm:1000,quality:1,activity:1};
 return{db,env,packet,pushed};
}
for(const mode of ['newer','revoked'])await check(mode+' state wins before batch; no stale alert stored/returned/broadcast',async()=>{
 const f=await fixture(mode);try{const events=await evaluateSafetyBatchV6(f.env,DEVICE_A,[f.packet]);assert.equal(events.length,0);assert.equal(f.pushed.length,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM safety_events').get().n,0);const row=f.db.prepare("SELECT last_sequence,candidate_count FROM geofence_state WHERE geofence_id='fence'").get();assert.equal(row.last_sequence,mode==='newer'?3:1);assert.equal(row.candidate_count,mode==='newer'?7:1);}finally{f.db.close();}
});
await check('two simultaneous identical snapshots produce one committed alert and one publication',async()=>{
 const f=await fixture('concurrent');try{const results=await Promise.all([evaluateSafetyBatchV6(f.env,DEVICE_A,[f.packet]),evaluateSafetyBatchV6(f.env,DEVICE_A,[f.packet])]);assert.equal(results.flat().length,1);assert.equal(f.pushed.length,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM safety_events').get().n,1);assert.equal(f.db.prepare("SELECT stable_state FROM geofence_state WHERE geofence_id='fence'").get().stable_state,'outside');}finally{f.db.close();}
});
await check('ordinary qualified transition persists state+event together',async()=>{
 const f=await fixture('active');try{assert.equal((await evaluateSafetyBatchV6(f.env,DEVICE_A,[f.packet])).length,1);assert.equal(f.pushed.length,1);assert.equal(f.db.prepare('PRAGMA foreign_key_check').all().length,0);}finally{f.db.close();}
});
async function tripFixture(mode){
 const f=await fixture(mode);f.db.exec('DELETE FROM geofence_state; DELETE FROM geofences');
 f.db.prepare("INSERT INTO trips(id,device_id,state,destination_name,expected_arrival_at,started_at,last_eval_epoch,last_eval_sequence) VALUES('trip',?1,'active','Synthetic',?2,?3,1,1)").run(DEVICE_A,Date.now()-700_000,Date.now()-800_000);
 return f;
}
for(const mode of ['trip-newer','trip-revoked'])await check(mode+' cannot persist stale overdue alert or change trip state',async()=>{
 const f=await tripFixture(mode);try{assert.equal((await evaluateSafetyBatchV6(f.env,DEVICE_A,[f.packet])).length,0);assert.equal(f.pushed.length,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM safety_events').get().n,0);const row=f.db.prepare("SELECT last_eval_sequence,last_alert_at FROM trips WHERE id='trip'").get();assert.equal(row.last_eval_sequence,mode==='trip-newer'?3:1);assert.equal(row.last_alert_at,mode==='trip-newer'?999:null);}finally{f.db.close();}
});
await check('concurrent identical overdue evaluations publish once',async()=>{
 const f=await tripFixture('trip-concurrent');try{const results=await Promise.all([evaluateSafetyBatchV6(f.env,DEVICE_A,[f.packet]),evaluateSafetyBatchV6(f.env,DEVICE_A,[f.packet])]);assert.equal(results.flat().length,1);assert.equal(f.pushed.length,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM safety_events').get().n,1);}finally{f.db.close();}
});
await check('initial geofence state without prior row persists without phantom alert',async()=>{
 const f=await fixture('active');try{f.db.exec('DELETE FROM geofence_state');assert.equal((await evaluateSafetyBatchV6(f.env,DEVICE_A,[f.packet])).length,0);assert.equal(f.db.prepare("SELECT stable_state FROM geofence_state WHERE geofence_id='fence'").get().stable_state,'outside');assert.equal(f.pushed.length,0);}finally{f.db.close();}
});
await check('multiple transitions in one owned batch retain every legitimate event',async()=>{
 const f=await fixture('active');try{const inside={...f.packet,sequence:3,wallTimeMs:f.packet.wallTimeMs+1000,trustedLatE7:0,trustedLonE7:0};const events=await evaluateSafetyBatchV6(f.env,DEVICE_A,[f.packet,inside,{...inside,sequence:4,wallTimeMs:inside.wallTimeMs+11_000}]);assert.deepEqual(events.map(e=>e.kind),['geofence_exit','geofence_enter']);assert.equal(f.pushed.length,2);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM safety_events').get().n,2);assert.equal(f.db.prepare("SELECT stable_state FROM geofence_state WHERE geofence_id='fence'").get().stable_state,'inside');}finally{f.db.close();}
});
await check('state write failure rolls back earlier event inserts and emits nothing',async()=>{
 const f=await fixture('active');try{f.db.exec("CREATE TRIGGER synthetic_fail BEFORE INSERT ON geofence_state BEGIN SELECT RAISE(ABORT,'synthetic state write failure'); END");await assert.rejects(evaluateSafetyBatchV6(f.env,DEVICE_A,[f.packet]),/synthetic state write failure/);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM safety_events').get().n,0);assert.equal(f.db.prepare("SELECT last_sequence FROM geofence_state WHERE geofence_id='fence'").get().last_sequence,1);assert.equal(f.pushed.length,0);}finally{f.db.close();}
});
await check('different concurrent snapshots re-read losing newer work instead of silently skipping it',async()=>{
 const f=await fixture('active');try{
 let firstDone;const first=new Promise(r=>{firstDone=r;});const prepare=f.env.DB.prepare,batch=f.env.DB.batch;
 f.env.DB.prepare=sql=>({bind(...args){return Object.assign(prepare(sql).bind(...args),{auditSequence:sql.startsWith('INSERT INTO geofence_state')?args[9]:null});}});
 f.env.DB.batch=items=>{if(items.some(x=>x.auditSequence===3))return first.then(()=>batch(items));const result=batch(items);result.then(firstDone,firstDone);return result;};
 await Promise.all([evaluateSafetyBatchV6(f.env,DEVICE_A,[f.packet]),evaluateSafetyBatchV6(f.env,DEVICE_A,[{...f.packet,sequence:3,wallTimeMs:f.packet.wallTimeMs+1000,trustedLatE7:0,trustedLonE7:0}])]);const row=f.db.prepare("SELECT last_sequence,stable_state,candidate_state,candidate_count FROM geofence_state WHERE geofence_id='fence'").get();assert.deepEqual({...row},{last_sequence:3,stable_state:'outside',candidate_state:'inside',candidate_count:1});assert.equal(f.pushed.length,1);}finally{f.db.close();}
});
await check('sustained CAS contention fails after bounded retries without alert or false marker advancement',async()=>{
 const f=await fixture('contention');try{await assert.rejects(evaluateSafetyBatchV6(f.env,DEVICE_A,[{...f.packet,sequence:100}]),/safety evaluation contention; retry/);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM safety_events').get().n,0);assert.equal(f.pushed.length,0);assert.equal(f.db.prepare("SELECT last_sequence FROM geofence_state WHERE geofence_id='fence'").get().last_sequence,4);}finally{f.db.close();}
});
if(failures)process.exitCode=1;
