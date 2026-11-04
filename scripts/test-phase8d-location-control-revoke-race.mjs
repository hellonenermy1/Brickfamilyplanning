#!/usr/bin/env node
// P8D-016 8D.13: actual SQLite interleaving—revoke after parent SELECT,
// before location-control UPSERT. Must fail closed with no pending command.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const file=process.argv[2];assert(file);
const {parentSetLocationControl}=await import(pathToFileURL(file).href);
const id="00000000-0000-4000-8000-000000000001";
const db=new DatabaseSync(":memory:");
try{
 db.exec("PRAGMA foreign_keys=ON");
 for(const path of ["001_init.sql","011_v1_phase6_location_control.sql"]) db.exec(readFileSync("schema/"+path,"utf8"));
 for (const line of readFileSync("schema/016_p8b_remediation.sql","utf8").split("\n")){
  const m=line.trim().match(/^ALTER TABLE device_location_control ADD COLUMN (.+);$/);
  if(m)db.exec("ALTER TABLE device_location_control ADD COLUMN "+m[1]+";");
 }
 const insert=()=>db.prepare("INSERT OR IGNORE INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?1,'fixture','key',1)").run(id);
 const clean=()=>{db.prepare("DELETE FROM device_location_control").run();db.prepare("DELETE FROM devices").run();insert();};
 let revokeDuringCheck=false;
 const env={DB:{prepare(sql){return {bind(...params){return {
  async first(){
   const row=db.prepare(sql).get(...params)??null;
   if(revokeDuringCheck && sql.includes("SELECT revoked_at FROM devices")){
    revokeDuringCheck=false;
    db.prepare("UPDATE devices SET revoked_at=1 WHERE id=?1").run(id);
   }
   return row;
  },
  async run(){const x=db.prepare(sql).run(...params);return {meta:{changes:x.changes}};}
 };}};}}};
 const request=()=>new Request("https://brick.invalid/parent/api/device/"+id+"/location-control",{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://brick.invalid"},body:JSON.stringify({enabled:false})});
 clean();
 let ok=await parentSetLocationControl(request(),env,id);
 assert.equal(ok.status,200,"healthy device should accept one-shot command");
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM device_location_control WHERE device_id=?1").get(id).n,1);
 clean();revokeDuringCheck=true;
 const rejected=await parentSetLocationControl(request(),env,id);
 assert.equal(rejected.status,410,"revoked during registration must be rejected, not return a false 200");
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM device_location_control WHERE device_id=?1").get(id).n,0,"revocation race inserted an unauthorized command");
 clean();
 db.prepare("INSERT INTO device_location_control(device_id,desired_enabled,command_id,issued_at,updated_at,command_status) VALUES(?1,1,'old-command',5,5,'completed')").run(id);
 revokeDuringCheck=true;
 const noOverwrite=await parentSetLocationControl(request(),env,id);
 assert.equal(noOverwrite.status,410,"revoked during UPSERT must reject overwrite");
 assert.equal(db.prepare("SELECT command_id FROM device_location_control WHERE device_id=?1").get(id).command_id,"old-command");
 assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);
 console.log("PASS P8D-016: actual SQLite old row/new row TOCTOU revocation race refused, prior command retained");
}finally{db.close();}
