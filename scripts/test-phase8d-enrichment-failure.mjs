import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {newCardfreeDatabase as newDatabase,ecdsa,DEVICE_A,DEVICE_B} from './phase8d-native-fixture.mjs';
const dir=fs.mkdtempSync(path.resolve('.brick-maintenance-failure-'));
const config=JSON.parse(fs.readFileSync('wrangler.beta.template.jsonc','utf8'));
let mf,passed=0,failed=0;
const test=async(name,fn)=>{try{await fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}};
function uuidBytes(id) { return Buffer.from(id.replaceAll('-', ''), 'hex'); }
function encodeRecord(r) {
  const group = Buffer.from(r.independenceGroup), payload = Buffer.from(r.payload);
  const out = Buffer.alloc(52 + group.length + payload.length); let o = 0;
  uuidBytes(r.recordId).copy(out, o); o += 16;
  out.writeUInt32BE(r.epoch, o); o += 4;
  out.writeBigUInt64BE(BigInt(r.sequence), o); o += 8;
  out.writeBigUInt64BE(BigInt(r.elapsedRealtimeMs), o); o += 8;
  out.writeBigUInt64BE(BigInt(r.wallTimeMs), o); o += 8;
  for (const value of [r.provider, r.family, r.capability, r.health, r.quality]) out.writeUInt8(value, o++);
  out.writeUInt8(group.length, o++); out.writeUInt16BE(payload.length, o); o += 2;
  group.copy(out, o); o += group.length; payload.copy(out, o);
  return out;
}
function encodeBatch(records, batchId = crypto.randomUUID()) {
  const bodies = records.map(encodeRecord);
  const out = Buffer.alloc(23 + bodies.reduce((n, x) => n + x.length, 0)); let o = 0;
  out.writeUInt32BE(0x42524556, o); o += 4; out.writeUInt8(1, o++);
  uuidBytes(batchId).copy(out, o); o += 16; out.writeUInt16BE(records.length, o); o += 2;
  for (const body of bodies) { body.copy(out, o); o += body.length; }
  return { batchId, bytes: out };
}

try{
 const harness=`import base from './src/worker-beta-cardfree.ts';import {BetaScheduler as Original} from './src/beta-scheduler.ts';export {BrickDevice} from './src/worker-beta-cardfree.ts';export class BetaScheduler extends Original{async fixture(mode){globalThis.__fault=mode;globalThis.__calls={};}async settle(){await this.running;}async calls(){return globalThis.__calls||{};}}export default {...base,async fetch(req,env,ctx){if(new URL(req.url).pathname!=='/__synthetic')return base.fetch(req,env,ctx);try{const b=await req.json();const s=env.BETA_SCHEDULER.get(env.BETA_SCHEDULER.idFromName('beta-maintenance'));if(b.action==='mode'){await s.fixture(b.mode);return Response.json({ok:true});}if(b.action==='settle'){await s.settle();return Response.json({ok:true});}if(b.action==='run'){await s.runTick();return Response.json({ok:true});}if(b.action==='status')return Response.json(await s.status());return Response.json(await s.calls());}catch(e){return Response.json({ok:false,error:e.message});}}};`;
 const faults=[['phase5-maintenance.ts','export async function cleanupPhase5SemanticIndexes(db: D1Database, now = Date.now()): Promise<void> {',"semantic"],['phase5-refined-history.ts','export async function processRefinementsForDevice(env: RefinementEnv, deviceId: string, now = Date.now()) {',"refinement"],['phase5-refined-history.ts','export async function cleanupPhase5RefinedHistory(env: RefinementEnv, now = Date.now(), limit = 100) {',"cleanup"],['commute-summary.ts','export async function refreshCommutes(env:CommuteEnv,deviceId:string,fromMs:number,toMs:number){',"commute"]];
 await build({stdin:{contents:harness,resolveDir:process.cwd()},outfile:path.join(dir,'worker.mjs'),bundle:true,platform:'browser',format:'esm',external:['cloudflare:workers'],plugins:[{name:'synthetic-enrichment-faults',setup(b){b.onLoad({filter:/\/src\/(phase5-maintenance|phase5-refined-history|commute-summary)\.ts$/},args=>{let contents=fs.readFileSync(args.path,'utf8');for(const [file,signature,mode]of faults){if(!args.path.endsWith('/'+file))continue;assert.ok(contents.includes(signature),'fault seam missing');const id=mode==='refinement'||mode==='commute'?'deviceId':"'global'";const inject=`globalThis.__calls??={};const fixtureKey='${mode}/'+${id};globalThis.__calls[fixtureKey]=(globalThis.__calls[fixtureKey]||0)+1;if(globalThis.__fault==='${mode}'${mode==='refinement'?"&&deviceId==='"+DEVICE_A+"'":''}){await new Promise(r=>setTimeout(r,20));throw Error('synthetic private provider failure');}`;contents=contents.replace(signature,signature+inject);}return{contents,loader:'ts',resolveDir:path.dirname(args.path)};});}}]});
 mf=new Miniflare(convertV4MiniflareOptions({name:'maintenance-failure',modules:true,modulesRoot:dir,scriptPath:path.join(dir,'worker.mjs'),compatibilityDate:config.compatibility_date,
  bindings:{APP_ENV:'development',DEV_PARENT_AUTH_MODE:'d1-session-v1',BETA_STORAGE_MODE:'d1',BETA_CHANNEL:'beta',BETA_SOURCE_SHA:'a'.repeat(40),BRICK_MAP_SOURCE:'https://map.invalid/synthetic'},d1Databases:['DB','BETA_DB'],durableObjects:{BRICK_DEVICE:{className:'BrickDevice',useSQLite:true},BETA_SCHEDULER:{className:'BetaScheduler',useSQLite:true}},ratelimits:Object.fromEntries(config.ratelimits.map(r=>[r.name,{namespace_id:r.namespace_id,simple:{limit:10000,period:60}}])),outboundService(){return new Response('disabled',{status:503});}
 }));
 const db=await mf.getD1Database('DB'),diagnostics=await mf.getD1Database('BETA_DB'),n=newDatabase();for(const f of ['012_phase6c_free_runtime.sql','013_phase6c_request_maintenance.sql','014_phase6c_virtual_history.sql'])n.exec(fs.readFileSync('schema/'+f,'utf8'));for(const row of n.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all())await db.prepare(row.sql).run();n.close();for(const sql of fs.readFileSync('schema/beta_diagnostics.sql','utf8').replace(/--[^\n]*/g,'').split(';').filter(x=>x.trim()))await diagnostics.prepare(sql).run();
 const call=async b=>(await mf.dispatchFetch('http://localhost/__synthetic',{method:'POST',body:JSON.stringify(b)})).json();
 const keys=new Map(),now=Date.now();for(const id of [DEVICE_A,DEVICE_B]){const key=await ecdsa();keys.set(id,key);await db.prepare('INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?1,?2,?3,?4)').bind(id,'Synthetic enrichment',key.spki,now).run();await db.prepare('INSERT INTO phase5_hypothesis_frames(device_id,record_id,wall_time_ms,r2_key,created_at,refined_run_id) VALUES(?1,?2,?3,?4,?3,NULL)').bind(id,crypto.randomUUID(),now,'history/hypotheses/synthetic/'+id).run();}
 for(const mode of ['semantic','refinement','cleanup','commute'])await test(mode+' failure reaches durable FAILED receipt and automatic retry without starving peers',async()=>{
  await db.prepare('DELETE FROM dev_maintenance_state').run();await db.prepare("DELETE FROM provider_cache WHERE provider IN ('brick_background_v1','brick_refinement_scheduler','brick_commute_scheduler')").run();await call({action:'mode',mode});const result=await call({action:'run'}),status=await call({action:'status'}),calls=await call({action:'calls'});
  const target=mode==='semantic'||mode==='cleanup'?mode+'/global':mode+'/'+DEVICE_A;assert.ok(calls[target]>0,'fault must actually execute');
  if(mode==='refinement')assert.ok(calls['refinement/'+DEVICE_B]>0,'other device must be attempted');
  assert.ok(calls['commute/'+DEVICE_B]>0,'independent commute path must still run');
  assert.equal(result.ok,false,'failure must not be successful maintenance');assert.equal(status.lastTick.status,'FAILED');assert.ok(status.nextAlarmAt>Date.now());assert.ok((await db.prepare("SELECT last_run_at FROM dev_maintenance_state WHERE task='beta-daily-v2'").first())?.last_run_at>0,'independent successful daily backup must retain its success lease');const receipts=(await db.prepare("SELECT value_json FROM provider_cache WHERE provider='brick_background_v1'").all()).results.map(x=>JSON.parse(x.value_json));assert.ok(receipts.some(x=>x.status==='FAILED'));assert.equal(JSON.stringify(receipts).includes('synthetic private provider failure'),false);
  await db.prepare("UPDATE provider_cache SET value_json=json_set(value_json,'$.nextAttemptAt',1) WHERE provider='brick_background_v1'").run();await call({action:'mode',mode:'none'});assert.equal((await call({action:'run'})).ok,true);assert.equal((await call({action:'status'})).lastTick.status,'COMPLETED');
 });
 await test('signed durable hypothesis ACK survives optional refinement outage',async()=>{
  await call({action:'mode',mode:'refinement'});const stamp=Date.now(),recordId=crypto.randomUUID();
  const batch=encodeBatch([{recordId,epoch:20,sequence:77,elapsedRealtimeMs:100000,wallTimeMs:stamp,provider:22,family:1,capability:0,health:0,quality:3,independenceGroup:'fusion.hypotheses',payload:Buffer.from(JSON.stringify({v:1,t:'h',o:'original',m:30,h:[{id:'original',latE7:10000000,lonE7:10000000,uCm:1000,rw:500,ew:500,s:'synthetic'}]}))}]);
  const signature=Buffer.from(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.get(DEVICE_A).pair.privateKey,batch.bytes)).toString('base64');
  const response=await mf.dispatchFetch('http://localhost/api/device/'+DEVICE_A+'/evidence',{method:'POST',headers:{'Content-Type':'application/vnd.brick.evidence','X-Brick-Signature':signature},body:batch.bytes});
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM evidence_records WHERE record_id=?1').bind(recordId).first()).n,1,'raw record must already be durable');
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM phase5_hypothesis_frames WHERE record_id=?1').bind(recordId).first()).n,1,'normalized required input must be durable');
  assert.equal(response.status,200,'optional refinement must not prevent exact durable ACK');const ack=await response.json();assert.equal(ack.acked[0].recordId,recordId);const originalInput=await db.prepare('SELECT r2_key,created_at FROM phase5_hypothesis_frames WHERE record_id=?1').bind(recordId).first();await db.prepare('DELETE FROM dev_object_store WHERE key=?1').bind(originalInput.r2_key).run();const replay=await mf.dispatchFetch('http://localhost/api/device/'+DEVICE_A+'/evidence',{method:'POST',headers:{'Content-Type':'application/vnd.brick.evidence','X-Brick-Signature':signature},body:batch.bytes});assert.equal(replay.status,200);const replayAck=await replay.json();assert.deepEqual(replayAck.acked,ack.acked);assert.equal(replayAck.duplicateBatch,true);assert.equal((await db.prepare('SELECT COUNT(*) n FROM dev_object_store WHERE key=?1').bind(originalInput.r2_key).first()).n,1,'verified signed replay must repair missing normalized storage');assert.equal((await db.prepare('SELECT created_at FROM phase5_hypothesis_frames WHERE record_id=?1').bind(recordId).first()).created_at,originalInput.created_at);
 });
 await call({action:'settle'});
 const session='synthetic_parent_session',sessionHash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(session))).toString('hex');
 await db.prepare('INSERT INTO dev_parent_sessions(session_hash,created_at,expires_at,revoked_at) VALUES(?1,?2,?3,NULL)').bind(sessionHash,Date.now(),Date.now()+60000).run();
 const parent=uri=>mf.dispatchFetch('http://localhost'+uri,{headers:{Cookie:'brick_parent_dev='+session,Origin:'http://localhost'}});
 await test('cached parent commute response survives refresh failure with durable retry receipt',async()=>{
  await db.prepare("DELETE FROM provider_cache WHERE provider='brick_background_v1' AND cache_key=?1").bind('commute/'+DEVICE_A).run();await db.prepare("DELETE FROM provider_cache WHERE provider='brick_commute_refresh'").run();await call({action:'mode',mode:'commute'});
  const response=await parent('/parent/api/device/'+DEVICE_A+'/commutes');assert.equal(response.status,200);assert.ok(Array.isArray((await response.json()).commutes));
  let receipt;const deadline=Date.now()+5000;do{const row=await db.prepare("SELECT value_json FROM provider_cache WHERE provider='brick_background_v1' AND cache_key=?1").bind('commute/'+DEVICE_A).first();receipt=row?JSON.parse(row.value_json):null;if(receipt?.status==='FAILED')break;await new Promise(r=>setTimeout(r,20));}while(Date.now()<deadline);assert.equal(receipt.status,'FAILED');assert.ok(receipt.nextAttemptAt>Date.now());
 });
 await test('background task status is authenticated per-device and redacts lease/provider details',async()=>{
  const uri='/parent/api/device/'+DEVICE_A+'/beta/status';const denied=await mf.dispatchFetch('http://localhost'+uri);assert.equal(denied.status,401);
  const response=await parent(uri);assert.equal(response.status,200);const body=await response.json();assert.equal(body.backgroundWork.length,6);const work=body.backgroundWork.find(x=>x.task==='commute');assert.equal(work.status,'FAILED');assert.equal(work.errorCode,'derived_work_failed');assert.equal(work.lease,undefined);assert.equal(JSON.stringify(body.backgroundWork).includes('synthetic private provider failure'),false);
 });
 console.log(JSON.stringify({suite:'enrichment-failure',passed,failed,scope:'actual local scheduler/D1 chain with synthetic enrichment faults; no cloud writes'}));if(failed)process.exitCode=1;
}finally{if(mf)await mf.dispose();fs.rmSync(dir,{recursive:true,force:true});}
