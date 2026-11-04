import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
import {newDatabase,adapter,addDevice,DEVICE_A} from "./phase8d-native-fixture.mjs";
const {noteP8BHealth}=await import(pathToFileURL(process.argv[2]).href);
const db=newDatabase(),now=Date.now();
try{
 addDevice(db,DEVICE_A,"key-profile");
 const env={DB:adapter(db)};
 const send=async(version,updatedAtMs,batteryOptimizationExempt)=>noteP8BHealth(new Request("https://brick.invalid/api/device/"+DEVICE_A+"/health",{method:"POST",body:JSON.stringify({capabilityProfile:{version,updatedAtMs,batteryOptimizationExempt}})}),env,DEVICE_A);
 await send(2,now-1000,true);
 let row=db.prepare("SELECT profile_version,device_updated_at,profile_json FROM device_capability_profile WHERE device_id=?1").get(DEVICE_A);
 assert.equal(row.profile_version,2);
 await send(1,now-2000,false);
 row=db.prepare("SELECT profile_version,device_updated_at,profile_json FROM device_capability_profile WHERE device_id=?1").get(DEVICE_A);
 assert.equal(row.profile_version,2,"old profile version overwrote newer capabilities");
 assert.equal(row.device_updated_at,now-1000);
 await send(2,now-3000,false);
 assert.equal(db.prepare("SELECT device_updated_at FROM device_capability_profile WHERE device_id=?1").get(DEVICE_A).device_updated_at,now-1000,"older same-version capture won");
 db.prepare("UPDATE devices SET revoked_at=?1 WHERE id=?2").run(now,DEVICE_A);
 await send(3,now,true);
 assert.equal(db.prepare("SELECT profile_version FROM device_capability_profile WHERE device_id=?1").get(DEVICE_A).profile_version,2,"revoked device capability changed");
 console.log("PASS 8D.3/.13 capability profile version/time monotonic and revoked-device write blocked");
}finally{db.close();}
