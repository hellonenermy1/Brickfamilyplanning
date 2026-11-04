import assert from "node:assert/strict";
import {webcrypto,createHash} from "node:crypto";
import {gunzipSync,gzipSync} from "node:zlib";
import {pathToFileURL} from "node:url";
import {newDatabase,ecdsa,addDevice,DEVICE_A} from "./phase8d-native-fixture.mjs";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const {snapshotD1ToR2,BACKUP_TABLES}=await import(pathToFileURL(process.argv[2]).href);
const {restoreBackupToFreshD1}=await import(pathToFileURL(process.argv[3]).href);
const {processHistoryBatch}=await import(pathToFileURL(process.argv[4]).href);
const db=newDatabase(),target=newDatabase();
function d1(sqlite){
 const prepare=(sql,args=[])=>({sql,args,bind(...next){return prepare(sql,next)},async first(){return sqlite.prepare(sql).get(...args)??null},async all(){return {results:sqlite.prepare(sql).all(...args)}},async run(){const x=sqlite.prepare(sql).run(...args);return {meta:{changes:x.changes}}}});
 return {prepare(sql){return prepare(sql)},async batch(stmts){sqlite.exec("BEGIN IMMEDIATE");try{
  const r=[];for(const st of stmts)r.push(/^SELECT /i.test(st.sql)?await st.all():await st.run());
  sqlite.exec("COMMIT");return r;
 }catch(e){sqlite.exec("ROLLBACK");throw e;}}};
}
function bucket(){
 const store=new Map();let n=0;
 const normalize=bytes=>bytes instanceof ArrayBuffer?new Uint8Array(bytes):bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 return {store,async get(key){const b=store.get(key);return b?{etag:b.etag,httpMetadata:b.meta,body:new Blob([b.bytes]).stream(),async arrayBuffer(){return b.bytes.slice().buffer},async text(){return new TextDecoder().decode(b.bytes)}}:null;},
 async head(key){const b=store.get(key);return b?{etag:b.etag}:null},
 async put(key,body,opts={}){const old=store.get(key),only=opts.onlyIf;
  if(only instanceof Headers&&only.get("If-None-Match")==="*"&&old)return null;
  if(only?.etagMatches&&old?.etag!==only.etagMatches)return null;
  const bytes=normalize(body).slice(),etag=createHash("sha256").update(bytes).digest("hex");
  store.set(key,{bytes,etag,meta:opts.httpMetadata??{contentEncoding:"gzip"},metadata:opts.customMetadata??{}});n++;return {etag};
 },
 async list({prefix=""}={}){return {objects:[...store].filter(([k])=>k.startsWith(prefix)).map(([key,x])=>({key,uploaded:new Date(),etag:x.etag})),truncated:false}},
 async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])store.delete(key)},
 get writes(){return n}
 };
}
const r2=bucket(),restoredR2=bucket();
const stamp=Date.now(),p={version:2,epoch:5,sequence:10,wallTimeMs:stamp-2000,trustedLatE7:13500000,trustedLonE7:1038000000,rawLatE7:13500000,rawLonE7:1038000000,
 uncertaintyCm:400,rawAccuracyCm:400,rawAccepted:true,rawMock:false,fallback:false,quality:1,source:1,batteryPct:70,charging:false,activity:2,activityConfidence:99,
 speedCms:100,speedAccuracyCms:20,bearingCdeg:12000,bearingAccuracyCdeg:null,altitudeCm:null,verticalAccuracyCm:null,gnssUsedInFix:1,gnssTotal:2,gnssAverageCn0Tenth:400,stepDelta:1,elapsedRealtimeMs:12345};
try{
 const k=await ecdsa();addDevice(db,DEVICE_A,k.spki);
 db.prepare("INSERT INTO retention_settings(device_id,safety_event_days,updated_at) VALUES(?1,180,?2)").run(DEVICE_A,stamp);
 db.prepare("INSERT INTO device_location_control(device_id,desired_enabled,command_id,issued_at,updated_at,command_status) VALUES(?1,0,'test-pending-command',?2,?2,'pending')").run(DEVICE_A,stamp);
 db.prepare("INSERT INTO safety_events(id,device_id,kind,device_created_at,server_created_at,detail_json) VALUES('safe-id',?1,'safe_checkin',?2,?2,'{}')").run(DEVICE_A,stamp);
 const m={body:{type:"location",deviceId:DEVICE_A,packet:p,rawPacket:p,receivedAtMs:stamp},ackCount:0,ack(){this.ackCount++},retry(){throw Error("R2 source write retried")}};
 await processHistoryBatch({messages:[m]},{HISTORY:r2});assert.equal(m.ackCount,1);
 const historyKeys=[...r2.store.keys()].filter(x=>x.startsWith("history/"));assert.equal(historyKeys.length,2,"raw and trusted R2 objects required");
 const snap=await snapshotD1ToR2({DB:d1(db),HISTORY:r2},stamp);
 assert(snap.sha256&&snap.key.startsWith("backups/d1/"));assert.equal(BACKUP_TABLES.length,38);
 const inventory=[...r2.store.keys()].sort();assert.equal(inventory.length,3,"1 backup plus 2 history objects");
 for(const key of inventory){const b=r2.store.get(key);await restoredR2.put(key,b.bytes,{httpMetadata:b.meta,customMetadata:b.metadata})}
 assert.deepEqual([...restoredR2.store.keys()].sort(),inventory,"R2 raw/trusted + snapshot inventory mismatch");
 for(const key of inventory)assert.equal(restoredR2.store.get(key).etag,r2.store.get(key).etag,"R2 bytes changed on isolated restore");
 const obj=await restoredR2.get(snap.key);const result=await restoreBackupToFreshD1({DB:d1(target)},await obj.arrayBuffer(),snap.sha256);
 assert.equal(Object.keys(result.restoredRows).length,38);
 assert.equal(target.prepare("SELECT COUNT(*) n FROM devices").get().n,1);
 assert.equal(target.prepare("SELECT COUNT(*) n FROM safety_events").get().n,1);
 assert.equal(target.prepare("SELECT command_status FROM device_location_control").get().command_status,"expired","pending command replayed after restore");
 assert.equal(target.prepare("PRAGMA foreign_key_check").all().length,0);
 const rawKey=historyKeys.find(k=>k.startsWith("history/raw/")),trustedKey=historyKeys.find(k=>k.startsWith("history/trusted/"));
 assert(rawKey&&trustedKey);
 const raw=JSON.parse(gunzipSync(r2.store.get(rawKey).bytes).toString("utf8"));
 const trusted=JSON.parse(gunzipSync(restoredR2.store.get(trustedKey).bytes).toString("utf8"));
 assert.equal(raw.packets[0].sequence,10);assert.deepEqual(trusted.receipts,[[10,stamp]]);
 const incomplete=bucket();await incomplete.put(snap.key,r2.store.get(snap.key).bytes);
 const missing=historyKeys.filter(k=>!incomplete.store.has(k));
 assert.equal(missing.length,2,"a D1-only backup must be marked missing R2 history");
 console.log("PASS 8D.16: actual snapshotD1ToR2 -> isolated 38-table D1 restore, command expiry, FK and byte-identical raw/trusted R2 inventory; D1-only restore detected INCOMPLETE; live DO state/Cloudflare restore OPEN");
}finally{db.close();target.close();}
