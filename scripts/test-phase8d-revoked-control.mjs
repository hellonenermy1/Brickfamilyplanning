import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { pathToFileURL } from "node:url";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const [modulePath] = process.argv.slice(2);
if (!modulePath) throw Error("usage: test-phase8d-revoked-control.mjs <bundle>");
const controls=await import(pathToFileURL(modulePath).href);
const deviceId="12345678-1234-4234-8234-123456789abc";
let writes=0, reads=0;
const db={
  prepare(sql){ return {bind(...args){return {
    async first(){ reads++; if(sql.includes("SELECT revoked_at")) return {revoked_at:12345}; return null;},
    async run(){writes++;return {meta:{changes:1}};}
  };}};},
  async batch(statements){ writes+=statements.length; return statements.map(()=>({meta:{changes:1}}));}
};
const live=await controls.parentSetLiveTrack(new Request("https://brick.example/parent/api/device/"+deviceId+"/live-track",{method:"POST",body:JSON.stringify({active:true})}),{DB:db},deviceId);
assert([403,404,410].includes(live.status),"revoked device Live Track must be rejected; got "+live.status);
assert.equal(writes,0,"revoked device Live Track persisted a command");
const wifi=await controls.parentSetWifiSchedules(new Request("https://brick.example/parent/api/device/"+deviceId+"/wifi-schedules",{method:"POST",body:JSON.stringify({schedules:[{id:"night",enabled:true,targetEnabled:false,localMinuteOfDay:1230,daysMask:127,graceMinutes:15}]})}),{DB:db},deviceId);
assert([403,404,410].includes(wifi.status),"revoked device schedule must be rejected; got "+wifi.status);
assert.equal(writes,0,"revoked device Wi-Fi schedule mutated state");
assert(reads>=2,"both mutations must check current revocation status");
console.log("P8D-006 PASS: revoked identity cannot queue Live Track or Wi-Fi control writes.");
