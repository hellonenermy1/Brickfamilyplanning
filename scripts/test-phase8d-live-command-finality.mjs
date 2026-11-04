import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
import {newDatabase,adapter,addDevice,DEVICE_A} from "./phase8d-native-fixture.mjs";
const {noteP8BHealth}=await import(pathToFileURL(process.argv[2]).href);
const db=newDatabase(),now=Date.now(),command="live-track-abcdef";
try{
 addDevice(db,DEVICE_A,"key-live");
 db.prepare("INSERT INTO device_live_track_control(device_id,command_id,requested_active,issued_at,expires_at,command_status) VALUES(?1,?2,1,?3,?4,'pending')").run(DEVICE_A,command,now-1000,now+60000);
 const env={DB:adapter(db)};
 const send=async(status,id=command)=>noteP8BHealth(new Request("https://brick.invalid/api/device/"+DEVICE_A+"/health",{method:"POST",body:JSON.stringify({liveTrackCommandId:id,liveTrackCommandStatus:status,liveTrackActive:true})}),env,DEVICE_A);
 await send("completed");
 assert.equal(db.prepare("SELECT command_status FROM device_live_track_control WHERE device_id=?1").get(DEVICE_A).command_status,"completed");
 await send("failed");
 assert.equal(db.prepare("SELECT command_status FROM device_live_track_control WHERE device_id=?1").get(DEVICE_A).command_status,"completed","later signed health overwrote terminal command state");
 await send("completed","other-live-abcdefgh");
 assert.equal(db.prepare("SELECT command_status FROM device_live_track_control WHERE device_id=?1").get(DEVICE_A).command_status,"completed");
 db.prepare("UPDATE device_live_track_control SET command_status='expired',completed_at=?2 WHERE device_id=?1").run(DEVICE_A,now);
 await send("completed");
 assert.equal(db.prepare("SELECT command_status FROM device_live_track_control WHERE device_id=?1").get(DEVICE_A).command_status,"expired","late command result revived expired live-track request");
 console.log("PASS 8D.13 live-track command terminal state immutable under signed replay, wrong ID and expiry");
}finally{db.close();}
