import {captureProtectedBackup,privateCaptureJournal} from './cardfree-capture-coordinator.mjs';
// Real local D1/DO stores, synthetic identities only. Never calls Cloudflare APIs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {newCardfreeDatabase as newDatabase,ecdsa,DEVICE_A,DEVICE_B} from './phase8d-native-fixture.mjs';
import {sealBackup,openBackup} from './cardfree-backup-package.mjs';
import {randomBytes} from 'node:crypto';
import {livePacketBytes} from './phase8d-do-state-fixture.mjs';
const dir=fs.mkdtempSync(path.resolve('.brick-cardfree-recovery-'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const config=JSON.parse(fs.readFileSync('wrangler.beta.template.jsonc','utf8'));
const live=new Set();
async function start(name,restore=false,initialize=true){
 const persist=path.join(dir,name);
 const mf=new Miniflare(convertV4MiniflareOptions({name:'cardfree-drill',modules:true,modulesRoot:dir,scriptPath:path.join(dir,'worker.mjs'),compatibilityDate:config.compatibility_date,
  bindings:{APP_ENV:'development',DEV_PARENT_AUTH_MODE:'d1-session-v1',BETA_STORAGE_MODE:'d1',BETA_CHANNEL:'beta',BETA_SOURCE_SHA:'a'.repeat(40),BRICK_MAP_SOURCE:'https://map.invalid/synthetic.pmtiles',...(restore?{BRICK_RECOVERY_MODE:'isolated-restore'}:{})},
  d1Databases:['DB','BETA_DB'],durableObjects:{BRICK_DEVICE:{className:'BrickDevice',useSQLite:true},BETA_SCHEDULER:{className:'BetaScheduler',useSQLite:true},CAPTURE_AUTHORITY:{className:'CaptureAuthorityFixture',useSQLite:true}},
  resourcePersistencePath:path.join(persist,'shared'),isolatedResourcePersistencePath:path.join(persist,'isolated'),
  ratelimits:Object.fromEntries(config.ratelimits.map(r=>[r.name,{namespace_id:r.namespace_id,simple:{limit:10000,period:60}}])),outboundService(){return new Response('external providers disabled',{status:503});}
 }));live.add(mf);
 const db=await mf.getD1Database('DB'),beta=await mf.getD1Database('BETA_DB');
 if(initialize){const n=newDatabase();for(const f of ['012_phase6c_free_runtime.sql','013_phase6c_request_maintenance.sql','014_phase6c_virtual_history.sql'])n.exec(fs.readFileSync('schema/'+f,'utf8'));for(const row of n.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all())await db.prepare(row.sql).run();n.close();for(const sql of fs.readFileSync('schema/beta_diagnostics.sql','utf8').replace(/--[^\n]*/g,'').split(';').filter(x=>x.trim()))await beta.prepare(sql).run();}
 if(initialize){await db.prepare('CREATE TABLE IF NOT EXISTS brick_dev_migrations(name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)').run();await db.prepare('INSERT INTO brick_dev_migrations VALUES(?1,?2)').bind('synthetic-current-schema',123).run();}
 const ns=await mf.getDurableObjectNamespace('BRICK_DEVICE');
 return {mf,db,beta,ns,persist,env:{DB:db,BETA_DB:beta,...(restore?{BRICK_RECOVERY_MODE:'isolated-restore'}:{})},stub:id=>ns.get(ns.idFromName(id))};
}
async function close(store){await store.mf.dispose();live.delete(store.mf);}
async function rpc(store,id,method,args){return(await store.mf.dispatchFetch('http://localhost/__synthetic_rpc',{method:'POST',body:JSON.stringify({id,method,args})})).json();}
async function authorityRpc(store,method,args=[]){const r=await(await store.mf.dispatchFetch('http://localhost/__synthetic_capture_authority',{method:'POST',body:JSON.stringify({method,args})})).json();assert.equal(r.ok,true,r.error);return r.value;}
async function counts(db,tables){const result={};for(const table of tables)result[table]=(await db.prepare('SELECT COUNT(*) n FROM '+table).first()).n;return result;}
try{
 const harness=`import {DurableObject} from 'cloudflare:workers';import {CaptureAdmissionStore} from './src/cardfree-capture-admission.ts';export class CaptureAuthorityFixture extends DurableObject{async invoke(method,args){return new CaptureAdmissionStore(this.ctx.storage)[method](...args);}}import worker from './src/worker-beta-cardfree.ts';import {BrickDevice as BetaDevice,BetaScheduler as ActualScheduler} from './src/worker-beta-cardfree.ts';export class BetaScheduler extends ActualScheduler{async settleSynthetic(){await this.running;}async pauseSyntheticCapture(){await this.running;await this.ctx.storage.deleteAlarm();}}export class BrickDevice extends BetaDevice{async seedSyntheticState(key,value){if(value===null)await this.ctx.storage.delete(key);else await this.ctx.storage.put(key,value);}async readSyntheticState(key){return await this.ctx.storage.get(key);}}export default {...worker,async fetch(req,env,ctx){if(new URL(req.url).pathname==='/__synthetic_capture_authority'){const {method,args}=await req.json();try{return Response.json({ok:true,value:await env.CAPTURE_AUTHORITY.get(env.CAPTURE_AUTHORITY.idFromName('controlled-writer-envelope')).invoke(method,args)});}catch(e){return Response.json({ok:false,error:e.message});}}if(new URL(req.url).pathname!=='/__synthetic_rpc')return worker.fetch(req,env,ctx);const {id,method,args}=await req.json();try{return Response.json({ok:true,value:await env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(id))[method](...args)});}catch(e){return Response.json({ok:false,error:e.message});}}};`;
 await build({stdin:{contents:harness,resolveDir:process.cwd()},outfile:path.join(dir,'worker.mjs'),bundle:true,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:workers']});
 for(const [name,file] of [['recovery','src/cardfree-recovery.ts'],['storage','src/dev-free-runtime.ts'],['refined','src/phase5-refined-history.ts'],['capture','src/cardfree-capture.ts'],['budget','src/d1-work-budget.ts']])await build({entryPoints:[file],outfile:path.join(dir,name+'.mjs'),bundle:true,format:'esm',platform:'node',target:'node24'});
 const capture=await import(pathToFileURL(path.join(dir,'capture.mjs')).href),{d1WorkBudget}=await import(pathToFileURL(path.join(dir,'budget.mjs')).href);
 const recovery=await import(pathToFileURL(path.join(dir,'recovery.mjs')).href),{D1ObjectBucket}=await import(pathToFileURL(path.join(dir,'storage.mjs')).href);
 const {processRefinementsForDevice:processFrames}=await import(pathToFileURL(path.join(dir,'refined.mjs')).href);
 let source=await start('source');const authorityIdentity={sourceSha:'a'.repeat(40),resourceSetSha256:sha('synthetic-primary-diagnostics-device-stores')};await authorityRpc(source,'initialize',[authorityIdentity]);const declaredWriter=await authorityRpc(source,'enterWriter',[randomBytes(16).toString('hex'),'ordinary']);assert.equal(declaredWriter.admitted,true);const key=await ecdsa(),other=await ecdsa(),now=Date.now();
 for(const [id,k] of [[DEVICE_A,key],[DEVICE_B,other]])await source.db.prepare('INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?1,?2,?3,?4)').bind(id,'Synthetic D1 recovery',k.spki,now).run();
 const bytes=livePacketBytes(now,17),signature=Buffer.from(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key.pair.privateKey,bytes)).toString('base64');
 assert.equal((await source.mf.dispatchFetch('http://localhost/api/device/'+DEVICE_A+'/location',{method:'POST',headers:{'X-Brick-Signature':signature},body:bytes})).status,200);
 assert.equal((await source.db.prepare('SELECT COUNT(*) n FROM dev_location_history').first()).n,1);
 await source.db.prepare("INSERT INTO device_commands(id,device_id,command_type,created_at,expires_at,status) VALUES('pending',?1,'synthetic',?2,?3,'pending')").bind(DEVICE_A,now,now+60000).run();
 await source.db.prepare('UPDATE devices SET revoked_at=?1 WHERE id=?2').bind(now,DEVICE_B).run();await source.stub(DEVICE_B).revokeParentSockets();
 const store=new D1ObjectBucket(source.db),objectBytes=Uint8Array.from({length:1800013},(_,i)=>i%251);
 await store.put('beta/releases/synthetic/Brick.apk',objectBytes,{customMetadata:{fixture:'not-a-real-apk'},httpMetadata:{contentType:'application/octet-stream'}});
 await store.put('evidence/raw/synthetic','preserved evidence');await store.put('backups/d1/old.json.gz','excluded recursive backup');
 const original=await store.get('beta/releases/synthetic/Brick.apk');
 await source.beta.prepare('INSERT INTO beta_runs VALUES(?1,?2,?3,NULL,0,?4)').bind(DEVICE_A,'synthetic-run','{"fixture":true}',now).run();
 await source.beta.prepare('INSERT INTO beta_records VALUES(?1,?2,1,?3,?4)').bind(DEVICE_A,'synthetic-run','{"synthetic":true}',now).run();
 await source.beta.prepare('INSERT INTO beta_reviews VALUES(?1,?2,?3,?4)').bind(DEVICE_A,'synthetic-run','{"review":"REVIEW_REQUIRED"}',now).run();
 await source.beta.prepare('INSERT INTO beta_latest VALUES(?1,?2,?3)').bind(DEVICE_A,'{"status":"PENDING"}',now).run();
 await source.beta.prepare('INSERT INTO beta_requests VALUES(?1,?2,?3)').bind('synthetic-nonce',DEVICE_A,now+60000).run();
 await source.db.prepare('INSERT INTO dev_parent_sessions(session_hash,created_at,expires_at) VALUES(?1,?2,?3)').bind('0'.repeat(64),now,now+60000).run();
 // Probe adds an ephemeral betaDiagnostic DO key absent from the production8D snapshot inventory.
 const token=crypto.randomUUID();const probeResponse=await source.stub(DEVICE_A).fetch('https://internal/beta/probe',{method:'POST',body:JSON.stringify({deviceId:DEVICE_A,token,expiresAt:now+60000})});assert.equal(probeResponse.status,200);await probeResponse.text();
 await rpc(source,DEVICE_A,'seedSyntheticState',['futureUnknown',{unexpected:true}]);assert.equal((await rpc(source,DEVICE_A,'exportRecoveryState',[DEVICE_A])).ok,false,'unknown durable state must still fail closed');await rpc(source,DEVICE_A,'seedSyntheticState',['futureUnknown',null]);
 await rpc(source,DEVICE_A,'seedSyntheticState',['betaDiagnostic',{token:'bad',expiresAt:now}]);assert.equal((await rpc(source,DEVICE_A,'exportRecoveryState',[DEVICE_A])).ok,false,'malformed diagnostic state must fail closed');await rpc(source,DEVICE_A,'seedSyntheticState',['betaDiagnostic',{token,expiresAt:now+60000}]);
 let doSnapshots=[];
 for(const id of [DEVICE_A,DEVICE_B]){const result=await rpc(source,id,'exportRecoveryState',[id]);assert.equal(result.ok,true,'beta DO snapshot must handle its own diagnostic key: '+result.error);const serialized=result.value;assert.equal(JSON.parse(serialized).state.betaDiagnostic,undefined);doSnapshots.push({id,serialized,sha256:sha(serialized)});}
 assert.equal((await rpc(source,DEVICE_A,'readSyntheticState',['betaDiagnostic'])).value.token,token,'snapshot must not delete a live readiness challenge');
 console.log('PASS actual beta DO recovery exports durable telemetry/revocation after readiness probe without replaying diagnostic challenge');
 const sourceSchedulerNs=await source.mf.getDurableObjectNamespace('BETA_SCHEDULER'),sourceScheduler=sourceSchedulerNs.get(sourceSchedulerNs.idFromName('beta-maintenance'));await sourceScheduler.settleSynthetic();assert.equal((await sourceScheduler.status()).lastTick.status,'COMPLETED');
 // Operational retry state is intentionally reconstructible, not part of this archive.
 const poisonId='33333333-3333-4333-8333-333333333333',poisonKey='history/hypotheses/recovery-poison';await store.put(poisonKey,'{synthetic-corrupt');
 await source.db.prepare('INSERT INTO phase5_hypothesis_frames VALUES(?1,?2,?3,?4,?5,NULL)').bind(DEVICE_A,poisonId,now+100,poisonKey,now).run();
 for(const [seq,stamp]of [[1,now-1000],[2,now+1000]])await source.db.prepare('INSERT INTO phase5_precise_endpoints VALUES(?1,999,?2,?3,1,1,10,?4)').bind(DEVICE_A,seq,stamp,now).run();
 for(const delta of [0,60000,180000])await assert.rejects(()=>processFrames({DB:source.db,HISTORY:store},DEVICE_A,now+delta),/inputs unavailable/);
 assert.equal(JSON.parse((await source.db.prepare("SELECT value_json FROM provider_cache WHERE provider='brick_refinement_failure_v1'").first()).value_json).status,'QUARANTINED');
 await sourceScheduler.pauseSyntheticCapture();assert.equal((await sourceScheduler.status()).nextAlarmAt,null);await authorityRpc(source,'exitWriter',[declaredWriter.ticket]);
 // Actual disposable scheduler alarm is paused; no further mutating traffic is submitted.
 // This controlled fixture is not a production writer-fence implementation.
 // No further traffic/writes/maintenance after this synthetic quiescence point.
 await assert.rejects(()=>recovery.exportCardfreeD1(source.env,false),/quiesced/);
 let backup=await recovery.exportCardfreeD1(source.env,true);
 const expected=JSON.parse(new TextDecoder().decode(backup.body));
 assert.equal(expected.primary.tables.dev_object_store.length,3,'prior backup excluded to avoid recursive archives');
 assert.equal(expected.primary.tables.dev_location_history.length,1);assert.equal(expected.primary.tables.provider_cache,undefined,'operational retry metadata is NOT archived');
 const trustedContext={deployment:'synthetic-cardfree-drill',sourceSha:'a'.repeat(40),backupId:randomBytes(16).toString('hex'),capturedAt:backup.createdAt,keyId:'synthetic-ephemeral'};
 const encryptionKey=randomBytes(32).toString('base64'),protectedFile=path.join(dir,'recovery.brickbackup');
 const acquired=await authorityRpc(source,'requestCapture',[trustedContext.backupId,authorityIdentity,300000]);assert.equal(acquired.state,'DRAINED');assert.equal(acquired.activeWriters,0);trustedContext.capturedAt=acquired.pausedAt;expected.createdAt=acquired.pausedAt;
 let fence=Object.fromEntries(['captureId','generation','resourceSetSha256','sourceSha','pausedAt'].map(k=>[k,acquired[k]]));let maxCaptureQueries=0;
 const authority={assertHeld:expected=>authorityRpc(source,'assertHeld',[expected]),release:expected=>authorityRpc(source,'release',[expected])};
 const captureOptions={context:trustedContext,expectedFence:fence,runtime:{...recovery,...capture},authority,journal:privateCaptureJournal(path.join(dir,'encrypted-capture-journal')),key:encryptionKey,source:{
  async readPage(request){const binding=request.store==='primary'?source.db:source.beta,budget=d1WorkBudget(binding,44);const page=await capture.readCardfreeCapturePage({DB:request.store==='primary'?budget.db:source.db,BETA_DB:request.store==='diagnostics'?budget.db:source.beta},request,authority);maxCaptureQueries=Math.max(maxCaptureQueries,budget.used());return page;},
  async deviceSnapshot(id){const response=await rpc(source,id,'exportRecoveryState',[id]);assert.equal(response.ok,true);return response.value;}
 }};
 // A preemption between the coordinator's last held-check and release must not
 // turn cleanup acknowledgement into a successful sealed capture.
 let urgentDuringRelease;
 const raceAuthority={...authority,async release(expected){urgentDuringRelease=await authorityRpc(source,'enterWriter',[randomBytes(16).toString('hex'),'urgent']);return authority.release(expected);}};
 await assert.rejects(()=>captureProtectedBackup({...captureOptions,authority:raceAuthority}),/CAPTURE_RELEASE_FAILED/);
 assert.equal(urgentDuringRelease.admitted,true);await authorityRpc(source,'exitWriter',[urgentDuringRelease.ticket]);
 console.log('PASS urgent preemption after final held-check refuses sealed capture at the durable release boundary');
 trustedContext.backupId=randomBytes(16).toString('hex');const fresh=await authorityRpc(source,'requestCapture',[trustedContext.backupId,authorityIdentity,300000]);assert.equal(fresh.state,'DRAINED');trustedContext.capturedAt=fresh.pausedAt;expected.createdAt=fresh.pausedAt;
 fence=Object.fromEntries(['captureId','generation','resourceSetSha256','sourceSha','pausedAt'].map(k=>[k,fresh[k]]));captureOptions.expectedFence=fence;captureOptions.journal=privateCaptureJournal(path.join(dir,'fresh-encrypted-capture-journal'));
 const captured=await captureProtectedBackup(captureOptions);
 assert.equal((await authorityRpc(source,'status')).state,'OPEN');assert.equal((await authorityRpc(source,'status')).activeWriters,0);assert.ok(maxCaptureQueries<=5);const encrypted=captured.encrypted;assert.deepEqual(JSON.parse(openBackup(encrypted,encryptionKey,trustedContext).body),expected);fs.writeFileSync(protectedFile,encrypted,{flag:'wx',mode:0o600});
 console.log('PASS durable admission authority controls the declared synthetic source-writer envelope and confirms capture release; production writer hooks are not installed');
 console.log('PASS paged41+4 capture plus actual device DOs under paused synthetic scheduler, encrypted journal and max'+maxCaptureQueries+' SQL statements per source call');
 new Uint8Array(backup.body).fill(0);backup=null;doSnapshots=[];
 await close(source);assert(fs.readdirSync(source.persist,{recursive:true}).some(x=>x.endsWith('.sqlite')));fs.rmSync(source.persist,{recursive:true,force:true});assert(!fs.existsSync(source.persist));source=null;
 console.log('PASS encrypted both D1 stores and every device DO, then destroyed actual source persistence and discarded plaintext restore inputs');
 const restoredPackage=openBackup(fs.readFileSync(protectedFile),encryptionKey,trustedContext);
 backup={body:restoredPackage.body.buffer.slice(restoredPackage.body.byteOffset,restoredPackage.body.byteOffset+restoredPackage.body.byteLength),sha256:restoredPackage.sha256};doSnapshots=restoredPackage.doSnapshots;
 assert.equal(doSnapshots.length,2);
 console.log('PASS restore inputs obtained only from authenticated encrypted on-disk package plus separately retained ephemeral key and trusted context');
 let target=await start('fresh',true);
 const tampered=fs.readFileSync(protectedFile);tampered[tampered.length-1]^=1;
 for(const reject of [()=>openBackup(tampered,encryptionKey,trustedContext),()=>openBackup(fs.readFileSync(protectedFile),randomBytes(32).toString('base64'),trustedContext),()=>openBackup(fs.readFileSync(protectedFile),encryptionKey,{...trustedContext,backupId:'0'.repeat(32)})])assert.throws(reject,/authentication|context mismatch/);
 assert.equal((await target.db.prepare('SELECT COUNT(*) n FROM devices').first()).n,0);assert.equal((await target.beta.prepare('SELECT COUNT(*) n FROM beta_runs').first()).n,0);
 console.log('PASS wrong key, tampered ciphertext and unexpected backup ID rejected with both fresh target stores untouched');
 await assert.rejects(()=>recovery.restoreCardfreeD1({...target.env,BRICK_RECOVERY_MODE:undefined},backup.body,backup.sha256),/disabled/);
 await assert.rejects(()=>recovery.restoreCardfreeD1(target.env,backup.body,'0'.repeat(64)),/integrity/);
 await assert.rejects(()=>recovery.restoreCardfreeD1(target.env,new ArrayBuffer(16*1024*1024+1),'0'.repeat(64)),/integrity/);
 async function rejectChanged(change,pattern){const value=structuredClone(expected);change(value);const body=new TextEncoder().encode(JSON.stringify(value));await assert.rejects(()=>recovery.restoreCardfreeD1(target.env,body.buffer,sha(body)),pattern);assert.equal((await target.db.prepare('SELECT COUNT(*) n FROM devices').first()).n,0);assert.equal((await target.beta.prepare('SELECT COUNT(*) n FROM beta_runs').first()).n,0);}
 await rejectChanged(x=>{x.primary.tables.dev_object_chunks[0].body={blobBase64:'broken'};},/BLOB/);
 await rejectChanged(x=>{x.primary.tables.dev_location_history[0].unknown='bad';},/column mismatch/);
 await rejectChanged(x=>{delete x.diagnostics.tables.beta_reviews;},/inventory mismatch/);
 await rejectChanged(x=>{x.primary.tables.dev_object_store[0].etag='0'.repeat(64);},/hash mismatch/);
 await rejectChanged(x=>{x.diagnostics.tables.beta_reviews[0].payload={bad:'cell'};},/recovery cell/);
 await target.db.prepare('CREATE TABLE unexpected_recovery_state(id TEXT)').run();await assert.rejects(()=>recovery.restoreCardfreeD1(target.env,backup.body,backup.sha256),/unclassified/);await target.db.prepare('DROP TABLE unexpected_recovery_state').run();
 await target.db.prepare('DROP TABLE brick_dev_migrations').run();await target.db.prepare('CREATE TABLE brick_dev_migrations(name TEXT,hidden_data TEXT)').run();await assert.rejects(()=>recovery.restoreCardfreeD1(target.env,backup.body,backup.sha256),/bookkeeping schema/);await target.db.prepare('DROP TABLE brick_dev_migrations').run();await target.db.prepare('CREATE TABLE brick_dev_migrations(name TEXT PRIMARY KEY,applied_at INTEGER NOT NULL)').run();await target.db.prepare("INSERT INTO brick_dev_migrations VALUES('target-schema',456)").run();
 const result=await recovery.restoreCardfreeD1(target.env,backup.body,backup.sha256);assert.equal(result.primaryTables,41);assert.equal(result.diagnosticTables,4);assert.equal((await target.db.prepare('SELECT applied_at FROM brick_dev_migrations').first()).applied_at,456,'target migration ledger must remain its own');
 assert.deepEqual(await counts(target.db,recovery.CARDFREE_PRIMARY_TABLES),Object.fromEntries(Object.entries(expected.primary.tables).map(([k,v])=>[k,v.length])));
 assert.deepEqual(await counts(target.beta,recovery.CARDFREE_DIAGNOSTIC_TABLES),Object.fromEntries(Object.entries(expected.diagnostics.tables).map(([k,v])=>[k,v.length])));
 assert.equal((await target.db.prepare('SELECT status FROM device_commands').first()).status,'expired');
 for(const table of recovery.CARDFREE_PRIMARY_EXCLUDED)assert.equal((await target.db.prepare('SELECT COUNT(*) n FROM '+table).first()).n,0);
 for(const table of recovery.CARDFREE_DIAGNOSTIC_EXCLUDED)assert.equal((await target.beta.prepare('SELECT COUNT(*) n FROM '+table).first()).n,0);
 const restoredStore=new D1ObjectBucket(target.db),restored=await restoredStore.get(original.key);assert.deepEqual(new Uint8Array(await restored.arrayBuffer()),objectBytes);assert.equal(restored.etag,original.etag);assert.equal(restored.uploaded.getTime(),original.uploaded.getTime());assert.deepEqual(restored.customMetadata,original.customMetadata);
 const recoveredHistory=(await target.db.prepare('SELECT * FROM dev_location_history').all()).results;assert.deepEqual(JSON.parse(JSON.stringify(recoveredHistory)),expected.primary.tables.dev_location_history);
 assert.equal(await restoredStore.get('backups/d1/old.json.gz'),null);
 for(const snap of doSnapshots){const result=await rpc(target,snap.id,'restoreRecoveryState',[snap.id,snap.serialized,snap.sha256]);assert.equal(result.ok,true,result.error);assert.equal(result.value,true);}
 await assert.rejects(()=>recovery.restoreCardfreeD1(target.env,backup.body,backup.sha256),/not empty/);
 const pathName=target.persist;await close(target);target=await start('fresh',true,false);assert.equal(target.persist,pathName);
 assert.deepEqual(new Uint8Array(await(await new D1ObjectBucket(target.db).get(original.key)).arrayBuffer()),objectBytes);
 const after=await rpc(target,DEVICE_B,'exportRecoveryState',[DEVICE_B]);assert.equal(JSON.parse(after.value).state.wsRevoked,true);
 assert.equal(await target.stub(DEVICE_B).setHealth({protocol:1,appVersion:'revoked',healthSequence:100}),false);
 const schedulerNs=await target.mf.getDurableObjectNamespace('BETA_SCHEDULER'),scheduler=schedulerNs.get(schedulerNs.idFromName('beta-maintenance'));assert.equal((await scheduler.status()).nextAlarmAt,null);await scheduler.arm();assert.ok((await scheduler.status()).nextAlarmAt>Date.now());
 const interrupted=await start('interrupted',true);const brokenEnv={...interrupted.env,BETA_DB:{prepare:interrupted.beta.prepare.bind(interrupted.beta),batch:async()=>{throw Error('synthetic diagnostic-store interruption');}}};await assert.rejects(()=>recovery.restoreCardfreeD1(brokenEnv,backup.body,backup.sha256),/synthetic diagnostic-store interruption/);assert.ok((await interrupted.db.prepare('SELECT COUNT(*) n FROM devices').first()).n>0);await assert.rejects(()=>recovery.restoreCardfreeD1(interrupted.env,backup.body,backup.sha256),/not empty/);
 assert.equal((await target.db.prepare("SELECT COUNT(*) n FROM provider_cache WHERE provider='brick_refinement_failure_v1'").first()).n,0);
 await assert.rejects(()=>processFrames({DB:target.db,HISTORY:new D1ObjectBucket(target.db)},DEVICE_A,now+240000),/inputs unavailable/);
 const reconstructed=JSON.parse((await target.db.prepare("SELECT value_json FROM provider_cache WHERE provider='brick_refinement_failure_v1'").first()).value_json);assert.equal(reconstructed.status,'FAILED');assert.equal(reconstructed.attempts,1);
 console.log('PASS encrypted disaster restore excludes operational quarantine/cursors, retains pending inputs and reconstructs failure from those inputs; prior attempt history is not restored');
 console.log('PASS corrupt/missing stores, malformed late rows/BLOBs, hash and bounds fail before writes; interrupted target is explicitly partial and rejects in-place retry');
 console.log('PASS fresh41-table primary +4-table diagnostics restore; exact history/object bytes, original retention timestamps, command expiry, credentials/nonces excluded, DO revocation and restart, scheduler independently reconstructed');
 console.log('LIMIT local quiesced synthetic drill, 16MiB archive envelope; not scheduled/off-platform production backup, cloud drill, interrupted recovery, scale or RTO/RPO acceptance');
}finally{for(const mf of live)await mf.dispose();fs.rmSync(dir,{recursive:true,force:true});}
