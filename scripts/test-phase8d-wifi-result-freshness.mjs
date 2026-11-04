import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
import {newDatabase,adapter,addDevice,DEVICE_A} from "./phase8d-native-fixture.mjs";
const {noteP8BHealth}=await import(pathToFileURL(process.argv[2]).href);
const db=newDatabase(),now=Date.now(),id="weekday";
try{
 addDevice(db,DEVICE_A,"key-wifi");
 db.prepare("INSERT INTO device_wifi_schedules(id,device_id,enabled,target_enabled,local_minute_of_day,days_mask,grace_minutes,updated_at) VALUES(?1,?2,1,0,1320,127,15,?3)").run(id,DEVICE_A,now);
 const env={DB:adapter(db)};
 const send=async(scheduleId,attemptedAtMs,status="completed")=>noteP8BHealth(new Request("https://brick.invalid/api/device/"+DEVICE_A+"/health",{method:"POST",body:JSON.stringify({wifiScheduleResult:{scheduleId,targetEnabled:false,actualEnabled:false,status,attemptedAtMs}})}),env,DEVICE_A);
 await send(id,now-1000);
 assert.equal(db.prepare("SELECT attempted_at FROM device_wifi_schedule_result WHERE device_id=?1").get(DEVICE_A).attempted_at,now-1000);
 await send(id,now-5000,"failed");
 const after=db.prepare("SELECT schedule_id,status,attempted_at FROM device_wifi_schedule_result WHERE device_id=?1").get(DEVICE_A);
 assert.equal(after.attempted_at,now-1000,"stale Wi-Fi schedule result overwrote newer result");
 assert.equal(after.status,"completed");
 await send("removed-schedule",now+1000);
 assert.equal(db.prepare("SELECT schedule_id FROM device_wifi_schedule_result WHERE device_id=?1").get(DEVICE_A).schedule_id,id,"report from nonconfigured schedule updated live control");
 db.prepare("UPDATE devices SET revoked_at=?1 WHERE id=?2").run(now,DEVICE_A);
 await send(id,now+2000);
 assert.equal(db.prepare("SELECT attempted_at FROM device_wifi_schedule_result WHERE device_id=?1").get(DEVICE_A).attempted_at,now-1000,"revoked device updated Wi-Fi result");
 console.log("PASS 8D.13 Wi-Fi schedule results monotonic, current schedule bound, revoked-device fenced");
}finally{db.close();}
