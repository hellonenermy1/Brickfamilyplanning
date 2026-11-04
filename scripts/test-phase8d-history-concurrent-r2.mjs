#!/usr/bin/env node
// Phase 8D 8D.6/8D.9 adversarial history interleaving: use actual bundled history-store code.
// Synthetic Cloudflare R2 fake enforces atomic If-Match/If-None-Match semantics.
// Never touches a real Cloudflare account or user location data.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { gunzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
const [bundleFile] = process.argv.slice(2);
if (!bundleFile) throw Error("usage: test-phase8d-history-concurrent-r2.mjs <history-store bundle>");
const { processHistoryBatch } = await import(pathToFileURL(bundleFile).href);
const values=new Map();
let firstRawGets=0, releaseReads;
const bothRead=new Promise(resolve=>releaseReads=resolve);
let puts=0, conflicts=0;
const bucket={
 async get(key) {
   const old=values.get(key);
   if (key.startsWith("history/raw/") && firstRawGets++ < 2) {
     if (firstRawGets===2)releaseReads();
     await bothRead;
   }
   if(!old)return null;
   return {etag:old.etag,httpMetadata:{contentEncoding:"gzip"},body:new Blob([old.data]).stream()};
 },
 async put(key,body,options={}) {
   // Models Cloudflare R2's atomic conditional put behavior.
   const existing=values.get(key);
   const ifMatch=options.onlyIf instanceof Headers ? options.onlyIf.get("if-match") : options.onlyIf?.etagMatches;
   const ifNone=options.onlyIf instanceof Headers ? options.onlyIf.get("if-none-match") : null;
   if ((ifMatch !== undefined && ifMatch !== null && (!existing || existing.etag!==ifMatch)) ||
       (ifNone==="*" && existing)) {conflicts++;return null;}
   const bytes=body instanceof ArrayBuffer ? new Uint8Array(body.slice(0)) : new Uint8Array(await new Response(body).arrayBuffer());
   const etag=crypto.createHash("sha256").update(bytes).digest("hex");
   values.set(key,{data:bytes,etag});
   puts++;
   return {etag};
 }
};
function packet(seq) {
 return {version:2,epoch:7,sequence:seq,wallTimeMs:1793430000000+seq*1000,
   trustedLatE7:13520000+seq,trustedLonE7:1038198000+seq,
   uncertaintyCm:500,speedCms:120,speedAccuracyCms:40,bearingCdeg:9000,
   batteryPct:72,charging:false,activity:2,activityConfidence:90,quality:1,
   source:1,fallback:false,rawAccepted:true};
}
function message(seq) {
 const entry={type:"location",deviceId:"synthetic-child",packet:packet(seq),rawPacket:packet(seq),receivedAtMs:1793430050000+seq};
 let acked=0, retried=0;
 return {body:entry,ack(){acked++;},retry(){retried++;},check(){return {acked,retried}}};
}
const a=message(100),b=message(101);
const [ra,rb]=await Promise.all([
 processHistoryBatch({messages:[a]},{HISTORY:bucket}),
 processHistoryBatch({messages:[b]},{HISTORY:bucket})
]);
assert.equal(a.check().acked,1,"first HTTP durability queue message must be ACKed after persistence");
assert.equal(b.check().acked,1,"second HTTP durability queue message must be ACKed after persistence");
const rawEntries=[...values].filter(([key])=>key.startsWith("history/raw/"));
const trustedEntries=[...values].filter(([key])=>key.startsWith("history/trusted/"));
assert.equal(rawEntries.length,1,"same 15-minute epoch must use one raw R2 segment");
assert.equal(trustedEntries.length,1,"same 15-minute epoch must use one trusted R2 segment");
const raw=JSON.parse(gunzipSync(rawEntries[0][1].data).toString("utf8"));
const trusted=JSON.parse(gunzipSync(trustedEntries[0][1].data).toString("utf8"));
assert.deepEqual(raw.packets.map(x=>x.sequence),[100,101],"simultaneous Queue deliveries lost a raw location after ACK");
assert.deepEqual(raw.trustedPackets.map(x=>x.sequence),[100,101],"simultaneous Queue deliveries lost trusted points");
assert.deepEqual(trusted.receipts.map(x=>x[0]),[100,101],"trusted history lost one receipt after Queue ACK");
console.log("PASS P8D-007 concurrent same-segment R2 history: two ACKed deliveries retained both raw and trusted packets; conditional conflicts="+conflicts+"; puts="+puts);
