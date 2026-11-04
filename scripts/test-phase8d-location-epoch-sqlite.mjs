#!/usr/bin/env node
// 8D.5/.7: actual Brick location persistence vs exact SQLite schema and live read-model order.
// Synthetic packets only; no Cloudflare backend or real location.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
const [ingestBundle,orderBundle]=process.argv.slice(2);
if(!ingestBundle||!orderBundle)throw Error("usage: test-phase8d-location-epoch-sqlite.mjs <ingest bundle> <live state order bundle>");
const {persistAccepted}=await import(pathToFileURL(ingestBundle).href);
const {shouldAdvanceLiveState}=await import(pathToFileURL(orderBundle).href);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"brick-p8d-epoch-")),db=path.join(dir,"epoch.db");
const deviceId="12345678-1234-4234-8234-123456789abc";
function rawSql(q){return execFileSync("sqlite3",["-json",db],{input:"PRAGMA foreign_keys=ON;\n"+q,encoding:"utf8",maxBuffer:8*1024*1024}).trim();}
function run(q){const out=rawSql(q);return out?JSON.parse(out):[];}
function lit(value){
 if(value===null)return "NULL";
 if(typeof value==="number"&&Number.isFinite(value))return String(value);
 if(typeof value==="string")return "'"+value.replaceAll("'","''")+"'";
 throw Error("unsupported test DB value");
}
function fill(sql,args) {return sql.replace(/\?(\d+)/g,(_whole,index)=>{const i=Number(index)-1;assert(i>=0&&i<args.length,"missing SQL binding");return lit(args[i]);});}
const d1={
 prepare(sql){return {bind(...args){return {sql,args,async first(){return run(fill(sql,args))[0]??null;},async run(){const result=rawSql(fill(sql,args)+";SELECT changes() AS change_count;");const match=result.match(/"change_count"\s*:\s*(\d+)/);return {meta:{changes:Number(match?.[1]??0)}};}};}};},
 async batch(stmts){
  const code="BEGIN IMMEDIATE;\n"+stmts.map(stmt=>fill(stmt.sql,stmt.args)+";\nSELECT changes() AS change_count;").join("\n")+"\nCOMMIT;";
  const out=rawSql(code);
  const counts=[...out.matchAll(/"change_count"\s*:\s*(\d+)/g)].map(m=>Number(m[1]));
  assert.equal(counts.length,stmts.length,"must obtain real D1 batch changes from SQLite");
  return counts.map(n=>({meta:{changes:n}}));
 }
};
let latest=null,updatedCount=0;
const durableObject={
 async setLatest(point) {
  if(!shouldAdvanceLiveState(point,latest))return false;
  latest={epoch:point.epoch,sequence:point.sequence,wallTimeMs:point.wallTimeMs};
  updatedCount++;return true;
 }
};
const env={DB:d1,BRICK_DEVICE:{idFromName:n=>n,get(){return durableObject;}}};
const start=Date.now()-120000;
function packet(epoch,sequence,delta){return {epoch,sequence,wallTimeMs:start+delta,version:2,
 trustedLatE7:null,trustedLonE7:null,uncertaintyCm:100000,quality:7,rawAccepted:false,rawMock:false};}
async function submit(epoch,sequence,delta){
 const result=await persistAccepted(env,deviceId,[packet(epoch,sequence,delta)]);
 return {inserted:result.insertedCount,advanced:result.liveAdvanced};
}
function count(){return run("SELECT COUNT(*) AS n FROM device_events WHERE device_id="+lit(deviceId))[0].n;}
function watermark(){return run("SELECT last_epoch,last_sequence FROM devices WHERE id="+lit(deviceId))[0];}
try{
 run(fs.readFileSync(path.join("schema","001_init.sql"),"utf8"));
 run("INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES("+lit(deviceId)+",'Test','synthetic-test-no-private-key',1);");
 for(const n of [100,101,102]){
  const result=await submit(7,n,n*100);
  assert.equal(result.inserted,1,"100,101,102 must each be inserted once");
  assert.equal(result.advanced,true);
 }
 assert.deepEqual(watermark(),{last_epoch:7,last_sequence:102});
 assert.equal(count(),3);
 const before={...latest},pushes=updatedCount;
 for(const n of [100,102,101,102,102]){
  const result=await submit(7,n,n*100+50000);
  assert.equal(result.inserted,0,"replayed logical sequence may not create D1 history event");
  assert.equal(result.advanced,false,"replayed logical sequence may not push new live state");
 }
 assert.equal(count(),3);
 assert.deepEqual(latest,before);
 assert.equal(updatedCount,pushes);
 // Old epoch after a new epoch: retain unique backlog in the historical index without degrading current truth.
 const old=await submit(6,250,start?1000:1000);
 assert.equal(old.inserted,1);
 assert.equal(old.advanced,false);
 assert.deepEqual(watermark(),{last_epoch:7,last_sequence:102});
 assert.deepEqual(latest,before);
 // New boot epoch may advance the D1 logical watermark but may NOT replace newer captured live fix.
 const newOld=await submit(8,1,9000);
 assert.equal(newOld.inserted,1);
 assert.equal(newOld.advanced,false);
 assert.deepEqual(watermark(),{last_epoch:8,last_sequence:1});
 assert.deepEqual(latest,before);
 // Later event time from new boot is authoritative for the current parent map.
 const newFresh=await submit(8,2,40000);
 assert.equal(newFresh.inserted,1);
 assert.equal(newFresh.advanced,true);
 assert.deepEqual(watermark(),{last_epoch:8,last_sequence:2});
 assert.deepEqual(latest,{epoch:8,sequence:2,wallTimeMs:start+40000});
 // Huge signed sequence jumps are persisted; this is policy evidence, NOT automatic acceptance as safe.
 const large=await submit(8,4_000_000_000,50000);
 assert.equal(large.inserted,1);
 assert.deepEqual(watermark(),{last_epoch:8,last_sequence:4_000_000_000});
 const olderLater=await submit(8,3,42000);
 assert.equal(olderLater.inserted,1,"historical unique point may arrive below logical high watermark");
 assert.equal(olderLater.advanced,false,"older capture must never degrade current state");
 assert.deepEqual(watermark(),{last_epoch:8,last_sequence:4_000_000_000});
 assert.equal(count(),8);
 console.log("PASS 8D.5/.7: SQLite 100→101→102, replays 100/102/101/102/102, old/new epochs, stale vs fresh capture, huge sequence jump and preserved D1 watermark; huge jump policy review remains open.");
}finally{fs.rmSync(dir,{recursive:true,force:true});}
