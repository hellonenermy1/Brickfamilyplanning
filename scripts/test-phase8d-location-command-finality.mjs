import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
import {newDatabase,adapter,addDevice,DEVICE_A} from "./phase8d-native-fixture.mjs";
const {noteLocationControlHealth,parentGetLocationControl}=await import(pathToFileURL(process.argv[2]).href);
const db=newDatabase(),now=Date.now(),cmd="command-abcdef-12345678";
try{
 addDevice(db,DEVICE_A,"key-loc");
 db.prepare("INSERT INTO device_location_control(device_id,desired_enabled,command_id,issued_at,updated_at,command_status) VALUES(?1,1,?2,?3,?3,'pending')").run(DEVICE_A,cmd,now-1000);
 const env={DB:adapter(db)};
 const send=async(status,id=cmd,complete=now)=>noteLocationControlHealth(new Request("https://brick.invalid/api/device/"+DEVICE_A+"/health",{method:"POST",body:JSON.stringify({locationEnabled:true,locationControlCommandId:id,locationControlCommandStatus:status,locationControlActualAfter:true,locationControlCompletedAtMs:complete})}),env,DEVICE_A);
 await send("completed");
 assert.equal(db.prepare("SELECT command_status FROM device_location_control WHERE device_id=?1").get(DEVICE_A).command_status,"completed");
 const previous=db.prepare("SELECT completed_at FROM device_location_control WHERE device_id=?1").get(DEVICE_A).completed_at;
 await send("failed");
 assert.equal(db.prepare("SELECT command_status FROM device_location_control WHERE device_id=?1").get(DEVICE_A).command_status,"completed","old signed command result rewrote terminal completion");
 assert.equal(db.prepare("SELECT completed_at FROM device_location_control WHERE device_id=?1").get(DEVICE_A).completed_at,previous);
 await send("completed","other-command-9999");
 assert.equal(db.prepare("SELECT last_acked_command_id FROM device_location_control WHERE device_id=?1").get(DEVICE_A).last_acked_command_id,cmd);
 db.prepare("UPDATE device_location_control SET issued_at=?1,command_status='pending',completed_at=NULL WHERE device_id=?2").run(now-11*60_000,DEVICE_A);
 const expired=await parentGetLocationControl(env,DEVICE_A);
 assert.equal((await expired.json()).lastCommand.status,"expired");
 await send("completed");
 assert.equal(db.prepare("SELECT command_status FROM device_location_control WHERE device_id=?1").get(DEVICE_A).command_status,"expired","late command confirmation resurrected expired command");
 console.log("PASS 8D.13 location-control terminal command statuses immutable; wrong command ignored; expired cannot revive (SQLite source only)");
}finally{db.close();}
