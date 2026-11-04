import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {pathToFileURL} from "node:url";
import {newDatabase,adapter,addDevice,DEVICE_A} from "./phase8d-native-fixture.mjs";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const {alertPersistentIncidents}=await import(pathToFileURL(process.argv[2]).href);
const db=newDatabase(),now=Date.now();
try{
 addDevice(db,DEVICE_A,"synthetic-key");
 const insert=db.prepare("INSERT INTO health_incidents(id,device_id,kind,severity,started_at,last_seen_at,detail_json) VALUES(?1,?2,'device_offline','critical',?3,?3,'{}')");
 for(let i=0;i<105;i++)insert.run("00000000-0000-4000-8000-"+i.toString().padStart(12,"0"),DEVICE_A,now-120_000);
 const first=await alertPersistentIncidents({DB:adapter(db)},now);
 assert(first.length>0&&first.length<=100,"unbounded alert sweep monopolizes cron when many families fail");
 db.prepare("DELETE FROM safety_events").run();db.prepare("DELETE FROM health_incidents").run();
 const incidentId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
 insert.run(incidentId,DEVICE_A,now-120_000);
 let reads=0,unblock;const gate=new Promise(resolve=>{unblock=resolve});
 const interleaved=adapter(db,async sql=>{
  if(sql.includes("FROM health_incidents")&&sql.includes("alerted_at IS NULL")){
   reads++;if(reads===2)unblock();await gate;
  }
 });
 const [one,two]=await Promise.all([alertPersistentIncidents({DB:interleaved},now),alertPersistentIncidents({DB:interleaved},now)]);
 assert.equal(reads,2,"must execute two reads before either writer");
 assert.equal(one.length+two.length,1,"concurrent cron snapshots delivered duplicate incident alert");
 assert.equal(db.prepare("SELECT COUNT(*) n FROM safety_events").get().n,1);
 assert.equal(db.prepare("SELECT alerted_at FROM health_incidents WHERE id=?1").get(incidentId).alerted_at,now);
 console.log("PASS P8D-025 real SQLite: bounded incident sweep <=100 and exactly-once alerts under two concurrent cron snapshots");
}finally{db.close();}
