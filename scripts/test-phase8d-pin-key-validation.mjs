#!/usr/bin/env node
// Phase 8D.3/.4/.13: exercise actual P8B PIN claim/confirmation functions.
// Synthetic request bodies, real WebCrypto P-256 keys; no live Cloudflare account.
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { pathToFileURL } from "node:url";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const [file]=process.argv.slice(2);
if(!file)throw Error("usage: test-phase8d-pin-key-validation.mjs <pin pairing bundle>");
const pairing=await import(pathToFileURL(file).href);
const origin="https://brick.example";
const sessionId="12345678-1234-4234-8234-123456789abc";
const invalidPublicKey="A".repeat(120); // 120 characters, not a valid ECDSA P-256 SPKI.
const keyPair=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);
const spki=Buffer.from(await crypto.subtle.exportKey("spki",keyPair.publicKey)).toString("base64");
const unpadded=spki.replace(/=+$/,"");
const row={
 id:sessionId,device_name:"Synthetic child",expires_at:Date.now()+600000,claimed_at:Date.now()-1000,
 pending_public_key_spki_b64:invalidPublicKey,claim_secret_hash:"fake-hash",confirmed_at:null,device_id:null,cancelled_at:null
};
let mutationCount=0,confirmedWrites=0,lastPendingKey=null;
const env={
 PAIR_RATE:{async limit(){return {success:true};}},
 DB:{
  prepare(sql){return {bind(...args){return {
   async first(){
    if(sql.startsWith("UPDATE pairing_pin_sessions SET claimed_at=")){
      mutationCount++;lastPendingKey=args[1];return row;
    }
    if(sql.startsWith("SELECT id,device_name,expires_at"))return row;
    throw Error("unexpected SQL in pairing regression: "+sql);
   },
   async run(){mutationCount++;return {meta:{changes:1}};}
  };}};},
  async batch(){confirmedWrites++;return [{meta:{changes:1}}];}
 }
};
function claim(publicKeySpkiB64,extra=null){
 const body={pin:"12345678",publicKeySpkiB64};
 if(extra!==null)body.padding=extra;
 return new Request(origin+"/api/pair/pin/claim",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
}
async function verifyInvalid() {
 const response=await pairing.childClaimPin(claim(invalidPublicKey),env);
 assert.equal(response.status,400,"public claim must reject a length-valid but invalid P-256 SPKI");
 assert.equal(mutationCount,0,"invalid public key must not consume PIN session");
}
async function verifyValidCanonical() {
 const response=await pairing.childClaimPin(claim(unpadded),env);
 assert.equal(response.status,202,"valid unpadded P-256 SPKI must be accepted");
 assert.equal(lastPendingKey,spki,"validated P-256 SPKI must be canonical/padded");
}
async function verifyOversized() {
 const before=mutationCount;
 const response=await pairing.childClaimPin(claim(spki,"X".repeat(100_000)),env);
 assert([400,413].includes(response.status),"oversized public claim must be rejected");
 assert.equal(mutationCount,before,"oversized body must not mutate a pairing session");
}
async function verifyHistoricalBadConfirmation() {
 const response=await pairing.parentConfirmPin(new Request(origin+"/parent/api/pair/pin/"+sessionId,{method:"POST",headers:{Origin:origin}}),env,sessionId);
 assert.equal(response.status,400,"historically invalid pending SPKI must not register a device");
 assert.equal(confirmedWrites,0,"invalid historical claim must not start a D1 batch");
}
async function verifyOriginAndRequestBounds() {
 const before=mutationCount;
 const startNoOrigin=await pairing.parentStartPin(new Request(origin+"/parent/api/pair/pin/start",{method:"POST",body:"{}"}),env);
 assert.equal(startNoOrigin.status,403,"parent PIN creation must require Origin");
 const startEvilOrigin=await pairing.parentStartPin(new Request(origin+"/parent/api/pair/pin/start",{method:"POST",headers:{Origin:"https://evil.example.test"},body:"{}"}),env);
 assert.equal(startEvilOrigin.status,403,"cross-origin parent PIN creation must fail");
 const confirmNoOrigin=await pairing.parentConfirmPin(new Request(origin+"/parent/api/pair/pin/"+sessionId,{method:"POST"}),env,sessionId);
 assert.equal(confirmNoOrigin.status,403,"parent PIN confirmation must require Origin");
 const oversizeParent=await pairing.parentStartPin(new Request(origin+"/parent/api/pair/pin/start",{method:"POST",headers:{Origin:origin},body:JSON.stringify({name:"N".repeat(20000)})}),env);
 assert.equal(oversizeParent.status,413,"parent PIN mutation must enforce bounded request");
 const oversizePublic=await pairing.childPinStatus(new Request(origin+"/api/pair/pin/status",{method:"POST",body:JSON.stringify({claimSecret:"N".repeat(20000)})}),env);
 assert.equal(oversizePublic.status,413,"public PIN status must reject oversized request");
 assert.equal(mutationCount,before,"denied cross-origin/oversized PIN requests cannot write");
}
async function verifyRateLimiting() {
 const blocked={...env,PAIR_RATE:{async limit(){return {success:false};}}};
 const before=mutationCount;
 assert.equal((await pairing.childClaimPin(claim(spki),blocked)).status,429,"public claim rate ceiling");
 assert.equal((await pairing.parentStartPin(new Request(origin+"/parent/api/pair/pin/start",{method:"POST",headers:{Origin:origin},body:"{}"}),blocked)).status,429,"parent PIN start rate ceiling");
 assert.equal((await pairing.parentConfirmPin(new Request(origin+"/parent/api/pair/pin/"+sessionId,{method:"POST",headers:{Origin:origin}}),blocked,sessionId)).status,429,"parent confirmation rate ceiling");
 assert.equal((await pairing.childPinStatus(new Request(origin+"/api/pair/pin/status",{method:"POST",body:"{}"}),blocked)).status,429,"public status rate ceiling");
 assert.equal(mutationCount,before,"rate-denied requests cannot mutate pairing session");
}
const failures=[];
for(const [name,fn] of [
 ["invalid SPKI claim",verifyInvalid],["canonical valid SPKI claim",verifyValidCanonical],
 ["oversized claim",verifyOversized],["invalid historical key parent confirm",verifyHistoricalBadConfirmation],
 ["same-origin and bounded pairing requests",verifyOriginAndRequestBounds],["pairing rate limits",verifyRateLimiting]
]) {
 try {await fn();console.log("PASS "+name);}
 catch(e){console.error("FAIL "+name+": "+e.message);failures.push(name);}
}
assert.equal(failures.length,0,"P8D-009 failures: "+failures.join(", "));
console.log("PASS P8D-009 / 8D.12/.14: P-256 PIN identity, bounded bodies, Origin/CSRF and rate-limit guards verified.");
