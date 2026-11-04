import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
const {parentReverseOneMap}=await import(pathToFileURL(process.argv[2]).href);
let calls=0;const env={DB:{prepare(){calls++;throw Error("invalid input reached provider budget")}}};
const call=q=>parentReverseOneMap(new Request("https://brick.invalid/parent/api/onemap/reverse?"+q),env);
for(const q of ["","lat=&lon=","lat=1.30","lon=103.80","lat=NaN&lon=103.8","lat=Infinity&lon=103.8","lat=91&lon=103.8","lat=1.3&lon=200","lat=invalid&lon=103.8","lat=1.3&lon="]){
 const r=await call(q);assert.equal(r.status,400,"invalid coordinates: "+q);
}
const outside=await call("lat=0&lon=0");
assert.equal(outside.status,200);assert.equal((await outside.json()).source,"outside_singapore");
assert.equal(calls,0);
console.log("PASS P8D-022 10 invalid OneMap query cases and valid 0,0 without provider calls");
