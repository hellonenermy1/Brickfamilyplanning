#!/usr/bin/env node
// 8D.3 signed device trust boundary + 8D.4 malformed input + 8D.5 health replay.
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { pathToFileURL } from "node:url";
if (!globalThis.crypto) globalThis.crypto=webcrypto;
const [sourceModule]=process.argv.slice(2);
if(!sourceModule)throw Error("usage: test-phase8d-device-auth-replay.mjs <device-json-security bundle>");
const {reserveHealthReplay}=await import(pathToFileURL(sourceModule).href);
const idA="12345678-1234-4234-8234-123456789abc";
const idB="22345678-1234-4234-8234-123456789abc";
const pairA=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);
const pairB=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);
const spki=async pair=>Buffer.from(await crypto.subtle.exportKey("spki",pair.publicKey)).toString("base64");
const keys=new Map([[idA,{public_key_spki_b64:await spki(pairA),revoked_at:null}],[idB,{public_key_spki_b64:await spki(pairB),revoked_at:null}]]);
const highWater=new Map();const now=Date.now();let writes=0;
const env={DB:{prepare(sql){return {bind(...params){return {
  async first(){return keys.get(params[0])??null;},
  async run(){
    const [id,sequence]=params;
    const prev=highWater.get(id)??0;
    if(sequence<=prev)return {meta:{changes:0}};
    highWater.set(id,sequence);writes++;return {meta:{changes:1}};
  }
};}};}}};
async function signed(body,signingPair=pairA,routeId=idA,{modifyAfterSign=false,omitSignature=false}={}) {
 const text=typeof body==="string"?body:JSON.stringify(body);
 const bytes=new TextEncoder().encode(text);
 const raw=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},signingPair.privateKey,bytes);
 const sig=Buffer.from(raw).toString("base64");
 const payload=modifyAfterSign?text+" ":text;
 return new Request("https://brick.example/api/device/"+routeId+"/health",{method:"POST",
   headers:omitSignature?{}:{"X-Brick-Signature":sig,"Content-Type":"application/json"},body:payload});
}
const health=(sequence,time=now)=>({healthSequence:sequence,healthSentAtMs:time,protocol:1});
const check=async(req,deviceId,code)=>{const response=await reserveHealthReplay(req,env,deviceId,now);assert(response instanceof Response,"expected reject HTTP response "+code);assert.equal(response.status,code);};
assert.equal(await reserveHealthReplay(await signed(health(100)),env,idA,now),null,"valid signed health should be accepted");
await check(await signed(health(100)),idA,409);
assert.equal(await reserveHealthReplay(await signed(health(102)),env,idA,now),null,"new higher sequence must advance");
await check(await signed(health(101)),idA,409);
await check(await signed(health(103),pairB),idA,401);
await check(await signed(health(103),pairA,idB),idB,401);
await check(await signed(health(103),pairA,"not-a-device"),"not-a-device",401);
await check(await signed(health(103),pairA,idA,{modifyAfterSign:true}),idA,401);
await check(await signed(health(103),pairA,idA,{omitSignature:true}),idA,401);
await check(await signed(health(103,now+121000)),idA,400);
await check(await signed(health(103,now-601000)),idA,409);
await check(await signed(health(-1)),idA,400);
await check(await signed("{ malformed"),idA,400);
await check(await signed("x".repeat(8193)),idA,400);
keys.set(idA,{...(keys.get(idA)),revoked_at:now});
await check(await signed(health(103)),idA,401);
assert.equal(highWater.get(idA),102,"rejected signed requests must not change accepted sequence");
assert.equal(writes,2,"only two accepted healthy signed requests may update D1");
console.log("PASS 8D.3/.4/.5 device signed health: valid, wrong key/device, unknown/revoked, tampered/missing signature, malformed, oversized, stale/future, 100->100/102/101 replay.");
