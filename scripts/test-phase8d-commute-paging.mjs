import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {newCardfreeDatabase,ecdsa,DEVICE_A} from './phase8d-native-fixture.mjs';
const dir=fs.mkdtempSync(path.resolve('.brick-commute-paging-'));let mf,passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}}
try{
 for(const [name,file]of [['commute','src/commute-summary.ts'],['storage','src/dev-free-runtime.ts'],['budget','src/d1-work-budget.ts']])await build({entryPoints:[file],outfile:path.join(dir,name+'.mjs'),bundle:true,format:'esm',platform:'node',target:'node24'});
 const {refreshCommutes}=await import(pathToFileURL(path.join(dir,'commute.mjs')).href),{D1ObjectBucket}=await import(pathToFileURL(path.join(dir,'storage.mjs')).href),{d1WorkBudget}=await import(pathToFileURL(path.join(dir,'budget.mjs')).href);
 mf=new Miniflare(convertV4MiniflareOptions({name:'commute-paging',modules:true,script:'export default{fetch(){return new Response("synthetic");}}',compatibilityDate:'2026-10-24',d1Databases:['DB']}));
 const db=await mf.getD1Database('DB'),fixture=newCardfreeDatabase();for(const row of fixture.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all())await db.prepare(row.sql).run();fixture.close();
 const now=Date.now(),k=await ecdsa();await db.prepare('INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?1,?2,?3,?4)').bind(DEVICE_A,'Synthetic commute paging',k.spki,now).run();
 function packet(sequence,stamp,lat=10000000,activity=2){return [2,1,sequence,sequence*1000,stamp,80000000,80000000,100,lat,10000000,1000,300,10,0,0,0,100,80,2,activity,90,1,1,4,6,400,1,null];}
 async function seed(count,step,start=now-20*3600000){for(let i=0;i<count;i++){const stamp=start+i*step,p=JSON.stringify(packet(i+1,stamp,10000000+i*100));await db.prepare('INSERT INTO dev_location_history VALUES(?1,?1,1,?2,?3,?4,?5,?5,?6)').bind(DEVICE_A,i+1,stamp,Math.floor(stamp/900000)*900000,p,now-1000).run();}}
 await test('more than44 virtual history segments completes without repeatedly exhausting one computation',async()=>{await seed(64,900000);let complete=false;for(let attempt=0;attempt<8&&!complete;attempt++){const budget=d1WorkBudget(db,44),env={DB:budget.db,HISTORY:new D1ObjectBucket(budget.db),BETA_STORAGE_MODE:'d1'};const result=await refreshCommutes(env,DEVICE_A,now-2*86400000,now);assert.ok(budget.used()<=44);complete=result.complete===true;}assert.equal(complete,true,'bounded scans must make durable progress and complete');});
 console.log(JSON.stringify({suite:'commute-paging',passed,failed,scope:'actual local D1; synthetic trusted history and44-statement computation guard; no cloud writes'}));if(failed)process.exitCode=1;
}finally{if(mf)await mf.dispose();fs.rmSync(dir,{recursive:true,force:true});}
