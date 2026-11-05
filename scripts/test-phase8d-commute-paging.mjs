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
 for(const [name,file]of [['commute','src/commute-summary.ts'],['storage','src/dev-free-runtime.ts'],['budget','src/d1-work-budget.ts'],['background','src/background-work.ts']])await build({entryPoints:[file],outfile:path.join(dir,name+'.mjs'),bundle:true,format:'esm',platform:'node',target:'node24'});
 const {refreshCommutes,parentCommutes}=await import(pathToFileURL(path.join(dir,'commute.mjs')).href),{D1ObjectBucket}=await import(pathToFileURL(path.join(dir,'storage.mjs')).href),{d1WorkBudget}=await import(pathToFileURL(path.join(dir,'budget.mjs')).href);
 mf=new Miniflare(convertV4MiniflareOptions({name:'commute-paging',modules:true,script:'export default{fetch(){return new Response("synthetic");}}',compatibilityDate:'2026-10-24',d1Databases:['DB']}));
 const db=await mf.getD1Database('DB'),fixture=newCardfreeDatabase();for(const row of fixture.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all())await db.prepare(row.sql).run();fixture.close();
 const {runBackgroundWork}=await import(pathToFileURL(path.join(dir,'background.mjs')).href);
 const now=Date.now(),k=await ecdsa();await db.prepare('INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?1,?2,?3,?4)').bind(DEVICE_A,'Synthetic commute paging',k.spki,now).run();
 function packet(sequence,stamp,lat=10000000,activity=2){return [2,1,sequence,sequence*1000,stamp,80000000,80000000,100,lat,10000000,1000,300,10,0,0,0,100,80,2,activity,90,1,1,4,6,400,1,null];}
 async function seed(count,step,start=now-20*3600000){for(let i=0;i<count;i++){const stamp=start+i*step,p=JSON.stringify(packet(i+1,stamp,10000000+i*100));await db.prepare('INSERT INTO dev_location_history VALUES(?1,?1,1,?2,?3,?4,?5,?5,?6)').bind(DEVICE_A,i+1,stamp,Math.floor(stamp/900000)*900000,p,now-1000).run();}}
 await test('more than44 virtual history segments completes without repeatedly exhausting one computation',async()=>{await seed(64,900000);let complete=false;for(let attempt=0;attempt<8&&!complete;attempt++){const budget=d1WorkBudget(db,44),env={DB:budget.db,HISTORY:new D1ObjectBucket(budget.db),BETA_STORAGE_MODE:'d1'};const result=await refreshCommutes(env,DEVICE_A,now-2*86400000,now);assert.ok(budget.used()<=44);complete=result.complete===true;}assert.equal(complete,true,'bounded scans must make durable progress and complete');});

 async function reset(){await db.prepare('DELETE FROM commute_summaries').run();await db.prepare('DELETE FROM dev_location_history').run();await db.prepare('DELETE FROM provider_cache').run();await db.prepare('UPDATE devices SET revoked_at=NULL WHERE id=?1').bind(DEVICE_A).run();}
 async function insert(points){for(let i=0;i<points.length;i+=500){const rows=points.slice(i,i+500).map(p=>({sequence:p[2],stamp:p[4],segment:Math.floor(p[4]/900000)*900000,packet:JSON.stringify(p)}));await db.prepare("INSERT INTO dev_location_history SELECT ?1,?1,1,json_extract(value,'$.sequence'),json_extract(value,'$.stamp'),json_extract(value,'$.segment'),json_extract(value,'$.packet'),json_extract(value,'$.packet'),?2 FROM json_each(?3)").bind(DEVICE_A,now-1000,JSON.stringify(rows)).run();}}
 async function slice(database=db){const budget=d1WorkBudget(database,44),r=await refreshCommutes({DB:budget.db,HISTORY:new D1ObjectBucket(budget.db),BETA_STORAGE_MODE:'d1'},DEVICE_A,now-2*86400000,now);assert.ok(budget.used()<=44);return r;}
 async function finish(){let r;for(let i=0;i<100;i++){r=await slice();if(r.complete)return r;}assert.fail('scan did not complete');}
 async function saved(){return await db.prepare("SELECT value_json FROM provider_cache WHERE provider='brick_commute_scan_v1' AND cache_key=?1").bind(DEVICE_A).first();}
 async function summaries(){return (await db.prepare('SELECT id,started_at,ended_at,distance_m,duration_ms,transport_mode,mode_confidence,provenance FROM commute_summaries ORDER BY id').all()).results;}
 const start=now-20*3600000;
 await test('independent slices resume durable512-point checkpoint and publish only after complete',async()=>{await reset();await insert(Array.from({length:1100},(_,i)=>packet(i+1,start+i*1000,10000000+i*100)));
  const first=await slice();assert.equal(first.complete,false);assert.equal(first.processedPoints,512);assert.equal((await summaries()).length,0);const a=JSON.parse((await saved()).value_json);assert.equal(a.cursor.sequence,512);
  const second=await slice();assert.equal(second.complete,false);assert.equal(second.processedPoints,1024);assert.equal((await summaries()).length,0);
  const done=await slice();assert.equal(done.complete,true);assert.equal(done.processedPoints,1100);assert.equal((await summaries()).length,1);
  const response=await parentCommutes({DB:db},DEVICE_A);const body=await response.json();assert.equal(body.progress.state,'COMPLETED');assert.ok(!JSON.stringify(body.progress).includes('cursor'));assert.ok(!JSON.stringify(body.progress).includes('trustedLat'));
 });
 await test('streamed trip geometry matches legacy trusted-history calculation across pages',async()=>{await reset();const points=Array.from({length:700},(_,i)=>packet(i+1,start+i*1000,10000000+i*100,i<300?2:3));await insert(points);
  await refreshCommutes({DB:db,HISTORY:new D1ObjectBucket(db)},DEVICE_A,now-2*86400000,now);const expected=await summaries();assert.equal(expected.length,1);
  await db.prepare('DELETE FROM commute_summaries').run();await finish();assert.deepEqual(await summaries(),expected);
 });
 await test('entire22001-point window is processed beyond the history API20000 cap',async()=>{await reset();await insert(Array.from({length:22001},(_,i)=>packet(i+1,start+i*1000,10000000+i*10)));
  const r=await finish();assert.equal(r.processedPoints,22001);const rows=await summaries();assert.equal(rows.length,1);assert.equal(rows[0].ended_at,start+22000*1000);
 });
 await test('failed atomic publication preserves prior cached generation and checkpoint for retry',async()=>{await reset();await insert(Array.from({length:1100},(_,i)=>packet(i+1,start+i*1000,10000000+i*100)));await finish();const prior=await summaries();
  await db.prepare("UPDATE dev_location_history SET trusted_packet_json=json_set(trusted_packet_json,'$[8]',10000000+sequence*120)").run();
  await slice();await slice();const checkpoint=(await saved()).value_json;
  const faulty={prepare:q=>db.prepare(q),batch:async()=>{throw Error('synthetic publication outage');}};
  await assert.rejects(()=>slice(faulty),/synthetic publication outage/);assert.deepEqual(await summaries(),prior);assert.equal((await saved()).value_json,checkpoint);
  await finish();assert.equal((await summaries()).length,1);assert.notDeepEqual(await summaries(),prior);const published=await summaries();await finish();assert.deepEqual(await summaries(),published);
 });
 await test('late inserted trusted point is excluded by watermark then included next generation',async()=>{await reset();await insert(Array.from({length:600},(_,i)=>packet(i+1,start+i*1000,10000000+i*100)));await slice();
  await insert([packet(1001,start+250500,10000000+25050)]);const first=await finish();assert.equal(first.processedPoints,600);const second=await finish();assert.equal(second.processedPoints,601);
 });
 await test('stale checkpoint CAS aborts publication transaction and retains old summaries',async()=>{await reset();await insert(Array.from({length:600},(_,i)=>packet(i+1,start+i*1000,10000000+i*100)));await finish();const prior=await summaries();await slice();let injected=false;
  const raced={prepare:q=>db.prepare(q),batch:async stmts=>{if(!injected){injected=true;const current=JSON.parse((await saved()).value_json);current.jobId=crypto.randomUUID();await db.prepare("UPDATE provider_cache SET value_json=?1 WHERE provider='brick_commute_scan_v1' AND cache_key=?2").bind(JSON.stringify(current),DEVICE_A).run();}return db.batch(stmts);}};
  await assert.rejects(()=>slice(raced));assert.equal(injected,true);assert.deepEqual(await summaries(),prior);await finish();assert.deepEqual(await summaries(),prior);
 });
 await test('revocation prevents checkpoint creation and corrupt state leaves cached response readable',async()=>{await reset();await insert(Array.from({length:600},(_,i)=>packet(i+1,start+i*1000,10000000+i*100)));await finish();const prior=await summaries();
  await db.prepare("UPDATE provider_cache SET value_json='{}' WHERE provider='brick_commute_scan_v1' AND cache_key=?1").bind(DEVICE_A).run();await assert.rejects(()=>slice(),/checkpoint/);const body=await (await parentCommutes({DB:db},DEVICE_A)).json();assert.equal(body.progress.state,'UNAVAILABLE');assert.equal(body.commutes.length,prior.length);
  await db.prepare('DELETE FROM provider_cache').run();await db.prepare('UPDATE devices SET revoked_at=?1 WHERE id=?2').bind(now,DEVICE_A).run();await assert.rejects(()=>slice(),/unavailable/);assert.equal(await saved(),null);assert.deepEqual(await summaries(),prior);
 });
 await test('partial work receipt is PENDING with no fabricated successful completion',async()=>{await reset();await insert(Array.from({length:600},(_,i)=>packet(i+1,start+i*1000,10000000+i*100)));
  assert.equal(await runBackgroundWork(db,'commute',DEVICE_A,()=>slice()),'PENDING');const row=await db.prepare("SELECT value_json FROM provider_cache WHERE provider='brick_background_v1' AND cache_key=?1").bind('commute/'+DEVICE_A).first();const receipt=JSON.parse(row.value_json);assert.equal(receipt.status,'PENDING');assert.equal(receipt.lastSuccessAt,null);assert.equal(receipt.failures,0);
  await db.prepare("UPDATE provider_cache SET value_json=json_set(value_json,'$.nextAttemptAt',1) WHERE provider='brick_background_v1'").run();assert.equal(await runBackgroundWork(db,'commute',DEVICE_A,()=>slice()),'COMPLETED');const done=JSON.parse((await db.prepare("SELECT value_json FROM provider_cache WHERE provider='brick_background_v1'").first()).value_json);assert.equal(done.status,'COMPLETED');assert.ok(done.lastSuccessAt>=now);
 });

 console.log(JSON.stringify({suite:'commute-paging',passed,failed,scope:'actual local D1; synthetic trusted history and44-statement computation guard; no cloud writes'}));if(failed)process.exitCode=1;
}finally{if(mf)await mf.dispose();fs.rmSync(dir,{recursive:true,force:true});}
