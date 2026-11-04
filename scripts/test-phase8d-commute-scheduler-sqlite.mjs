import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {newDatabase,adapter} from "./phase8d-native-fixture.mjs";
const source=readFileSync("src/worker-p8b.ts","utf8");
assert.doesNotMatch(source,/SELECT id FROM devices WHERE revoked_at IS NULL ORDER BY id LIMIT 100/,"first 100 commute devices are always chosen: remaining families starve");
assert.match(source,/nextCommuteRefreshCandidates\(/);
const {nextCommuteRefreshCandidates}=await import(pathToFileURL(process.argv[2]).href);
const db=newDatabase();
try{
 const ids=[];
 for(let i=1;i<=107;i++){
  const id="00000000-0000-4000-8000-"+i.toString(16).padStart(12,"0");
  ids.push(id);
  db.prepare("INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?1,'Fake','key-'||?1,1)").run(id);
 }
 for(const id of [ids[22],ids[49],ids[103]])db.prepare("UPDATE devices SET revoked_at=1 WHERE id=?1").run(id);
 const eligible=ids.filter(id=>![ids[22],ids[49],ids[103]].includes(id));
 const seen=new Set();
 for(let turn=0;turn<7;turn++){
  const current=await nextCommuteRefreshCandidates(adapter(db),20,1790000000000+turn*60000);
  assert(current.length>=1&&current.length<=20,"bounded scheduled work");
  for(const id of current) {
   assert(eligible.includes(id),"scheduled a revoked/unknown device");
   seen.add(id);
  }
 }
 assert.deepEqual([...seen].sort(),eligible.sort(),"cursor never reached devices beyond original first 100");
 const remaining=db.prepare("PRAGMA foreign_key_check").all();assert.equal(remaining.length,0);
 console.log("PASS P8D-023 104 eligible scheduled devices covered by bounded 20-per-tick rotating cursor; revoked excluded");
}finally{db.close();}
