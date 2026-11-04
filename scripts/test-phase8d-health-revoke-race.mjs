import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
import {newDatabase,adapter,ecdsa,addDevice,DEVICE_A} from "./phase8d-native-fixture.mjs";
const {reserveHealthReplay}=await import(pathToFileURL(process.argv[2]).href);
const db=newDatabase();
try{
 const k=await ecdsa();addDevice(db,DEVICE_A,k.spki);
 const now=Date.now(),url="https://brick.invalid/api/device/"+DEVICE_A+"/health";
 const request=(seq)=>k.signed(url,{protocol:1,healthSequence:seq,healthSentAtMs:now});
 const env={DB:adapter(db)};
 assert.equal(await reserveHealthReplay(await request(50),env,DEVICE_A,now),null);
 assert.equal(db.prepare("SELECT last_health_sequence FROM device_replay_state WHERE device_id=?1").get(DEVICE_A).last_health_sequence,50);
 let once=true;
 const raced={DB:adapter(db,(sql)=>{
  if(once&&sql.includes("SELECT public_key_spki_b64,revoked_at FROM devices")){
   once=false;db.prepare("UPDATE devices SET revoked_at=?1 WHERE id=?2").run(now,DEVICE_A);
  }
 })};
 const denied=await reserveHealthReplay(await request(51),raced,DEVICE_A,now);
 assert.equal(denied?.status,401,"health replay state advanced after device revocation");
 assert.equal(db.prepare("SELECT last_health_sequence FROM device_replay_state WHERE device_id=?1").get(DEVICE_A).last_health_sequence,50);
 assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);
 console.log("PASS P8D-020: strict revoked-device atomic health replay watermark and no unauthorized updates");
}finally{db.close();}
