import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
import {newDatabase,adapter,addDevice,DEVICE_A} from "./phase8d-native-fixture.mjs";
const {parentCommutes}=await import(pathToFileURL(process.argv[2]).href);
const {parentScreenTime}=await import(pathToFileURL(process.argv[3]).href);
const db=newDatabase();
try{
 addDevice(db,DEVICE_A,"key");const env={DB:adapter(db)};
 for(const limit of [NaN,Infinity,-Infinity,-1,0,1.5]){
  let commute;try{commute=await parentCommutes(env,DEVICE_A,limit)}catch(e){throw Error("commute query threw instead of 400 for "+String(limit)+": "+e);}
  assert.equal(commute.status,400,"invalid commute limit silently accepted");
  let screen;try{screen=await parentScreenTime(env,DEVICE_A,limit)}catch(e){throw Error("screen-time query threw instead of 400 for "+String(limit)+": "+e);}
  assert.equal(screen.status,400,"invalid screen-time days silently accepted");
 }
 for(const limit of [1,14,100,1000]){
  assert.equal((await parentCommutes(env,DEVICE_A,limit)).status,200);
  assert.equal((await parentScreenTime(env,DEVICE_A,limit)).status,200);
 }
 console.log("PASS P8D-028 native SQLite: bounded positive integer query args, NaN/Infinity/negative/fraction reject 400 for commute and screen time");
}finally{db.close();}
