import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {newCardfreeDatabase,ecdsa,DEVICE_A} from './phase8d-native-fixture.mjs';
const dir=fs.mkdtempSync(path.resolve('.brick-refinement-corruption-'));let mf,passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}}
try{
 for(const [name,file]of [['refined','src/phase5-refined-history.ts'],['storage','src/dev-free-runtime.ts']])await build({entryPoints:[file],outfile:path.join(dir,name+'.mjs'),bundle:true,format:'esm',platform:'node',target:'node24'});
 const {processRefinementsForDevice:process}=await import(pathToFileURL(path.join(dir,'refined.mjs')).href),{D1ObjectBucket}=await import(pathToFileURL(path.join(dir,'storage.mjs')).href);
 mf=new Miniflare(convertV4MiniflareOptions({name:'refinement-corruption',modules:true,script:'export default {fetch(){return new Response("synthetic");}}',compatibilityDate:'2026-10-24',d1Databases:['DB']}));
 const db=await mf.getD1Database('DB'),n=newCardfreeDatabase();for(const row of n.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all())await db.prepare(row.sql).run();n.close();const key=await ecdsa(),now=Date.now(),store=new D1ObjectBucket(db),env={DB:db,HISTORY:store};
 await db.prepare('INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?1,?2,?3,?4)').bind(DEVICE_A,'Synthetic corruption',key.spki,now).run();
 async function reset(){await db.prepare("DELETE FROM provider_cache WHERE provider LIKE 'brick_refinement_%'").run();for(const table of ['phase5_hypothesis_frames','phase5_precise_endpoints','phase5_refined_intervals'])await db.prepare('DELETE FROM '+table).run();for(const [sequence,stamp]of [[1,now-10000],[2,now+10000]])await db.prepare('INSERT INTO phase5_precise_endpoints VALUES(?1,1,?2,?3,1,1,10,?4)').bind(DEVICE_A,sequence,stamp,now).run();}
 const frame=(recordId,stamp=now)=>({v:1,recordId,wallTimeMs:stamp,originalRealtimeHypothesisId:'original',maxSpeedMps:30,hypotheses:[{id:'original',latitude:1,longitude:1,uncertaintyM:10,realtimeWeight:0.5,storedEvidenceWeight:0.5,source:'synthetic'}]});
 async function seed(id,value,stamp=now){const objectKey='history/hypotheses/synthetic/'+id;if(value!==null)await store.put(objectKey,typeof value==='string'?value:JSON.stringify(value));await db.prepare('INSERT INTO phase5_hypothesis_frames VALUES(?1,?2,?3,?4,?5,NULL)').bind(DEVICE_A,id,stamp,objectKey,now).run();}
 for(const [name,value]of [['missing',null],['malformed-json','{broken'],['wrong-envelope',{...frame('bad'),recordId:'foreign'}],['invalid-hypotheses',{...frame('bad'),hypotheses:[{id:'original',latitude:999,longitude:1,uncertaintyM:10,realtimeWeight:0.5,storedEvidenceWeight:0.5,source:'synthetic'}]}]])await test(name+' is failed work while healthy peer still refines',async()=>{await reset();await seed('bad',value);await seed('good',frame('good',now+1),now+1);await assert.rejects(()=>process(env,DEVICE_A,now),/refinement inputs unavailable/);assert.equal((await db.prepare("SELECT refined_run_id FROM phase5_hypothesis_frames WHERE record_id='bad'").first()).refined_run_id,null);assert.ok((await db.prepare("SELECT refined_run_id FROM phase5_hypothesis_frames WHERE record_id='good'").first()).refined_run_id);});
 await test('no endpoints remains intentional pending rather than failed or fabricated completion',async()=>{await reset();await db.prepare('DELETE FROM phase5_precise_endpoints').run();await seed('waiting',frame('waiting'));assert.equal(await process(env,DEVICE_A,now),0);assert.equal((await db.prepare("SELECT refined_run_id FROM phase5_hypothesis_frames WHERE record_id='waiting'").first()).refined_run_id,null);});
 console.log(JSON.stringify({suite:'refinement-corruption',passed,failed,scope:'actual local D1/object adapter; synthetic frames only'}));if(failed)globalThis.process.exitCode=1;
}finally{if(mf)await mf.dispose();fs.rmSync(dir,{recursive:true,force:true});}
