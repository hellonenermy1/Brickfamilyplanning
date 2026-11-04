#!/usr/bin/env node
// P8D-002 / 8D.16: reproduce mixed-generation cross-table D1 snapshot with one
// synthetic atomic state transition. This is NEGATIVE EVIDENCE, not a PASS.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const bundle=process.argv[2];assert(bundle,"Pass compiled backup-v6 bundle");
const {snapshotD1ToR2,BACKUP_TABLES}=await import(pathToFileURL(bundle).href);
let generation=0,transitioned=false,stored=null;
const db={prepare(query){
 const m=query.match(/^SELECT \* FROM ([a-z_]+) LIMIT \?1 OFFSET \?2$/);
 assert(m,"Unexpected D1 query "+query);
 const table=m[1];
 assert(BACKUP_TABLES.includes(table));
 return {bind(limit,offset){return {async all(){
  if(offset>0)return {results:[]};
  let rows=[];
  if(table==="devices")rows=[{id:"synthetic-child",name:"generation-"+generation,revoked_at:null}];
  if(table==="device_capability_profile")rows=[{device_id:"synthetic-child",profile_version:generation}];
  // This mocks a single atomic D1 transaction between two per-table read queries.
  if(table==="devices"&&!transitioned){generation=1;transitioned=true;}
  return {results:rows};
 }};}};
}};
const bucket={
 async put(key,body){stored={key,body};return {key};},
 async list(){return {objects:[],truncated:false};},
 async delete(){throw Error("nothing expired in synthetic fixture");}
};
await snapshotD1ToR2({DB:db,HISTORY:bucket},1_790_000_000_000);
assert(stored,"backup not produced");
const unpacked=new Blob([stored.body]).stream().pipeThrough(new DecompressionStream("gzip"));
const snapshot=JSON.parse(await new Response(unpacked).text());
const observed={
 deviceName:snapshot.tables.devices[0].name,
 capabilityVersion:snapshot.tables.device_capability_profile[0].profile_version
};
assert.equal(transitioned,true);
assert.deepEqual(observed,{deviceName:"generation-0",capabilityVersion:1},
 "EXPECTED SOURCE DEFECT NOT REPRODUCED: verify whether snapshot strategy changed");
console.log("REPRODUCED OPEN P8D-002/8D.16: D1 backup mixed pre-transaction device with post-transaction capability; source-simulated concurrency only. Full coherent D1+R2+DO restore still REQUIRED.");
