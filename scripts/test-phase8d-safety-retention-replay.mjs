import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import {newDatabase,adapter,ecdsa,addDevice,DEVICE_A,DEVICE_B} from './phase8d-native-fixture.mjs';
const {runRetentionCleanup}=await import(pathToFileURL(process.argv[2]).href);
const {default:worker}=await import(pathToFileURL(process.argv[3]).href);
const db=newDatabase(),realNow=Date.now,now=realNow(),day=86_400_000;
Date.now=()=>now;
try{
 const key=await ecdsa();addDevice(db,DEVICE_A,key.spki);addDevice(db,DEVICE_B,(await ecdsa()).spki);
 db.prepare('INSERT INTO retention_settings VALUES(?1,30,?2)').run(DEVICE_A,now);
 db.prepare('INSERT INTO retention_settings VALUES(?1,365,?2)').run(DEVICE_B,now);
 const cases=[['33333333-3333-4333-8333-333333333333',DEVICE_A,now-30*day+60_000,now-30*day-60_000],['44444444-4444-4444-8444-444444444444',DEVICE_A,now-30*day,now-30*day-1],['55555555-5555-4555-8555-555555555555',DEVICE_A,now-30*day-1,now-30*day-1],['66666666-6666-4666-8666-666666666666',DEVICE_B,now-31*day,now-31*day]];
 for(const[id,owner,created,received]of cases)db.prepare("INSERT INTO safety_events(id,device_id,kind,device_created_at,server_created_at,detail_json) VALUES(?1,?2,'fall_detected',?3,?4,'{\"confidence\":\"high\"}')").run(id,owner,created,received);
 await runRetentionCleanup({DB:adapter(db)});
 assert(db.prepare('SELECT id FROM safety_events WHERE id=?1').get(cases[0][0]),'deleted UUID while signed future-skew timestamp remained replay-valid');
 assert(db.prepare('SELECT id FROM safety_events WHERE id=?1').get(cases[1][0]),'deleted UUID at inclusive replay-window boundary');
 assert.equal(db.prepare('SELECT id FROM safety_events WHERE id=?1').get(cases[2][0]),undefined,'fully expired minimum-policy row retained');
 assert(db.prepare('SELECT id FROM safety_events WHERE id=?1').get(cases[3][0]),'ignored another device365-day policy');
 let queues=0,pushes=0;
 const env={DB:adapter(db),EVENTS:{async send(){queues++;}},DEVICE_RATE:{async limit(){return{success:true};}},BRICK_DEVICE:{idFromName(x){return x;},get(){return{async readSafetyHighWater(){return 0;},async commitSafetyHighWater(){},async pushSafetyEvent(){pushes++;}};}}};
 const request=await key.signed('https://brick.invalid/api/device/'+DEVICE_A+'/event',{protocol:1,kind:'fall_detected',eventId:cases[0][0],eventSequence:1,createdAtMs:cases[0][2],detail:{confidence:'high'}});
 const r=await worker.fetch(request,env,{waitUntil(){}});assert.equal(r.status,200);assert.equal((await r.json()).duplicate,true);assert.equal(queues,0);assert.equal(pushes,0);
 console.log('PASS P8D-064 native SQLite retention: future-skew replay validity, inclusive30-day boundary, expired deletion, per-device365-day policy and signed retry remains duplicate without new Queue/DO publication');
}finally{Date.now=realNow;db.close();}
