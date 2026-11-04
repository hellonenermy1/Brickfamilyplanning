import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
import {newDatabase,adapter,addDevice,DEVICE_A,DEVICE_B} from "./phase8d-native-fixture.mjs";
const {claimCommuteRefresh}=await import(pathToFileURL(process.argv[2]).href);
const db=newDatabase(),now=Date.now();
try{
 addDevice(db,DEVICE_A,"key-a");addDevice(db,DEVICE_B,"key-b");
 const env=adapter(db);
 assert.equal(await claimCommuteRefresh(env,DEVICE_A,now),true);
 assert.equal(await claimCommuteRefresh(env,DEVICE_A,now+60_000),false,"duplicate HTTP GET triggers second full R2 history rebuild");
 assert.equal(await claimCommuteRefresh(env,DEVICE_B,now+60_000),true,"one child throttles another");
 assert.equal(await claimCommuteRefresh(env,DEVICE_A,now+10*60_000-1),false);
 assert.equal(await claimCommuteRefresh(env,DEVICE_A,now+10*60_000),true);
 const c=await Promise.all([claimCommuteRefresh(env,DEVICE_A,now+20*60_000),claimCommuteRefresh(env,DEVICE_A,now+20*60_000)]);
 assert.deepEqual(c.slice().sort(),[false,true],"concurrent request refresh dedupe not atomic");
 db.prepare("UPDATE devices SET revoked_at=?1 WHERE id=?2").run(now,DEVICE_B);
 assert.equal(await claimCommuteRefresh(env,DEVICE_B,now+30*60_000),false,"revoked child should not schedule expensive work");
 assert.equal(db.prepare("SELECT COUNT(*) n FROM provider_cache WHERE provider='brick_commute_refresh'").get().n,2);
 console.log("PASS P8D-027: real SQLite 10-minute per-child refresh claim; concurrency, shared parent, revoked device and cron coexist");
}finally{db.close();}
