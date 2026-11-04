#!/usr/bin/env node
// 8D.17: deny dangerously broad lifecycle policy in source; not live Cloudflare attestation.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const body=JSON.parse(readFileSync("audit/phase8d/PHASE8D_R2_LIFECYCLE_TARGET.json","utf8"));
assert.deepEqual(Object.keys(body),["rules"]);
assert.equal(body.rules.length,2,"review extra R2 rules individually; never silently overwrite existing bucket rules");
const expected=new Map([["history/raw/",30*86400],["history/trusted/",90*86400]]);
const seen=new Set();
for(const rule of body.rules){
 const prefix=rule.conditions?.prefix;
 assert(expected.has(prefix),"unsafe unknown or bucket-wide R2 lifecycle prefix: "+String(prefix));
 assert.equal(seen.has(prefix),false,"duplicate policy prefix");
 seen.add(prefix);
 assert.equal(rule.enabled,true);
 assert.match(rule.id,/^brick-(raw|trusted)-history-(30|90)d$/);
 assert.deepEqual(Object.keys(rule).sort(),["conditions","deleteObjectsTransition","enabled","id"]);
 assert.deepEqual(rule.deleteObjectsTransition.condition,{type:"Age",maxAge:expected.get(prefix)});
}
assert.equal(seen.size,expected.size);
const notes=readFileSync("audit/phase8d/PHASE8D_R2_LIFECYCLE_TARGET.md","utf8");
for(const keyword of ["Legacy","NOT applied","read-only","merge","P8D-014"])assert(notes.includes(keyword));
console.log("PASS 8D.17: R2 history 30/90-day prefix lifecycle target is syntactically bounded with no bucket-wide delete; live rule application/legacy retention remain unverified");
