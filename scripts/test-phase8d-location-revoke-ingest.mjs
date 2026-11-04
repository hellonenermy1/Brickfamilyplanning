import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
import {newDatabase,adapter,ecdsa,addDevice,DEVICE_A} from "./phase8d-native-fixture.mjs";
const {persistAccepted,ingestLocationV6,previewLatestLocationV6}=await import(pathToFileURL(process.argv[2]).href);
const db=newDatabase();
try{
 const key=await ecdsa();addDevice(db,DEVICE_A,key.spki);
 let doCalls=0,queueCalls=0;
 const env={DB:adapter(db),MAPS:{},EVENTS:{async send(){queueCalls++},async sendBatch(){queueCalls++}},
 BRICK_DEVICE:{idFromName(x){return x},get(){return {async setLatest(){doCalls++;return true}}}},
 DEVICE_RATE:{async limit(){return {success:true}}}};
 const now=Date.now();
 const p={version:1,epoch:1,sequence:1,wallTimeMs:now-1000,trustedLatE7:13500000,trustedLonE7:1038000000,
  uncertaintyCm:11000,rawLatE7:13500000,rawLonE7:1038000000,rawAccepted:true,rawMock:false,quality:5,source:1};
 const normal=await persistAccepted(env,DEVICE_A,[p]);assert.equal(normal.insertedCount,1);assert.equal(doCalls,1);
 db.prepare("UPDATE devices SET revoked_at=?1 WHERE id=?2").run(now,DEVICE_A);
 const rejected=await persistAccepted(env,DEVICE_A,[{...p,sequence:2,wallTimeMs:now}]);
 assert.equal(rejected.revoked,true,"revoked device must be refused by atomic D1 insert");
 assert.equal(db.prepare("SELECT COUNT(*) n FROM device_events WHERE device_id=?1").get(DEVICE_A).n,1);
 assert.equal(doCalls,1,"revoked device wrote DO state");
 db.prepare("UPDATE devices SET revoked_at=NULL WHERE id=?1").run(DEVICE_A);
 const bytes=new ArrayBuffer(43),v=new DataView(bytes);
 v.setUint8(0,1);v.setUint32(1,2);v.setBigUint64(5,3n);v.setBigUint64(13,1000n);
 v.setBigUint64(21,BigInt(now));v.setInt32(29,13500000);v.setInt32(33,1038000000);
 v.setUint32(37,15000);v.setUint8(41,80);v.setUint8(42,0);
 const signature=Buffer.from(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key.pair.privateKey,bytes)).toString("base64");
 const request=path=>new Request("https://brick.invalid/api/device/"+DEVICE_A+path,{method:"POST",headers:{"X-Brick-Signature":signature},body:bytes.slice(0)});
 let triggered=false;
 const raced={...env,DB:adapter(db,(sql)=>{
  if(!triggered&&sql.includes("SELECT public_key_spki_b64,revoked_at FROM devices")){
   triggered=true;db.prepare("UPDATE devices SET revoked_at=?1 WHERE id=?2").run(now,DEVICE_A);
  }
 })};
 const race=await ingestLocationV6(request("/location"),raced,DEVICE_A);
 assert.equal(race.status,401,"ingest authorized using stale device state and ACKed revoked child");
 assert.equal(queueCalls,0,"revoked device wrote future history queue");
 assert.equal(doCalls,1,"revoked ingest mutated parent-visible DO");
 assert.equal(db.prepare("SELECT COUNT(*) n FROM device_events WHERE device_id=?1").get(DEVICE_A).n,1);
 db.prepare("UPDATE devices SET revoked_at=NULL WHERE id=?1").run(DEVICE_A);
 triggered=false;
 const preview=await previewLatestLocationV6(request("/location/live"),raced,DEVICE_A);
 assert.equal(preview.status,401,"live preview after revocation may not update parent DO");
 assert.equal(doCalls,1,"revoked live preview changed parent state");
 console.log("PASS P8D-021 revoked D1 atomic ingest and Queue/DO fences, active replay; live Cloudflare race still pending");
}finally{db.close();}
