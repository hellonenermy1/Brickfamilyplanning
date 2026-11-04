#!/usr/bin/env node
// Phase 8D.6 / 8D.9: exact-source Queue ACK, partial R2, retry, safety receipt fault exercise.
// Test only synthetic data; never connects to production Cloudflare.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { gunzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
const [historyModule,safetyModule]=process.argv.slice(2);
if(!historyModule || !safetyModule)throw Error("usage: test-phase8d-ack-faults.mjs <history bundle> <queue bundle>");
const {processHistoryBatch}=await import(pathToFileURL(historyModule).href);
const {processSafetyReceipts}=await import(pathToFileURL(safetyModule).href);
const point={version:2,epoch:3,sequence:100,wallTimeMs:1793430000000,trustedLatE7:13520000,trustedLonE7:1038198000,
 uncertaintyCm:500,speedCms:120,speedAccuracyCms:20,bearingCdeg:9000,batteryPct:50,charging:false,activity:2,activityConfidence:95,quality:1,source:1,fallback:false,rawAccepted:true};
function message(body){
 let a=0,ret=0;
 return {body,ack(){a++;},retry(){ret++;},status(){return {ack:a,retry:ret};}};
}
function bucket({failTrustedOnce=false,alwaysConflict=false}={}){
 const store=new Map();let failed=false;
 return {
   store,
   async head(key){const x=store.get(key);return x?{etag:x.etag}:null;},
   async get(key){const x=store.get(key);return x?{etag:x.etag,httpMetadata:{contentEncoding:"gzip"},body:new Blob([x.bytes]).stream()}:null;},
   async put(key,body,options={}){
     if (alwaysConflict) return null;
     if(failTrustedOnce && key.startsWith("history/trusted/") && !failed){failed=true;throw Error("simulated trusted R2 outage");}
     const prev=store.get(key);
     const match=options.onlyIf instanceof Headers?options.onlyIf.get("if-match"):options.onlyIf?.etagMatches;
     const none=options.onlyIf instanceof Headers?options.onlyIf.get("if-none-match"):null;
     if((match!=null && (!prev||prev.etag!==match))||(none==="*"&&prev))return null;
     const bytes=new Uint8Array(body);
     const etag=crypto.createHash("sha256").update(bytes).digest("hex");
     store.set(key,{bytes,etag});
     return {etag};
   }
 };
}
function queueMessage(seq=100){
 const p={...point,sequence:seq};
 return message({type:"location",deviceId:"synthetic-device",packet:p,rawPacket:{...p},receivedAtMs:1793430050000});
}
{
  const memory=bucket({failTrustedOnce:true}),m=queueMessage();
  const first=await processHistoryBatch({messages:[m]},{HISTORY:memory});
  assert.deepEqual(m.status(),{ack:0,retry:1},"partial R2 write must NOT queue-ACK");
  assert.equal(first.retriedMessages,1);
  assert.equal([...memory.store.keys()].filter(x=>x.startsWith("history/raw/")).length,1,"raw half-write should remain for retry");
  const retried=queueMessage();
  const second=await processHistoryBatch({messages:[retried]},{HISTORY:memory});
  assert.deepEqual(retried.status(),{ack:1,retry:0},"successful retry must ACK exactly once");
  const raw=[...memory.store].find(([key])=>key.startsWith("history/raw/"))[1].bytes;
  const decoded=JSON.parse(gunzipSync(raw).toString("utf8"));
  assert.deepEqual(decoded.packets.map(p=>p.sequence),[100],"redelivery must not duplicate logical packet");
  assert.equal(second.processedMessages,1);
}
{
  const memory=bucket({alwaysConflict:true}),m=queueMessage(101);
  const res=await processHistoryBatch({messages:[m]},{HISTORY:memory});
  assert.deepEqual(m.status(),{ack:0,retry:1},"exhausted conditional R2 writes must not ACK");
  assert.equal(res.retriedMessages,1);
}
{
 let durable=false,throwQuery=false;
 const env={DB:{prepare(sql){return {bind(...args){return {
   async first(){if(throwQuery)throw Error("D1 unavailable");return durable?{ok:1}:null;}
 };}};}}};
 const safety=()=>message({type:"safety_receipt",deviceId:"synthetic-device",eventId:"11111111-1111-4111-8111-111111111111",createdAtMs:1793430000000,kind:"sos_started"});
 const absent=safety();await processSafetyReceipts({messages:[absent]},env);
 assert.deepEqual(absent.status(),{ack:0,retry:1},"missing durable D1 safety row must not ACK");
 throwQuery=true;
 const fault=safety();await processSafetyReceipts({messages:[fault]},env);
 assert.deepEqual(fault.status(),{ack:0,retry:1},"D1 failure must not ACK");
 throwQuery=false;durable=true;
 const arrived=safety();await processSafetyReceipts({messages:[arrived]},env);
 assert.deepEqual(arrived.status(),{ack:1,retry:0},"only a durable matching safety row may ACK");
}
console.log("PASS P8D.6/.9: R2 partial write -> queue retry, retry idempotent, conditional exhaustion -> retry, D1 missing/outage -> safety retry, durable matching safety row -> ACK.");
