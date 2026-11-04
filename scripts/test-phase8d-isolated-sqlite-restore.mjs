#!/usr/bin/env node
// P8D-002 real SQLite exercise: disposable SQL databases only, never production Cloudflare.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";

const [moduleFile] = process.argv.slice(2);
if (!moduleFile) throw Error("usage: test-phase8d-isolated-sqlite-restore.mjs <bundled restore module>");
const restore = await import(pathToFileURL(moduleFile).href);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "brick-p8d-restore-"));
const source = path.join(dir,"source.db"), target = path.join(dir,"target.db");
const SCHEMAS = ["001_init.sql","002_phase2_health.sql","003_phase4_safety.sql","004_phase5_operations.sql","007_phase5c_hardening.sql","008_v1_phase2_evidence.sql","009_v1_phase5_fusion.sql","010_phase5b_closure.sql","011_v1_phase6_location_control.sql","015_phase8_device_identity.sql","016_p8b_remediation.sql","017_p8b_provider_rate.sql","018_p8b_pin_pairing.sql"];
function sql(db,statement) {
  const out=execFileSync("sqlite3",["-json",db],{input:"PRAGMA foreign_keys=ON;\n"+statement,encoding:"utf8",maxBuffer:8*1024*1024}).trim();
  return out?JSON.parse(out):[];
}
function install(db) { for(const file of SCHEMAS)sql(db,fs.readFileSync(path.join("schema",file),"utf8")); }
function literal(v) {
  if(v===null)return "NULL";
  if(typeof v==="number" && Number.isFinite(v))return String(v);
  if(typeof v==="string")return "'"+v.replaceAll("'","''")+"'";
  throw Error("unsupported fixture value");
}
function materialize(q,args) {return q.replace(/[?]([0-9]+)/g,(_m,n)=>{const i=Number(n)-1;assert(i>=0&&i<args.length);return literal(args[i]);});}
function adapter(db) {
  function stmt(q,args=[]) {return {sql:q,args,bind(...next){return stmt(q,next);},async first(){return sql(db,materialize(q,args))[0]??null;}};}
  return {prepare(q){return stmt(q);},async batch(stmts){
    sql(db,"BEGIN IMMEDIATE;\n"+stmts.map(x=>materialize(x.sql,x.args)+";").join("\n")+"\nCOMMIT;");
    return stmts.map(()=>({success:true,meta:{changes:1}}));
  }};
}
function all(db,table) {return sql(db,"SELECT * FROM "+table);}
function canonical(rows) {return rows.map(x=>JSON.stringify(Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))))).sort();}
try {
  install(source);
  const pair=await crypto.webcrypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);
  const spki=Buffer.from(await crypto.webcrypto.subtle.exportKey("spki",pair.publicKey)).toString("base64");
  const fixture=[
    "INSERT INTO devices(id,name,public_key_spki_b64,created_at,revoked_at,last_epoch,last_sequence) VALUES('child-a','Fixture',"+literal(spki)+",1793000000000,1793000001000,11,425)",
    "INSERT INTO device_location_control(device_id,desired_enabled,command_id,issued_at,updated_at,command_status) VALUES('child-a',1,'location-command-1',1793000000000,1793000000000,'pending')",
    "INSERT INTO device_replay_state(device_id,last_health_sequence,updated_at) VALUES('child-a',201,1793000000300)",
    "INSERT INTO device_live_track_control(device_id,command_id,requested_active,issued_at,expires_at,command_status) VALUES('child-a','live-command-1',1,1793000000000,1993000000000,'pending')",
    "INSERT INTO device_wifi_schedules(id,device_id,enabled,target_enabled,local_minute_of_day,days_mask,grace_minutes,updated_at) VALUES('night','child-a',1,0,1320,127,15,1793000000000)",
    "INSERT INTO device_wifi_schedule_result(device_id,schedule_id,target_enabled,actual_enabled,status,attempted_at,received_at) VALUES('child-a','night',0,0,'completed',1793000000000,1793000000100)",
    "INSERT INTO device_capability_profile(device_id,profile_version,profile_json,device_updated_at,received_at) VALUES('child-a',1,'{\"deviceOwner\":true}',1793000000000,1793000000200)",
    "INSERT INTO screen_time_daily(device_id,local_day,total_foreground_ms,session_count,summary_json,received_at) VALUES('child-a','2026-11-04',1234,2,'{\"privacy\":\"aggregate_only_no_package_names\"}',1793000000400)",
    "INSERT INTO commute_summaries(id,device_id,started_at,ended_at,distance_m,duration_ms,transport_mode,mode_confidence,provenance,created_at) VALUES('commute-a','child-a',1793000000000,1793000300000,2000,300000,'walking',0.7,'trusted_history_v1',1793000000500)",
    "INSERT INTO pairing_pin_sessions(id,pin_hash,device_name,created_at,expires_at) VALUES('temporary-pin','test_hash_not_secret','Disposable',1793000000000,1793000002000)",
    "INSERT INTO provider_rate_window(provider,window_start,request_count,updated_at) VALUES('onemap',1793000000000,1,1793000000000)",
    "INSERT INTO provider_cache(provider,cache_key,value_json,expires_at,updated_at) VALUES('onemap','temp','{}',1793000002000,1793000000000)"
  ];
  sql(source,"BEGIN IMMEDIATE;\n"+fixture.join(";\n")+";\nCOMMIT;");
  const names=[...restore.RESTORE_TABLE_ORDER];
  assert.equal(names.length,18,"expect all 18 durable tables");
  const tables=Object.fromEntries(names.map(name=>[name,all(source,name)]));
  for(const name of names.slice(12))assert.equal(tables[name].length,1,"must populate "+name);
  const payload={format:"brick-d1-snapshot-v2",createdAt:Date.now(),excludes:["pairing_pin_sessions","provider_rate_window","provider_cache"],tables};
  const zipped=gzipSync(Buffer.from(JSON.stringify(payload)));
  const body=zipped.buffer.slice(zipped.byteOffset,zipped.byteOffset+zipped.byteLength);
  const digest=crypto.createHash("sha256").update(zipped).digest("hex");
  fs.unlinkSync(source);
  assert(!fs.existsSync(source),"source must be deleted before restore");
  install(target);
  const result=await restore.restoreBackupToFreshD1({DB:adapter(target)},body,digest);
  assert.equal(result.format,"brick-d1-snapshot-v2");
  for(const name of names){
    const actual=all(target,name);
    assert.equal(result.restoredRows[name],tables[name].length,"result count "+name);
    assert.equal(actual.length,tables[name].length,"row count "+name);
    if(name==="device_location_control"||name==="device_live_track_control"){
      assert.equal(actual[0].command_status,"expired","replayed pending command "+name);
      assert.equal(actual[0].result_reason,"cancelled_on_disaster_restore");
    }else assert.deepEqual(canonical(actual),canonical(tables[name]),"restored data changed "+name);
  }
  for(const ephemeral of ["pairing_pin_sessions","provider_rate_window","provider_cache"])assert.equal(all(target,ephemeral).length,0,"old transient state revived "+ephemeral);
  assert.equal(all(target,"devices")[0].revoked_at,1793000001000,"revocation lost");
  assert.equal(all(target,"device_replay_state")[0].last_health_sequence,201,"replay high-water lost");
  await assert.rejects(()=>restore.restoreBackupToFreshD1({DB:adapter(target)},body,digest),/restore target is not empty/);
  console.log("P8D-002 PASS disposable SQLite: real schema, destroyed source, 18-table restore, no command replay or transient secret revival.");
}finally {fs.rmSync(dir,{recursive:true,force:true});}
