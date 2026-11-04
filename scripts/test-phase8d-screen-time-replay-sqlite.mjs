import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
import {newDatabase,adapter,ecdsa,addDevice,DEVICE_A} from "./phase8d-native-fixture.mjs";
const {ingestScreenTime}=await import(pathToFileURL(process.argv[2]).href);
const db=newDatabase();
try{
 const keys=await ecdsa();addDevice(db,DEVICE_A,keys.spki);
 const env={DB:adapter(db),DEVICE_RATE:{async limit(){return{success:true};}}};
 const now=Date.now(),day=new Date(now).toISOString().slice(0,10);
 const payload=(captured,total)=>({protocol:1,localDay:day,totalForegroundMs:total,sessionCount:2,capturedAtMs:captured,privacy:"aggregate_only_no_package_names"});
 const req=(p)=>keys.signed("https://brick.invalid/api/device/"+DEVICE_A+"/screen-time",p);
 const response1=await ingestScreenTime(await req(payload(now-15000,800000)),env,DEVICE_A);
 assert.equal(response1.status,200);
 const original=db.prepare("SELECT total_foreground_ms FROM screen_time_daily WHERE device_id=?1").get(DEVICE_A);
 assert.equal(original.total_foreground_ms,800000);
 const stale=await ingestScreenTime(await req(payload(now-30000,400000)),env,DEVICE_A);
 assert.equal(stale.status,200,"stale authentic report should be idempotent and not affect high-water data");
 assert.equal(db.prepare("SELECT total_foreground_ms FROM screen_time_daily WHERE device_id=?1").get(DEVICE_A).total_foreground_ms,800000,"older signed capture overwrote newer screen-time daily result");
 const newer=await ingestScreenTime(await req(payload(now-4000,930000)),env,DEVICE_A);
 assert.equal(newer.status,200);
 assert.equal(db.prepare("SELECT total_foreground_ms FROM screen_time_daily WHERE device_id=?1").get(DEVICE_A).total_foreground_ms,930000);
 for(const bad of ["null","[]","41"]){
  const response=await ingestScreenTime(await req(bad),env,DEVICE_A);
  assert.equal(response.status,400,"primitive JSON threw or accepted as aggregate");
 }
 // Revoke after auth SELECT, before signed payload verification and D1 write.
 db.prepare("DELETE FROM screen_time_daily WHERE device_id=?1").run(DEVICE_A);
 let once=true;
 const hook=async(sql,args)=>{
  if(once&&sql.includes("SELECT public_key_spki_b64,revoked_at FROM devices")){
    once=false;
    db.prepare("UPDATE devices SET revoked_at=?1 WHERE id=?2").run(now,DEVICE_A);
  }
 };
 const denied=await ingestScreenTime(await req(payload(now-2000,990000)),{...env,DB:adapter(db,hook)},DEVICE_A);
 assert.equal(denied.status,401,"post-auth revocation must be rejected");
 assert.equal(db.prepare("SELECT COUNT(*) n FROM screen_time_daily WHERE device_id=?1").get(DEVICE_A).n,0,"revoked device inserted aggregate");
 console.log("PASS P8D-019 screen-time: current > stale signed capture, JSON scalars rejected, post-auth revocation cannot insert");
}finally{db.close();}
