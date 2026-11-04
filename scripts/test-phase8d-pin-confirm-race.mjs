#!/usr/bin/env node
// Phase 8D.8/.13: competitor confirms between SELECT and batch; real SQLite UNIQUE index.
// No Cloudflare changes. A losing request must return the winner, not a false 500.
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const [bundle]=process.argv.slice(2);
if(!bundle)throw Error("usage: test-phase8d-pin-confirm-race.mjs <pin pairing bundle>");
const {parentConfirmPin}=await import(pathToFileURL(bundle).href);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"brick-p8d-pin-race-")),db=path.join(dir,"pin.sqlite");
const id=crypto.randomUUID(),winner=crypto.randomUUID(),now=Date.now();
const origin="https://brick.example";
function dbRaw(sql){return execFileSync("sqlite3",["-bail","-json",db],{input:"PRAGMA foreign_keys=ON;\n"+sql,encoding:"utf8",maxBuffer:8*1024*1024}).trim();}
function q(sql){const out=dbRaw(sql);return out?JSON.parse(out):[];}
function lit(v){if(v===null)return "NULL";if(typeof v==="string")return "'"+v.replaceAll("'","''")+"'";if(typeof v==="number"&&Number.isFinite(v))return String(v);throw Error("invalid SQL value");}
function sub(sql,args){return sql.replace(/\?(\d+)/g,(_s,n)=>{const i=Number(n)-1;assert(i<args.length);return lit(args[i]);});}
let winnerInjected=false;
const env={PAIR_RATE:{async limit(){return {success:true};}},DB:{
 prepare(sql){return {bind(...args){return {sql,args,
  async first(){
   const rows=q(sub(sql,args));
   if(!winnerInjected&&sql.includes("FROM pairing_pin_sessions WHERE id=")){
     winnerInjected=true;
     const row=rows[0];assert(row?.confirmed_at===null);
     const commands=[
       "BEGIN IMMEDIATE",
       "INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES("+lit(winner)+",'Winner',"+lit(row.pending_public_key_spki_b64)+","+now+")",
       "UPDATE pairing_pin_sessions SET confirmed_at="+now+",device_id="+lit(winner)+" WHERE id="+lit(id),
       "COMMIT"
     ].join(";\n")+";";
     dbRaw(commands);
   }
   return rows[0]??null;
  },
  async run(){const result=dbRaw(sub(sql,args)+";SELECT changes() AS n;");const m=result.match(/"n"\s*:\s*(\d+)/);return {meta:{changes:Number(m?.[1]??0)}};}
 };}};},
 async batch(stmts){
  // D1.batch wraps statements transactionally. Unique-key violation aborts the batch.
  const sql="BEGIN IMMEDIATE;\n"+stmts.map(s=>sub(s.sql,s.args)+";\nSELECT changes() AS change_count;").join("\n")+"\nCOMMIT;";
  const output=dbRaw(sql);
  const changes=[...output.matchAll(/"change_count"\s*:\s*(\d+)/g)].map(m=>Number(m[1]));
  assert.equal(changes.length,stmts.length,"read real SQLite changes for each atomic statement");
  return changes.map(n=>({success:true,meta:{changes:n}}));
 }
}};
const request=()=>new Request(origin+"/parent/api/pair/pin/"+id,{method:"POST",headers:{Origin:origin}});
try{
 for(const file of ["001_init.sql","002_phase2_health.sql","003_phase4_safety.sql","004_phase5_operations.sql","007_phase5c_hardening.sql","008_v1_phase2_evidence.sql","009_v1_phase5_fusion.sql","010_phase5b_closure.sql","011_v1_phase6_location_control.sql","015_phase8_device_identity.sql","016_p8b_remediation.sql","017_p8b_provider_rate.sql","018_p8b_pin_pairing.sql"])q(fs.readFileSync(path.join("schema",file),"utf8"));
 const pair=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);
 const spki=Buffer.from(await crypto.subtle.exportKey("spki",pair.publicKey)).toString("base64");
 q("INSERT INTO pairing_pin_sessions(id,pin_hash,device_name,created_at,expires_at,claimed_at,pending_public_key_spki_b64,claim_secret_hash) VALUES("+lit(id)+",'fake-hash-unique','Child',"+(now-5000)+","+(now+600000)+","+(now-1000)+","+lit(spki)+",'synthetic-claim-hash')");
 const response=await parentConfirmPin(request(),env,id);
 assert.equal(q("SELECT COUNT(*) AS n FROM devices")[0].n,1,"real UNIQUE index prevents double registration even on losing race");
 assert.equal(q("SELECT device_id FROM pairing_pin_sessions WHERE id="+lit(id))[0].device_id,winner,"winner session must remain intact");
 assert.equal(response.status,200,"competing winner must resolve idempotently instead of false 500; got "+response.status);
 const body=await response.json();
 assert.equal(body.deviceId,winner,"loser must report already confirmed winning device");
 assert.equal(q("SELECT COUNT(*) AS n FROM devices")[0].n,1,"no ghost/duplicate device may be inserted");
 assert.equal(q("SELECT device_id FROM pairing_pin_sessions WHERE id="+lit(id))[0].device_id,winner);
 const repeated=await parentConfirmPin(request(),env,id);
 assert.equal(repeated.status,200,"confirmation retry should return original successful device");
 assert.equal((await repeated.json()).deviceId,winner);
 assert.equal(q("SELECT COUNT(*) AS n FROM devices")[0].n,1);
 console.log("PASS P8D-010: real SQLite competing confirmation returns winner, one unique device, repeated confirmation idempotent.");
}finally{fs.rmSync(dir,{recursive:true,force:true});}
