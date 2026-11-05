// Synthetic, quiesced local workerd drill. Never contacts Cloudflare or opens an HTTP restore route.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { newDatabase, ecdsa, DEVICE_A, DEVICE_B } from './phase8d-native-fixture.mjs';
import { livePacketBytes } from './phase8d-do-state-fixture.mjs';
const dir = fs.mkdtempSync(path.resolve('.brick-p8d-full-recovery-'));
const runtime = path.join(dir, 'worker.mjs');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const config = JSON.parse(fs.readFileSync('wrangler.template.jsonc', 'utf8'));
const baseline = process.argv.includes('--baseline');
const plugins = baseline ? [{ name:'previous-device-source',setup(b){b.onLoad({filter:/\/src\/device-do\.ts$/},()=>({contents:execFileSync('git',['show','ff020438ce97638ec4af6a584dd33112c82d1ba5:src/device-do.ts'],{encoding:'utf8'}),loader:'ts',resolveDir:path.resolve('src')}));} }] : [];
let source, target, ordinary;
async function start(name, restore = false, initialize = true) {
  const persist = path.join(dir, name);
  const mf = new Miniflare(convertV4MiniflareOptions({name:'brick-local',modules:true,modulesRoot:dir,scriptPath:runtime,compatibilityDate:config.compatibility_date,
    bindings:{APP_ENV:'production',...(restore?{BRICK_RECOVERY_MODE:'isolated-restore'}:{})},
    d1Databases:['DB'],r2Buckets:['HISTORY','MAPS'],durableObjects:{BRICK_DEVICE:{className:'BrickDevice',useSQLite:true}},
    resourcePersistencePath:path.join(persist,'shared'),isolatedResourcePersistencePath:path.join(persist,'isolated'),
    queueProducers:{EVENTS:'recovery-events'},queueConsumers:{'recovery-events':{maxBatchSize:10,maxBatchTimeout:0,maxRetries:2}},
    ratelimits:Object.fromEntries(config.ratelimits.map(x=>[x.name,{namespace_id:x.namespace_id,simple:x.simple}])),
    outboundService(){return new Response('No external services in recovery drill',{status:503});}
  }));
  const db=await mf.getD1Database('DB');
  const native=newDatabase();
  const ddl=native.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all();native.close();
  if(initialize)for(const {sql} of ddl)await db.prepare(sql).run();
  const ns=await mf.getDurableObjectNamespace('BRICK_DEVICE');
  return {mf,db,ns,persist,stub:id=>ns.get(ns.idFromName(id))};
}
async function refuse(store,id,method,args,pattern){
 const response=await store.mf.dispatchFetch('http://localhost/__synthetic_recovery_rpc',{method:'POST',body:JSON.stringify({id,method,args})});
 const result=await response.json();assert.equal(result.ok,false);assert.match(result.error,pattern);
}
async function until(check,label){const end=Date.now()+10000;do{if(await check())return;await new Promise(r=>setTimeout(r,25));}while(Date.now()<end);throw Error('Timed out: '+label);}
async function inventory(mf){const out=[];for(const name of ['HISTORY','MAPS']){const bucket=await mf.getR2Bucket(name);let cursor;
 do{const page=await bucket.list({cursor});for(const item of page.objects){const o=await bucket.get(item.key);const bytes=Buffer.from(await o.arrayBuffer());out.push({bucket:name,key:item.key,bytes,sha256:digest(bytes),httpMetadata:o.httpMetadata,customMetadata:o.customMetadata,sourceUploaded:o.uploaded.toISOString()});}cursor=page.truncated?page.cursor:undefined;}while(cursor);
 }return out.sort((a,b)=>(a.bucket+'/'+a.key).localeCompare(b.bucket+'/'+b.key));}
async function restoreObjects(mf,manifest,objects){
 // Verify the entire trusted manifest before the first target write. Missing data is not a partial PASS.
 for(const entry of manifest){const o=objects.find(x=>x.bucket===entry.bucket&&x.key===entry.key);assert(o,'missing R2 recovery object');assert.equal(digest(o.bytes),entry.sha256,'R2 recovery digest mismatch');}
 for(const entry of manifest){const o=objects.find(x=>x.bucket===entry.bucket&&x.key===entry.key);await (await mf.getR2Bucket(entry.bucket)).put(entry.key,o.bytes,{httpMetadata:o.httpMetadata,customMetadata:o.customMetadata});}
}
try{
 // Test-only bridge catches expected RPC exceptions inside workerd. Miniflare's host
 // proxy currently asserts on immediate RPC rejections; never weaken the refusal assertion.
 const harness = `import worker from "./src/worker-p8b.ts"; export { BrickDevice } from "./src/worker-p8b.ts";
 export default {...worker,async fetch(req,env,ctx){if(new URL(req.url).pathname!=="/__synthetic_recovery_rpc")return worker.fetch(req,env,ctx);
 const {id,method,args}=await req.json();try{const stub=env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(id));await stub[method](...args);return Response.json({ok:true});}
 catch(e){return Response.json({ok:false,error:e.message});}}};`;
 await build({stdin:{contents:harness,resolveDir:process.cwd(),sourcefile:'synthetic-recovery-harness.ts'},outfile:runtime,bundle:true,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:workers'],plugins});
 const backupFile=path.join(dir,'backup.mjs'),restoreFile=path.join(dir,'restore.mjs');
 await build({entryPoints:['src/backup-v6.ts'],outfile:backupFile,bundle:true,format:'esm',platform:'node'});
 await build({entryPoints:['src/backup-restore-v6.ts'],outfile:restoreFile,bundle:true,format:'esm',platform:'node'});
 const {snapshotD1ToR2,BACKUP_TABLES}=await import(pathToFileURL(backupFile).href);
 const {restoreBackupToFreshD1}=await import(pathToFileURL(restoreFile).href);
 source=await start('source'); const key=await ecdsa(),other=await ecdsa(),now=Date.now();
 for(const [id,k] of [[DEVICE_A,key],[DEVICE_B,other]])await source.db.prepare("INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?1,'Synthetic recovery',?2,?3)").bind(id,k.spki,now).run();
 const bytes=livePacketBytes(now,17),signature=Buffer.from(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key.pair.privateKey,bytes)).toString('base64');
 assert.equal((await source.mf.dispatchFetch('http://localhost/api/device/'+DEVICE_A+'/location',{method:'POST',headers:{'X-Brick-Signature':signature},body:bytes})).status,200);
 const history=await source.mf.getR2Bucket('HISTORY');
 await until(async()=> (await history.list({prefix:'history/'})).objects.length===2,'actual Queue raw/trusted history');
 const stub=source.stub(DEVICE_A);
 await stub.setHealth({protocol:1,appVersion:'synthetic',healthSequence:9,healthSentAtMs:now});
 await stub.setNetworkEvidence({country:'synthetic',region:null,city:null,colo:null,receivedAt:now});
 await stub.pushSafetyEvent({id:'synthetic-safety',kind:'sos',deviceCreatedAt:now,serverCreatedAt:now,latitude:null,longitude:null,accuracyM:null,detail:{}});
 await stub.commitSequenceHighWater(1,17);await stub.commitSafetyHighWater(19);await stub.commitSafetyEvaluation(1,17);
 await source.db.prepare("INSERT INTO device_location_control(device_id,desired_enabled,command_id,issued_at,updated_at,command_status) VALUES(?1,0,'synthetic-pending',?2,?2,'pending')").bind(DEVICE_A,now).run();
 await source.db.prepare('UPDATE devices SET revoked_at=?1 WHERE id=?2').bind(now,DEVICE_B).run();
 await source.stub(DEVICE_B).revokeParentSockets();
 await (await source.mf.getR2Bucket('MAPS')).put('synthetic/map.bin',new Uint8Array([0,255,3,4]),{httpMetadata:{contentType:'application/octet-stream'},customMetadata:{fixture:'synthetic'}});
 // Explicit quiescence: no ingestion, cron, sockets, producer or further writes after this point.
 const snapshots=[];
 for(const id of [DEVICE_A,DEVICE_B]){const serialized=await source.stub(id).exportRecoveryState(id);snapshots.push({id,serialized,sha256:digest(serialized)});}
 await refuse(source,DEVICE_A,'exportRecoveryState',[DEVICE_B],/namespace\/device mismatch/);
 const saved=JSON.parse(snapshots[0].serialized);assert.equal(Object.keys(saved.state).length,7);assert.equal(saved.state.safetyHighWater,19);
 const snapshot=await snapshotD1ToR2({DB:source.db,HISTORY:history});
 const d1Bytes=await (await history.get(snapshot.key)).arrayBuffer();
 const counts={};for(const table of BACKUP_TABLES)counts[table]=(await source.db.prepare('SELECT COUNT(*) n FROM '+table).first()).n;
 const objects=await inventory(source.mf);assert.equal(objects.length,4);
 const manifest=objects.map(({bytes,...entry})=>entry);
 await source.mf.dispose();assert(fs.existsSync(source.persist),'source persistence must exist before destruction');assert(fs.readdirSync(source.persist,{recursive:true}).some(x=>x.endsWith('.sqlite')),'actual persistent SQLite files required');fs.rmSync(source.persist,{recursive:true,force:true});assert(!fs.existsSync(source.persist));source=null;
 console.log('PASS destroyed actual source D1/R2/DO persistence after quiesced snapshot; recovery uses only saved backup objects and DO snapshots');
 target=await start('fresh-target',true);
 await assert.rejects(restoreObjects(target.mf,manifest,objects.slice(1)),/missing R2 recovery object/);
 assert.equal((await inventory(target.mf)).length,0);
 const corrupted=objects.map(x=>({...x,bytes:Buffer.from(x.bytes)}));corrupted[0].bytes[0]^=1;
 await assert.rejects(restoreObjects(target.mf,manifest,corrupted),/digest mismatch/);assert.equal((await inventory(target.mf)).length,0);
 await restoreObjects(target.mf,manifest,objects);
 const restored=await restoreBackupToFreshD1({DB:target.db},d1Bytes,snapshot.sha256);
 assert.equal(restored.coverageComplete,true);assert.equal(Object.keys(restored.restoredRows).length,38);
 for(const [table,n] of Object.entries(counts))assert.equal((await target.db.prepare('SELECT COUNT(*) n FROM '+table).first()).n,n,table);
 assert.equal((await target.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 assert.equal((await target.db.prepare('SELECT command_status FROM device_location_control').first()).command_status,'expired');
 const recovered=await inventory(target.mf);for(let i=0;i<manifest.length;i++){assert.equal(recovered[i].sha256,manifest[i].sha256);assert.deepEqual(recovered[i].customMetadata,manifest[i].customMetadata);assert.deepEqual(recovered[i].httpMetadata,manifest[i].httpMetadata);}
 console.log('PASS fresh local D1 38-table row/FK reconciliation, pending command expiry, R2 HISTORY/MAPS exact bytes and metadata; missing/corrupt R2 fail before writes');
 for(const snap of snapshots){
  const s=target.stub(snap.id);
  await refuse(target,snap.id,'restoreRecoveryState',[snap.id,'x'.repeat(65537),'0'.repeat(64)],/integrity mismatch/);
  const unknown=JSON.parse(snap.serialized);unknown.state.futureState={x:1};const unknownText=JSON.stringify(unknown);
  await refuse(target,snap.id,'restoreRecoveryState',[snap.id,unknownText,digest(unknownText)],/unknown recovery state key/);
  const marker=JSON.parse(snap.serialized);marker.state.safetyHighWater=-1;const markerText=JSON.stringify(marker);
  await refuse(target,snap.id,'restoreRecoveryState',[snap.id,markerText,digest(markerText)],/invalid safety marker/);
  await refuse(target,snap.id,'restoreRecoveryState',[snap.id,snap.serialized,'0'.repeat(64)],/integrity mismatch/);

  const bad=JSON.parse(snap.serialized);bad.keySha256='0'.repeat(64);const badText=JSON.stringify(bad);
  await refuse(target,snap.id,'restoreRecoveryState',[snap.id,badText,digest(badText)],/device key mismatch/);
  await target.db.prepare("UPDATE devices SET public_key_spki_b64=rtrim(public_key_spki_b64,'=') WHERE id=?1").bind(snap.id).run();
  assert.equal(await s.restoreRecoveryState(snap.id,snap.serialized,snap.sha256),true);
  await refuse(target,snap.id,'restoreRecoveryState',[snap.id,snap.serialized,snap.sha256],/not empty/);
  const after=JSON.parse(await s.exportRecoveryState(snap.id));assert.deepEqual(after.state,JSON.parse(snap.serialized).state);
 }
 assert.equal(await target.stub(DEVICE_A).readSafetyHighWater(),19);
 assert.equal(await target.stub(DEVICE_A).canEvaluateSafety(1,16),false);
 assert.equal(await target.stub(DEVICE_A).setHealth({protocol:1,appVersion:'old',healthSequence:8,healthSentAtMs:now}),false);
 await target.mf.dispose();target=await start('fresh-target',true,false);
 assert.equal(await target.stub(DEVICE_B).setHealth({protocol:1,appVersion:'revoked',healthSequence:20}),false);
 assert.equal((await target.stub(DEVICE_B).fetch('https://do/ws',{headers:{Upgrade:'websocket','X-Brick-Internal-Ws-Lease-Until':String(Date.now()+1000)}})).status,410);
 console.log('PASS DO restore preserves all eight supported key classes across active/revoked identities, timestamps, sequence/health ordering and reconstructed revocation fence; bad digest/key and occupied target refused');
 ordinary=await start('ordinary');
 await refuse(ordinary,DEVICE_A,'restoreRecoveryState',[DEVICE_A,snapshots[0].serialized,snapshots[0].sha256],/restore disabled/);
 console.log('PASS ordinary Worker environment refuses DO recovery; no HTTP restore endpoint, production configuration or cloud mutation');
 await ordinary.mf.dispose();ordinary=await start('revoked-target',true);
 await ordinary.db.prepare("INSERT INTO devices(id,name,public_key_spki_b64,created_at,revoked_at) VALUES(?1,'Synthetic revoked target',?2,?3,?3)").bind(DEVICE_A,key.spki,now).run();
 await ordinary.stub(DEVICE_A).restoreRecoveryState(DEVICE_A,snapshots[0].serialized,snapshots[0].sha256);
 assert.equal(JSON.parse(await ordinary.stub(DEVICE_A).exportRecoveryState(DEVICE_A)).state.wsRevoked,true);
 assert.equal(await ordinary.stub(DEVICE_A).setHealth({protocol:1,appVersion:'must remain revoked',healthSequence:100}),false);
 console.log('PASS restored D1 revocation overrides active snapshot; legacy unpadded identity normalization, unknown state, invalid markers and oversized snapshots checked');
 await ordinary.db.prepare("INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?1,'Synthetic guard fixture',?2,?3)").bind(DEVICE_B,other.spki,now).run();
 const guard=ordinary.stub(DEVICE_B);
 assert.equal(await guard.setHealth({protocol:1,appVersion:'synthetic',healthSequence:1,unsupportedNumber:Infinity}),true);
 await refuse(ordinary,DEVICE_B,'exportRecoveryState',[DEVICE_B],/not lossless JSON/);
 assert.equal(await guard.setHealth({protocol:1,appVersion:'synthetic',healthSequence:2,largeText:'x'.repeat(70000)}),true);
 await refuse(ordinary,DEVICE_B,'exportRecoveryState',[DEVICE_B],/snapshot too large/);
 const socketResponse=await guard.fetch('https://do/ws',{headers:{Upgrade:'websocket','X-Brick-Internal-Ws-Lease-Until':String(Date.now()+20000)}});
 assert.equal(socketResponse.status,101);socketResponse.webSocket.accept();
 await refuse(ordinary,DEVICE_B,'restoreRecoveryState',[DEVICE_B,snapshots[1].serialized,snapshots[1].sha256],/target has sockets\/alarm/);
 socketResponse.webSocket.close();
 console.log('PASS native DO export rejects nonfinite/oversized state, restore refuses a target with an attached WebSocket/alarm');
 console.log('LIMIT local synthetic evidence only: cloud destructive recovery, cross-store snapshot consistency under traffic, original R2 retention age, scale, RTO/RPO and operator orchestration remain OPEN');
}finally{for(const x of [source,target,ordinary])if(x)await x.mf.dispose();fs.rmSync(dir,{recursive:true,force:true});}
