#!/usr/bin/env node
// Phase 8D control write test using genuine SQLite constraints/SQL; synthetic device only.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
const [moduleFile] = process.argv.slice(2);
if (!moduleFile) throw Error("usage: test-phase8d-controls-sqlite.mjs <bundle>");
const ctl = await import(pathToFileURL(moduleFile).href);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"brick-p8d-controls-"));
const db=path.join(dir,"controls.db");
const deviceId="12345678-1234-4234-8234-123456789abc";
function q(command){
  const text=execFileSync("sqlite3",["-json",db],{input:"PRAGMA foreign_keys=ON;\n"+command,encoding:"utf8"}).trim();
  return text?JSON.parse(text):[];
}
function val(x) {
  if(x===null)return "NULL";
  if(typeof x==="string")return "'"+x.replaceAll("'","''")+"'";
  if(typeof x==="number"&&Number.isFinite(x))return String(x);
  throw Error("unexpected bound SQL value");
}
function subst(sql,args) {return sql.replace(/\?(\d+)/g,(_m,n)=>val(args[Number(n)-1]));}
let revokeDuringWrite=false;
const env={DB:{
  prepare(sql){return {bind(...args){return {sql,args,
    async first(){
      const result=q(subst(sql,args));
      if(revokeDuringWrite && sql.includes("SELECT revoked_at")) {
        revokeDuringWrite=false;
        q("UPDATE devices SET revoked_at=123456 WHERE id="+val(deviceId)+";");
        return {revoked_at:null}; // simulate revocation after the successful earlier read
      }
      return result[0]??null;
    },
    async run(){
      const result=q(subst(sql,args)+";SELECT changes() AS n;");
      return {meta:{changes:Number(result[0]?.n??0)}};
    }
  };}};},
  async batch(statements){
    const sql="BEGIN IMMEDIATE;\n"+statements.map(x=>subst(x.sql,x.args)+";").join("\n")+"\nCOMMIT;";
    q(sql);
    return statements.map(()=>({success:true,meta:{changes:1}}));
  }
}};
const request=(endpoint,body)=>new Request("https://brick.example/parent/api/device/"+deviceId+"/"+endpoint,{method:"POST",body:JSON.stringify(body)});
try{
  for(const name of ["001_init.sql","002_phase2_health.sql","003_phase4_safety.sql","004_phase5_operations.sql","007_phase5c_hardening.sql","008_v1_phase2_evidence.sql","009_v1_phase5_fusion.sql","010_phase5b_closure.sql","011_v1_phase6_location_control.sql","015_phase8_device_identity.sql","016_p8b_remediation.sql","017_p8b_provider_rate.sql","018_p8b_pin_pairing.sql"])
    q(fs.readFileSync(path.join("schema",name),"utf8"));
  // Only requires a synthetic unique device identity string, not a usable secret.
  q("INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES("+val(deviceId)+",'Synthetic','synthetic-no-secret',100);");
  const wifiData={schedules:[{id:"night",enabled:true,targetEnabled:false,localMinuteOfDay:1270,daysMask:127,graceMinutes:15}]};
  const live1=await ctl.parentSetLiveTrack(request("live-track",{active:true}),env,deviceId);
  assert.equal(live1.status,200,"active Live Track command must work");
  assert.equal(q("SELECT COUNT(*) AS n FROM device_live_track_control")[0].n,1);
  const live2=await ctl.parentSetLiveTrack(request("live-track",{active:false}),env,deviceId);
  assert.equal(live2.status,200,"active Live Track UPSERT must work");
  assert.equal(q("SELECT COUNT(*) AS n FROM device_live_track_control")[0].n,1,"UPSERT must not duplicate command");
  const wifi1=await ctl.parentSetWifiSchedules(request("wifi-schedules",wifiData),env,deviceId);
  assert.equal(wifi1.status,200,"active Wi-Fi schedule must save");
  assert.equal(q("SELECT COUNT(*) AS n FROM device_wifi_schedules")[0].n,1);
  // Race: device is revoked after active-state read, before conditional SQL write.
  revokeDuringWrite=true;
  const race=await ctl.parentSetLiveTrack(request("live-track",{active:true}),env,deviceId);
  assert.equal(race.status,410,"atomic SQL write must refuse post-read revocation");
  const before=q("SELECT command_id FROM device_live_track_control")[0].command_id;
  const liveRevoked=await ctl.parentSetLiveTrack(request("live-track",{active:true}),env,deviceId);
  assert.equal(liveRevoked.status,410);
  const wifiRevoked=await ctl.parentSetWifiSchedules(request("wifi-schedules",wifiData),env,deviceId);
  assert.equal(wifiRevoked.status,410);
  assert.equal(q("SELECT command_id FROM device_live_track_control")[0].command_id,before);
  assert.equal(q("SELECT COUNT(*) AS n FROM device_wifi_schedules")[0].n,1,"revocation cannot delete existing audit configuration");
  console.log("P8D-006 PASS: real SQLite schema active/UPSERT writes, revoked writes refused, TOCTOU guarded, old rows preserved.");
}finally {fs.rmSync(dir,{recursive:true,force:true});}
