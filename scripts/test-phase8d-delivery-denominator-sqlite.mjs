import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
import {newDatabase,adapter,addDevice,DEVICE_A,DEVICE_B} from "./phase8d-native-fixture.mjs";
const {reliability}=await import(pathToFileURL(process.argv[2]).href);
const db=newDatabase();const now=Date.now();
try{
 addDevice(db,DEVICE_A,"test-key-a");addDevice(db,DEVICE_B,"test-key-b");
 // The metric starts at device.created_at. Synthetic packets must be newer
 // than the synthetic device's enrollment, regardless of runner clock tick.
 db.prepare("UPDATE devices SET created_at=?1 WHERE id IN (?2,?3)").run(now-10_000,DEVICE_A,DEVICE_B);
 for(const n of [100,101,103])db.prepare("INSERT INTO device_events(device_id,epoch,sequence,kind,created_at) VALUES(?1,1,?2,'location',?3)").run(DEVICE_A,n,now);
 let a=await (await reliability({DB:adapter(db)},DEVICE_A,1)).json();
 assert.equal(a.packetDeliveryPct,75,"small provable sequence gap must yield 3/4 received");
 assert.deepEqual(a.packetEvidence,{expectedPackets:4,receivedPackets:3});
 for(const n of [1,4_000_000_000])db.prepare("INSERT INTO device_events(device_id,epoch,sequence,kind,created_at) VALUES(?1,1,?2,'location',?3)").run(DEVICE_B,n,now);
 let b=await(await reliability({DB:adapter(db)},DEVICE_B,1)).json();
 assert.equal(b.packetDeliveryPct,null,"4B sequence jump must NOT be claimed as a measured loss rate");
 assert.equal(b.packetEvidence.receivedPackets,2);
 assert.equal(b.packetEvidence.expectedPackets,null,"implausible 4B denominator misrepresented as observed data");
 assert.equal(b.packetEvidence.sequenceDiscontinuity,true);
 console.log("PASS P8D-026 real SQLite: ordinary 75% delivery signal preserved, huge epoch jump marked unmeasurable without fabricated loss");
}finally{db.close();}
