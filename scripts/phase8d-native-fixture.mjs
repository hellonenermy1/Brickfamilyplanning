// Disposable production-migration SQLite and synthetic ECDSA P-256 test fixture.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {webcrypto} from "node:crypto";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
export const DEVICE_A="12345678-1234-4234-8234-123456789abc";
export const DEVICE_B="22345678-1234-4234-8234-123456789abc";
export const schemas=[
 "001_init.sql","002_phase2_health.sql","003_phase4_safety.sql","004_phase5_operations.sql",
 "007_phase5c_hardening.sql","008_v1_phase2_evidence.sql","009_v1_phase5_fusion.sql",
 "010_phase5b_closure.sql","011_v1_phase6_location_control.sql",
 "015_phase8_device_identity.sql","016_p8b_remediation.sql","017_p8b_provider_rate.sql",
 "018_p8b_pin_pairing.sql"
];
export function newDatabase(){
 const db=new DatabaseSync(":memory:");
 db.exec("PRAGMA foreign_keys=ON");
 for(const f of schemas)db.exec(readFileSync("schema/"+f,"utf8"));
 return db;
}
export function adapter(db,onRead=()=>{}){
 return {
  prepare(sql){return {bind(...args){const stmt=db.prepare(sql);return{
   async first(){const value=stmt.get(...args)??null;await onRead(sql,args,value);return value;},
   async all(){const result=stmt.all(...args);await onRead(sql,args,result);return{results:result};},
   async run(){const result=stmt.run(...args);return{meta:{changes:result.changes}};}
  };}};},
  async batch(statements){
   db.exec("BEGIN IMMEDIATE");try{
    const result=[];
    for(const s of statements){
     if(typeof s.run==="function")result.push(await s.run());
     else throw Error("invalid D1 batch fixture statement");
    }
    db.exec("COMMIT");return result;
   }catch(e){db.exec("ROLLBACK");throw e;}
  }
 };
}
export async function ecdsa(){
 const pair=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);
 const spki=Buffer.from(await crypto.subtle.exportKey("spki",pair.publicKey)).toString("base64");
 const signed=async(uri,body)=>{
  const bytes=new TextEncoder().encode(typeof body==="string"?body:JSON.stringify(body));
  const sig=Buffer.from(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},pair.privateKey,bytes)).toString("base64");
  return new Request(uri,{method:"POST",headers:{"X-Brick-Signature":sig,"Content-Type":"application/json"},body:bytes});
 };
 return {pair,spki,signed};
}
export function addDevice(db,id,spki){
 assert.equal(db.prepare("INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?1,'Synthetic',?2,?3)").run(id,spki,Date.now()).changes,1);
}
