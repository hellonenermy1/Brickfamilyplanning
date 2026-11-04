#!/usr/bin/env node
// 8D.5: duplicate signed logical identity may not rewrite already persisted history.
// Models two distinct valid queue bodies with same (device, epoch, sequence) and different coordinates.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { gunzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
const [modulePath]=process.argv.slice(2);
if(!modulePath)throw Error("usage: test-phase8d-history-idempotence.mjs <history-store bundle>");
const {processHistoryBatch}=await import(pathToFileURL(modulePath).href);
const store=new Map();
const bucket={
 async get(key) {const v=store.get(key);return v?{etag:v.etag,httpMetadata:{contentEncoding:"gzip"},body:new Blob([v.bytes]).stream()}:null;},
 async head(key) {const v=store.get(key);return v?{etag:v.etag}:null;},
 async put(key,body,options={}){
  const prev=store.get(key);
  const match=options.onlyIf instanceof Headers?options.onlyIf.get("if-match"):options.onlyIf?.etagMatches;
  const no=options.onlyIf instanceof Headers?options.onlyIf.get("if-none-match"):null;
  if((match!=null && (!prev||prev.etag!==match))||(no==="*"&&prev))return null;
  const bytes=new Uint8Array(body);
  const etag=crypto.createHash("sha256").update(bytes).digest("hex");
  store.set(key,{bytes,etag});
  return {etag};
 }
};
function makePoint(lat) {return {version:2,epoch:3,sequence:100,wallTimeMs:1793430000000,trustedLatE7:lat,trustedLonE7:1038198000,
 uncertaintyCm:500,speedCms:120,speedAccuracyCms:20,bearingCdeg:9000,batteryPct:50,charging:false,activity:2,activityConfidence:95,quality:1,source:1,fallback:false,rawAccepted:true};}
function msg(point,arrival){
 let a=0,ret=0;
 return {body:{type:"location",deviceId:"synthetic-child",packet:point,rawPacket:{...point},receivedAtMs:arrival},
  ack(){a++;},retry(){ret++;},status(){return {a,ret};}};
}
const original=msg(makePoint(13520000),1793430001000);
const replay=msg(makePoint(13999999),1793430009000);
await processHistoryBatch({messages:[original]},{HISTORY:bucket});
await processHistoryBatch({messages:[replay]},{HISTORY:bucket});
assert.deepEqual(original.status(),{a:1,ret:0},"original should be durably ACKed");
assert.deepEqual(replay.status(),{a:1,ret:0},"safe duplicate should be idempotently ACKed");
const raw=[...store].find(([key])=>key.startsWith("history/raw/"));
const trusted=[...store].find(([key])=>key.startsWith("history/trusted/"));
assert(raw&&trusted,"must have both durable objects");
const contents=JSON.parse(gunzipSync(raw[1].bytes).toString("utf8"));
const points=JSON.parse(gunzipSync(trusted[1].bytes).toString("utf8"));
assert.equal(contents.packets.length,1,"duplicate created multiple logical packets");
assert.equal(contents.packets[0].trustedLatE7,13520000,"duplicate changed original RAW history coordinates");
assert.equal(contents.trustedPackets[0].trustedLatE7,13520000,"duplicate changed original TRUSTED history coordinates");
assert.deepEqual(contents.receipts,[[100,1793430001000]],"first server receipt time must never move");
assert.deepEqual(points.receipts,contents.receipts,"trusted receipt diverged from raw");
console.log("PASS P8D-008: duplicate delivery with conflicting payload retains first accepted raw/trusted packet and earliest receipt.");
