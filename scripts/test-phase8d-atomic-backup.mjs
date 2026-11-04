#!/usr/bin/env node
// P8D-002 8D.16: require a single transactional D1 batch for the entire
// 38-table backup snapshot. Source regression uses synthetic concurrent mutation.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const file=process.argv[2];assert(file,"bundle backup-v6.ts");
const {snapshotD1ToR2,BACKUP_TABLES}=await import(pathToFileURL(file).href);
let generation=0,looseReadCount=0,batchCount=0,stored=null;
const db={
 prepare(sql){
  const match=sql.match(/^SELECT \* FROM ([a-z0-9_]+) LIMIT \?1(?: OFFSET \?2)?$/);
  assert(match,"unknown backup query "+sql);
  const table=match[1];
  assert(BACKUP_TABLES.includes(table));
  return {sql,table,bind(...args){return {sql,table,args,async all(){
    looseReadCount++;
    const snapshot=generation;
    // Transition represents ONE atomic device + capability update between table requests.
    generation=1;
    return {results:table==="devices"?[{id:"synthetic",name:"gen-"+snapshot}]:
      table==="device_capability_profile"?[{device_id:"synthetic",profile_version:snapshot}]:[]};
  }};}};
 },
 async batch(stmts){
  batchCount++;
  const observed=generation;
  generation=1;
  assert.equal(stmts.length,BACKUP_TABLES.length,"all 38 table reads must share one D1 transaction");
  return stmts.map(({table,args})=>{
    assert.equal(args[0],500001,"each table query must fail closed on excessive rows");
    return {results:table==="devices"?[{id:"synthetic",name:"gen-"+observed}]:
      table==="device_capability_profile"?[{device_id:"synthetic",profile_version:observed}]:[]};
  });
 }
};
const r2={
 async put(key,body){stored={key,body};return {etag:"ok"};},
 async list(){return {objects:[],truncated:false};},
 async delete(){throw Error("unexpected deletion");}
};
await snapshotD1ToR2({DB:db,HISTORY:r2},1790000000000);
assert.equal(batchCount,1,"D1 source backup must be ONE transaction");
assert.equal(looseReadCount,0,"loose reads would produce torn backup");
assert(stored);
const parsed=JSON.parse(await new Response(new Blob([stored.body]).stream().pipeThrough(new DecompressionStream("gzip"))).text());
assert.deepEqual([parsed.tables.devices[0].name,parsed.tables.device_capability_profile[0].profile_version],["gen-0",0],"mixed-generation backup");
assert.equal(Object.keys(parsed.tables).length,38);
console.log("PASS P8D-002: all 38 D1 tables captured in one transaction under synthetic concurrent mutation, no torn backup; Cloudflare isolation and R2/DO full restore still OPEN");
