// 8D.4 P8D-018: fall-event pre-auth bounded body and type-safe parsing.
import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
const {maybeHandleFallEvent}=await import(pathToFileURL(process.argv[2]).href);
const id="00000000-0000-4000-8000-000000000001";
let effects=0;
const env={DB:{prepare(){effects++;throw Error("invalid body reached D1")}},
 EVENTS:{send(){effects++;throw Error("invalid body reached Queue")}},
 BRICK_DEVICE:{get(){effects++;throw Error("invalid body reached DO")}}};
function send(body){return new Request("https://brick.invalid/api/device/"+id+"/event",{method:"POST",headers:{"Content-Type":"application/json"},body:typeof body==="string"?body:JSON.stringify(body)})}
const large=await maybeHandleFallEvent(send({kind:"fall_detected",detail:{padding:"X".repeat(20000)}}),env,id);
assert(large instanceof Response,"oversized payload must be rejected before any crypto/DB");
assert.equal(large.status,413,"oversized unauthenticated fall body was not bounded");
for(const bad of ["null","[]","42","\"string\"", "{not json"]){
 const r=await maybeHandleFallEvent(send(bad),env,id);
 assert(r instanceof Response,"malformed fall JSON must produce explicit 400 response");
 assert.equal(r.status,400);
}
const noSignature=await maybeHandleFallEvent(send({kind:"fall_detected",eventId:id,eventSequence:1,createdAtMs:Date.now(),detail:{confidence:"high"}}),env,id);
assert.equal(noSignature?.status,401,"small fall event must still require signed identity");
const unrelated=await maybeHandleFallEvent(send({kind:"safe_checkin"}),env,id);
assert.equal(unrelated,null,"non-fall event must be handled by existing safety route");
assert.equal(effects,0,"invalid/unauthorized requests reached persistence");
console.log("PASS P8D-018 bounded fall JSON, invalid scalars, signed boundary and no side effects");
