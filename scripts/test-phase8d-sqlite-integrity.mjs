#!/usr/bin/env node
// 8D.8: executable production schema integrity and constraint tests on disposable native SQLite.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const db=new DatabaseSync(":memory:");
const files=["001_init.sql","002_phase2_health.sql","003_phase4_safety.sql","004_phase5_operations.sql","007_phase5c_hardening.sql","008_v1_phase2_evidence.sql","009_v1_phase5_fusion.sql","010_phase5b_closure.sql","011_v1_phase6_location_control.sql","015_phase8_device_identity.sql","016_p8b_remediation.sql","017_p8b_provider_rate.sql","018_p8b_pin_pairing.sql"];
try{
 db.exec("PRAGMA foreign_keys=ON");
 for(const file of files)db.exec(readFileSync("schema/"+file,"utf8"));
 assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
 assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);
 const names=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name));
 const durable=["devices","device_location_control","geofences","geofence_state","ble_anchors","trips","retention_settings","safety_events","health_incidents","crash_reports","audit_log","device_replay_state","device_live_track_control","device_wifi_schedules","device_wifi_schedule_result","device_capability_profile","screen_time_daily","commute_summaries"];
 for(const table of durable)assert(names.has(table),"missing durable table "+table);
 db.prepare("INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES('a','A','synthetic-spki',1)").run();
 assert.throws(()=>db.prepare("INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES('b','B','synthetic-spki',1)").run(),/constraint|unique/i,"duplicate physical child key accepted");
 db.prepare("INSERT INTO device_events(device_id,epoch,sequence,kind,created_at) VALUES('a',2,100,'location',1)").run();
 assert.throws(()=>db.prepare("INSERT INTO device_events(device_id,epoch,sequence,kind,created_at) VALUES('a',2,100,'location',2)").run(),/constraint|unique/i,"duplicate epoch sequence accepted");
 assert.throws(()=>db.prepare("INSERT INTO safety_events(id,device_id,kind,device_created_at,server_created_at) VALUES('orphan','missing','safe_checkin',1,1)").run(),/foreign|constraint/i,"orphan safety row accepted");
 assert.throws(()=>db.prepare("INSERT INTO retention_settings(device_id,safety_event_days,updated_at) VALUES('a',0,1)").run(),/check|constraint/i,"invalid retention interval accepted");
 db.prepare("INSERT INTO safety_events(id,device_id,kind,device_created_at,server_created_at) VALUES('safe','a','safe_checkin',1,1)").run();
 db.prepare("INSERT INTO retention_settings(device_id,safety_event_days,updated_at) VALUES('a',180,1)").run();
 db.prepare("UPDATE devices SET revoked_at=42 WHERE id='a'").run();
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM safety_events WHERE device_id='a'").get().n,1,"revoke destroyed retained history");
 assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0,"invalid relationships after revocation");
 for(const [table,index] of [
  ["device_events","idx_device_events_device_time"],
  ["safety_events","idx_safety_events_device_time"],
  ["health_incidents","idx_health_incidents_device_time"],
  ["audit_log","idx_audit_log_time"]
 ])assert(db.prepare("PRAGMA index_list("+table+")").all().some(x=>x.name===index),"missing query index "+index);
 console.log("PASS 8D.8: production 001–018 source migration chain, 18 durable tables, SQLite integrity/FK/unique/check/revocation-retention/index tests; Cloudflare D1 concurrency and rollback still pending");
}finally{db.close();}
