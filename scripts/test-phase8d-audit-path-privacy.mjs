#!/usr/bin/env node
// P8D-013: execute actual audit logger with synthetic identifiers; no account data.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const bundle=process.argv[2];
assert.ok(bundle,"Pass esbuild phase5c bundle");
const {recordAudit}=await import(pathToFileURL(bundle).href);
const device="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const resource="ffffffff-1111-4222-8333-444444444444";
const session="99999999-9999-4999-8999-999999999999";
const captured=[];
const env={DB:{prepare(sql){return {bind(...values){return {async run(){captured.push({sql,values});return {meta:{changes:1}};}};}};}}};
const paths=[
 ["/parent/api/device/"+device+"/geofences/"+resource,"/parent/api/device/{device}/geofences/{resource}"],
 ["/parent/api/device/"+device+"/trips/"+resource+"/end","/parent/api/device/{device}/trips/{resource}/end"],
 ["/parent/api/device/"+device+"/revoke","/parent/api/device/{device}/revoke"],
 ["/parent/api/pair/pin/"+session,"/parent/api/pair/pin/{session}"],
 ["/parent/api/anything/SecretToken123456","/parent/api/{redacted}/{redacted}"]
];
for(const [pathname,wanted] of paths){
 const request=new Request("https://brick.invalid"+pathname+"?apiKey=sensitive&latitude=1.35",{method:"POST"});
 await recordAudit(env,"parent_mutation",request,403,{deviceId:device,reason:"origin_denied"});
 const row=captured.at(-1);
 assert.ok(row,"audit record not written");
 assert.equal(row.values[2],wanted,"audit route must preserve only non-identifying shape");
 const serialized=JSON.stringify(row.values);
 for(const secret of [device,resource,session,"SecretToken123456","sensitive","1.35"]){
  assert.equal(serialized.includes(secret),false,"audit record leaked test secret or device identifier");
 }
 assert.equal(row.values[3],403);
 assert.equal(typeof JSON.parse(row.values[5]).deviceRef,"string","device ID must retain a stable pseudonymous audit reference");
 assert.equal(JSON.parse(row.values[5]).deviceId,undefined,"raw device ID must not be written");
}
console.log("PASS P8D-013: audited D1 paths and details redact device/session/resource identifiers, unexpected paths and query secrets");
