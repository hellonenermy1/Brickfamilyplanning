import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {pathToFileURL} from "node:url";
import {newDatabase,adapter,ecdsa,addDevice,DEVICE_A} from "./phase8d-native-fixture.mjs";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const {ingestLocationV6}=await import(pathToFileURL(process.argv[2]).href);
const db=newDatabase();
try{
 const k=await ecdsa();addDevice(db,DEVICE_A,k.spki);
 const now=Date.now(),bytes=new ArrayBuffer(43),v=new DataView(bytes);
 v.setUint8(0,1);v.setUint32(1,3);v.setBigUint64(5,100n);v.setBigUint64(13,1000n);
 v.setBigUint64(21,BigInt(now-1000));v.setInt32(29,13500000);v.setInt32(33,1038000000);
 v.setUint32(37,15000);v.setUint8(41,70);v.setUint8(42,0);
 const signature=Buffer.from(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},k.pair.privateKey,bytes)).toString("base64");
 const req=()=>new Request("https://brick.invalid/api/device/"+DEVICE_A+"/location",{method:"POST",headers:{"X-Brick-Signature":signature},body:bytes.slice(0)});
 let queueDown=true,queued=0,live=0;
 const stub={async setLatest(){live++;return true},async canEvaluateSafety(){return false}};
 const env={DB:adapter(db),MAPS:{},BRICK_DEVICE:{idFromName(x){return x},get(){return stub}},
 DEVICE_RATE:{async limit(){return {success:true}}},
 EVENTS:{async send(){if(queueDown)throw Error("Queue temporarily unavailable");queued++}}};
 let failed=await ingestLocationV6(req(),env,DEVICE_A);
 assert.equal(failed.status,503,"Queue outage must not create false HTTP ACK");
 assert.equal(db.prepare("SELECT COUNT(*) n FROM device_events WHERE device_id=?1").get(DEVICE_A).n,1,"D1 acceptance must survive Queue failure for later retry");
 assert.equal(queued,0);assert.equal(live,0,"DO published a location that is not in Queue/R2 durable history");
 queueDown=false;
 let accepted=await ingestLocationV6(req(),env,DEVICE_A);
 assert.equal(accepted.status,200,"original signed sample retry must recover without manual repair");
 assert.equal(queued,1);
 assert.equal(live,1,"successful Queue retry should repair live DO even when D1 saw the packet before");
 assert.equal(db.prepare("SELECT COUNT(*) n FROM device_events WHERE device_id=?1").get(DEVICE_A).n,1,"retries must not duplicate durable D1 event");
 console.log("PASS P8D-024 real signed V1+SQLite: no early DO visibility before Queue success; D1→Queue 503 replays and repairs live exactly once");
}finally{db.close();}
