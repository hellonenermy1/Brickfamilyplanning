// Actual composed Worker and signed SQLite-backed authority. Synthetic scheduler
// capabilities expose deferred lifetimes; no provider calls or production keys.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {signedWriterFixture} from './phase8d-signed-writer-fixture.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'brick-worker-entry-'));
const brokerUrl='https://capture.fixture.invalid/worker-entry';
const identity={sourceSha:'a'.repeat(40),resourceSetSha256:'2c7d4b00cc25648bf85d8473a0dab35f9617873ea8898091d12ec61352f19ffc'};
let mf,passed=0;
const harness=`
import worker from './src/worker-beta-cardfree.ts';
import {DurableObject} from 'cloudflare:workers';
import {CaptureAdmissionStore} from './src/cardfree-capture-admission.ts';
import {CaptureReplayStore,createCaptureBroker} from './src/capture-broker.ts';
import {installStagedCaptureWriterController,stagedCaptureWriterConfigured} from './src/capture-writer-boundary.ts';
${signedWriterFixture({url:brokerUrl,captureSecret:randomBytes(32).toString('hex'),writerSecret:randomBytes(32).toString('hex')})}
export class Authority extends DurableObject{
 async invoke(method,args){
  if(method==='fault'){await this.ctx.storage.put('fault',args[0]);return;}
  if(method==='stats')return await this.ctx.storage.get('stats')??{};
  if(method==='writers')return (await this.ctx.storage.get('brick-capture-admission-v1')).writers;
  const result=await new CaptureAdmissionStore(this.ctx.storage)[method](...args);
  if(method==='initialize'){const pin={...args[0],authorityEpoch:result.authorityEpoch};await new CaptureReplayStore(this.ctx.storage).initialize(pin);await this.ctx.storage.put('pin',pin);}
  return result;
 }
 async fetch(req){
  const pin=await this.ctx.storage.get('pin'),operation=(await req.clone().json()).operation;
  const response=await (await createCaptureBroker({url:${JSON.stringify(brokerUrl)},pin,keys:fixtureKeys,authority:new CaptureAdmissionStore(this.ctx.storage),replay:new CaptureReplayStore(this.ctx.storage)}))(req);
  const stats=await this.ctx.storage.get('stats')??{};stats[operation]=(stats[operation]??0)+1;await this.ctx.storage.put('stats',stats);
  if(await this.ctx.storage.get('fault')===operation){await this.ctx.storage.delete('fault');return Response.json({syntheticLostReply:true});}
  return response;
 }
}

export default {async fetch(req,env,ctx){
 const command=await req.json(),stub=env.CAPTURE_AUTHORITY.get(env.CAPTURE_AUTHORITY.idFromName('controlled-writer-envelope'));
 if(command.control){try{return Response.json({ok:true,value:await stub.invoke(command.control,command.args??[])});}catch(e){return Response.json({ok:false,error:e.message});}}
 if(command.release){await env.DB.prepare('UPDATE gates SET released=1 WHERE id=?1').bind(command.release).run();return Response.json({ok:true});}
 await env.DB.prepare('INSERT INTO gates(id,released) VALUES(?1,?2)').bind(command.id,command.autoRelease?1:0).run();
 const work=async kind=>{const until=Date.now()+10000;while(!(await env.DB.prepare('SELECT released FROM gates WHERE id=?1').bind(command.id).first()).released){if(Date.now()>until)throw Error('synthetic scheduler gate timeout');await new Promise(r=>setTimeout(r,20));}if(command.rejectDeferred)throw Error('synthetic deferred failure');await env.DB.prepare('INSERT INTO witness(id,kind) VALUES(?1,?2)').bind(command.id,kind).run();return {complete:true};};
 const scheduler={idFromName:name=>name,get:name=>({kick:()=>work('kick'),runWatchdogPage:()=>work('watchdog'),runGroup:group=>work(group)})};
 const current={...env,APP_ENV:'development',DEV_PARENT_AUTH_MODE:'d1-session-v1',BETA_STORAGE_MODE:'d1',BETA_CHANNEL:'beta',BRICK_MAP_SOURCE:'https://map.fixture.invalid/synthetic.pmtiles',BETA_SCHEDULER:scheduler};
 if(command.configured!==false)install(current,ctx,current);
 if(command.rejectWork)Object.defineProperty(current,'APP_ENV',{get(){throw Error('synthetic worker body failure');}});

 try{
  if(command.kind==='scheduled'){await worker.scheduled({},current,ctx);return Response.json({ok:true});}
  const response=await worker.fetch(new Request('https://worker.fixture.invalid/parent/login',{method:command.method??'GET',...(command.method==='POST'?{body:'code=synthetic'}:{})}),current,ctx);
  return response;
 }catch(e){return Response.json({ok:false,error:e.message}, {status:503});}
}};`;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function invoke(command){return mf.dispatchFetch('https://fixture.invalid/',{method:'POST',body:JSON.stringify(command)});}
async function rpc(control,...args){const r=await(await invoke({control,args})).json();assert.equal(r.ok,true,r.error);return r.value;}
async function eventually(fn){const end=Date.now()+10000;for(;;){const v=await fn();if(v)return v;if(Date.now()>end)throw Error('native worker condition timed out');await delay(10);}}
async function active(n){return eventually(async()=>{const s=await rpc('status');return s.activeWriters===n&&s;});}
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
async function fresh(){
 if(mf)await mf.dispose();
 mf=new Miniflare(convertV4MiniflareOptions({name:'worker-entry',modules:true,modulesRoot:root,scriptPath:path.join(root,'worker.mjs'),compatibilityDate:'2026-10-29',d1Databases:['DB'],durableObjects:{CAPTURE_AUTHORITY:{className:'Authority',useSQLite:true}},resourcePersistencePath:path.join(root,randomBytes(8).toString('hex')),outboundService(){throw Error('network forbidden');}}));
 const db=await mf.getD1Database('DB');await db.exec('CREATE TABLE witness(id TEXT,kind TEXT); CREATE TABLE gates(id TEXT PRIMARY KEY,released INTEGER)');await rpc('initialize',identity);return db;
}
try{
 await build({stdin:{contents:harness,resolveDir:process.cwd()},outfile:path.join(root,'worker.mjs'),bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers']});
 await test('unconfigured actual GET remains unchanged without authority traffic',async()=>{
  const db=await fresh();const r=await invoke({id:'default',configured:false,autoRelease:true});const body=await r.text();assert.equal(r.status,200,body);assert(body.includes('Sign in'));assert.equal((await rpc('stats'))['runtime.enter'],undefined);assert.equal((await db.prepare('SELECT COUNT(*) n FROM witness').first()).n,1);
 });
 for(const method of ['GET','POST'])await test('actual '+method+' reply retains signed ownership through deferred maintenance write',async()=>{
  const db=await fresh(),id='deferred-'+method;const r=await invoke({id,method});assert.equal(r.status,method==='GET'?200:403);await r.text();
  assert.equal((await rpc('status')).activeWriters,1,'Worker entry must own deferred work');
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM witness').first()).n,0);
  const capture=await rpc('requestCapture',randomBytes(16).toString('hex'),identity);assert.equal(capture.state,'DRAINING');
  await invoke({release:id});await active(0);assert.equal((await rpc('pollCapture',capture.captureId)).state,'DRAINED');assert.equal((await db.prepare('SELECT COUNT(*) n FROM witness').first()).n,1);
  const stats=await rpc('stats');assert.equal(stats['runtime.enter'],1);assert.equal(stats['runtime.start'],1);assert.equal(stats['writer.exit'],1);
 });
 await test('actual scheduled root owns all three awaited scheduler descendants',async()=>{
  const db=await fresh(),id='scheduled';const pending=invoke({id,kind:'scheduled'});await active(1);
  const c=await rpc('requestCapture',randomBytes(16).toString('hex'),identity);assert.equal(c.state,'DRAINING');assert.equal((await db.prepare('SELECT COUNT(*) n FROM witness').first()).n,0);
  await invoke({release:id});assert.equal((await pending).status,200);await active(0);assert.equal((await rpc('pollCapture',c.captureId)).state,'DRAINED');assert.equal((await db.prepare('SELECT COUNT(*) n FROM witness').first()).n,3);
 });
 await test('actual anonymous ordinary Worker request cannot preempt a held native capture',async()=>{
  const db=await fresh();const c=await rpc('requestCapture',randomBytes(16).toString('hex'),identity);assert.equal(c.state,'DRAINED');
  const r=await invoke({id:'no-preempt',autoRelease:true});assert.equal(r.status,503);assert.equal((await r.json()).error,'CAPTURE_WRITER_BUSY');assert.equal((await rpc('pollCapture',c.captureId)).state,'DRAINED');assert.equal((await db.prepare('SELECT COUNT(*) n FROM witness').first()).n,0);
 });
 for(const kind of ['fetch','scheduled'])for(const stage of ['runtime.enter','runtime.start'])await test('actual '+kind+' lost '+stage+' receipt starts no scheduler work',async()=>{
  const db=await fresh();await rpc('fault',stage);const r=await invoke({id:kind+stage,kind,autoRelease:true});assert.equal(r.status,503);const body=await r.json();assert.equal(body.error,stage==='runtime.enter'?'CAPTURE_WRITER_ADMISSION_UNCERTAIN':'CAPTURE_WRITER_START_UNCERTAIN');
  await active(stage==='runtime.enter'?0:1);assert.equal((await db.prepare('SELECT COUNT(*) n FROM witness').first()).n,0);
  if(stage==='runtime.start')assert.equal(Object.values(await rpc('writers'))[0].phase,'STARTED');
 });
 await test('body failure retains actual native STARTED ownership',async()=>{
  await fresh();const r=await invoke({id:'body-failure',rejectWork:true,autoRelease:true});assert.equal(r.status,503);assert.equal((await r.json()).error,'synthetic worker body failure');await active(1);assert.equal(Object.values(await rpc('writers'))[0].phase,'STARTED');assert.equal((await rpc('stats'))['writer.exit'],undefined);
 });
 await test('scheduled descendant failure retains root ownership without false drain',async()=>{
  const db=await fresh();const r=await invoke({id:'scheduled-failure',kind:'scheduled',rejectDeferred:true,autoRelease:true});assert.equal(r.status,503);assert.equal((await r.json()).error,'cardfree maintenance failed');await active(1);assert.equal((await db.prepare('SELECT COUNT(*) n FROM witness').first()).n,0);assert.equal((await rpc('stats'))['writer.exit'],undefined);
  assert.equal((await rpc('requestCapture',randomBytes(16).toString('hex'),identity)).state,'DRAINING');
 });
 await test('lost signed release receipt preserves completed HTTP result without replay',async()=>{
  const db=await fresh();await rpc('fault','writer.exit');const r=await invoke({id:'lost-exit',autoRelease:true});assert.equal(r.status,200);await r.text();await eventually(async()=>(await rpc('stats'))['writer.exit']===1);assert.equal((await db.prepare('SELECT COUNT(*) n FROM witness').first()).n,1);
 });
 console.log(JSON.stringify({suite:'worker-entry-native',passed,failed:0,scope:'actual composed Worker fetch/scheduled and signed SQLite authority with real D1 deferred witness writes and controlled scheduler capabilities; no full writer coverage, real scheduler/bootstrap, urgent-outage fallback, provider or production qualification'}));
}finally{if(mf)await mf.dispose();fs.rmSync(root,{recursive:true,force:true});}
