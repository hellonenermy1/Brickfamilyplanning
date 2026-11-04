#!/usr/bin/env node
// 8D.17: exercise actual backend cleanup functions on real disposable SQLite.
// No private or live data; R2 policy is explicitly outside this test's scope.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const [phase4Bundle,phase5cBundle,opsBundle]=process.argv.slice(2);
assert(phase4Bundle&&phase5cBundle&&opsBundle,"pass three esbuild bundles");
const phase4=await import(pathToFileURL(phase4Bundle).href);
const phase5c=await import(pathToFileURL(phase5cBundle).href);
const ops=await import(pathToFileURL(opsBundle).href);
const db=new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys=ON;");
const schema=["001_init.sql","002_phase2_health.sql","003_phase4_safety.sql","004_phase5_operations.sql","007_phase5c_hardening.sql"];
for(const file of schema)db.exec(readFileSync("schema/"+file,"utf8"));
const prepare=(sql)=>{return {bind(...args){const st=db.prepare(sql);return {
 async first(){return st.get(...args)??null;},
 async all(){return {results:st.all(...args)};},
 async run(){const result=st.run(...args);return {meta:{changes:result.changes}};}
};}};};
const env={DB:{prepare,async batch(stmts){db.exec("BEGIN IMMEDIATE");try{const result=[];for(const stmt of stmts)result.push(await stmt.run());db.exec("COMMIT");return result;}catch(e){db.exec("ROLLBACK");throw e;}}}};
const d=86_400_000,now=1_790_000_000_000;
function put(sql,...values){db.prepare(sql).run(...values);}
function n(sql,...args){return Number(db.prepare(sql).get(...args)?.n??0);}
try{
 put("INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES('a','A','test-a',?1)",now-500*d);
 put("INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES('b','B','test-b',?1)",now-500*d);
 put("INSERT INTO retention_settings(device_id,safety_event_days,updated_at) VALUES('a',30,?1)",now);
 put("INSERT INTO retention_settings(device_id,safety_event_days,updated_at) VALUES('b',365,?1)",now);
 for(const [id,owner,age] of [["a-old","a",31],["a-new","a",29],["b-retain","b",40],["b-delete","b",366]]){
   put("INSERT INTO safety_events(id,device_id,kind,device_created_at,server_created_at) VALUES(?1,?2,'safe_checkin',?3,?3)",id,owner,now-age*d);
 }
 put("INSERT INTO pairing_tokens(token_hash,device_name,expires_at) VALUES('expired','A',?1)",now-2*d);
 put("INSERT INTO pairing_tokens(token_hash,device_name,expires_at) VALUES('recent','B',?1)",now-d/2);
 put("INSERT INTO device_events(device_id,epoch,sequence,kind,created_at) VALUES('a',1,1,'location',?1)",now-31*d);
 put("INSERT INTO device_events(device_id,epoch,sequence,kind,created_at) VALUES('b',1,2,'location',?1)",now-29*d);
 for(const [id,owner,age] of [["crash-old","a",366],["crash-new","b",364]]){
  put("INSERT INTO crash_reports(report_id,device_id,app_version,module,exception_signature,device_created_at,received_at) VALUES(?1,?2,'test','engine','aabbccdd11223344',?3,?3)",id,owner,now-age*d);
 }
 for(const [path,age] of [["old",91],["new",89]]){
   put("INSERT INTO audit_log(event_type,method,path,status,created_at) VALUES('test','POST',?1,200,?2)",path,now-age*d);
 }
 for(const age of [36,34]){
   put("INSERT INTO device_health_samples(device_id,received_at,service_active,location_enabled,location_subscribed,network,pending_records,recovery_count,position_available,health_status,health_reason) VALUES('a',?1,1,1,1,'wifi',0,0,1,'healthy','ok')",now-age*d);
 }
 for(const [id,ended] of [["old-closed",now-366*d],["recent-closed",now-364*d],["still-open",null]]){
  put("INSERT INTO health_incidents(id,device_id,kind,severity,started_at,last_seen_at,ended_at) VALUES(?1,'b','offline','medium',?2,?2,?3)",id,now-400*d,ended);
 }
 const realNow=Date.now;Date.now=()=>now;
 try{await phase4.runRetentionCleanup(env);}finally{Date.now=realNow;}
 await phase5c.cleanupPhase5C(env,now);
 await ops.cleanupOps(env,now);
 for(const [table,column,keep,drop] of [
  ["safety_events","id",["a-new","b-retain"],["a-old","b-delete"]],
  ["pairing_tokens","token_hash",["recent"],["expired"]],
  ["crash_reports","report_id",["crash-new"],["crash-old"]],
  ["audit_log","path",["new"],["old"]],
  ["health_incidents","id",["recent-closed","still-open"],["old-closed"]]
 ]){
  for(const value of keep)assert.equal(n("SELECT COUNT(*) AS n FROM "+table+" WHERE "+column+"=?1",value),1,table+" prematurely erased "+value);
  for(const value of drop)assert.equal(n("SELECT COUNT(*) AS n FROM "+table+" WHERE "+column+"=?1",value),0,table+" retained "+value);
 }
 assert.equal(n("SELECT COUNT(*) AS n FROM device_events"),1,"30-day device events trim");
 assert.equal(n("SELECT COUNT(*) AS n FROM device_health_samples"),1,"35-day health samples trim");
 assert.equal(n("SELECT COUNT(*) AS n FROM devices"),2,"cleanup deleted a registered device");
 assert.equal(n("SELECT COUNT(*) AS n FROM retention_settings"),2,"cleanup removed another family's policy");
 assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0,"cleanup violated foreign key relations");
 console.log("PASS 8D.17: real SQLite per-device safety policies, crash/audit/health/command cleanup and cross-device isolation; R2 history/log policy NOT VERIFIED");
}finally{db.close();}
