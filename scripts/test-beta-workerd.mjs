import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build,transform} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {newDatabase,ecdsa,DEVICE_A,DEVICE_B} from './phase8d-native-fixture.mjs';
import {livePacketBytes} from './phase8d-do-state-fixture.mjs';
const dir=fs.mkdtempSync(path.resolve('.brick-beta-workerd-'));
const runtime=path.join(dir,'worker.mjs');
await build({entryPoints:['src/worker-beta-cardfree.ts'],outfile:runtime,bundle:true,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:workers']});
await build({entryPoints:['src/dev-free-runtime.ts'],outfile:path.join(dir,'storage.mjs'),bundle:true,format:'esm',platform:'node',target:'node24'});
const {D1ObjectBucket}=await import(pathToFileURL(path.join(dir,'storage.mjs')).href);
const key=await ecdsa();
const loginToken='a'.repeat(43);const loginHash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(loginToken))).toString('hex');let cookie='';
const config=JSON.parse(fs.readFileSync('wrangler.beta.template.jsonc','utf8'));
const mf=new Miniflare(convertV4MiniflareOptions({name:'brick-beta-test',modules:true,modulesRoot:dir,scriptPath:runtime,compatibilityDate:config.compatibility_date,
 bindings:{APP_ENV:'development',DEV_PARENT_AUTH_MODE:'d1-session-v1',BETA_STORAGE_MODE:'d1',DEV_PARENT_LOGIN_HASH:loginHash,BRICK_MAP_SOURCE:'https://map.test/fixture.pmtiles',CURRENT_APP_VERSION:'1.0.0-beta.2',BETA_CHANNEL:'beta',BETA_SOURCE_SHA:'a'.repeat(40)},
 d1Databases:['DB','BETA_DB'],durableObjects:{BRICK_DEVICE:{className:'BrickDevice',useSQLite:true},BETA_SCHEDULER:{className:'BetaScheduler',useSQLite:true}},
 ratelimits:Object.fromEntries(config.ratelimits.map(x=>[x.name,{namespace_id:x.namespace_id,simple:{limit:10000,period:60}}])),
 outboundService(req){if(req.url==='https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png')return new Response(new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]),{status:200,headers:{'Content-Type':'image/png'}});if(req.url.startsWith('https://www.onemap.gov.sg/maps/tiles/'))return new Response(new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]),{status:200,headers:{'Content-Type':'image/png'}});if(req.url==='https://map.test/fixture.pmtiles'){const match=(req.headers.get('Range')||'').match(/bytes=(\d+)-(\d+)/);const data='map-fixture';const body=match?data.slice(Number(match[1]),Number(match[2])+1):data;return new Response(req.method==='HEAD'?null:body,{status:match?206:200,headers:{'Content-Length':String(req.method==='HEAD'?data.length:body.length),ETag:'fixture','Content-Range':match?'bytes '+match[1]+'-'+match[2]+'/'+data.length:''}});}return new Response('unconfigured',{status:503});}
}));
async function parent(suffix,init={}){return mf.dispatchFetch('http://localhost'+suffix,{...init,headers:{Cookie:cookie,Origin:'http://localhost',...init.headers}});}
async function signed(suffix,body,k=key){const r=await k.signed('http://localhost/api/device/'+DEVICE_A+suffix,body);return mf.dispatchFetch(r.url,{method:r.method,headers:r.headers,body:await r.arrayBuffer()});}
const releaseId='brick-phase1-20261106-01',apkSourceSha='dda193f79598fec0d814883b13fb3c16f5021817';
const envelope=()=>({protocol:1,nonce:crypto.randomUUID(),releaseId,apkSourceSha,sentAtMs:Date.now()});
const localChecks=[{id:'tracking',status:'PENDING',detail:'synthetic device',required:true}];
const ready=()=>({...envelope(),localChecks,localCheckedAtMs:Date.now(),appVersion:'1.0.0-beta.2'});
const until=async(fn,label)=>{const end=Date.now()+15000;do{const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,40));}while(Date.now()<end);throw Error('Timeout '+label);};
let socket;
try{
 const db=await mf.getD1Database('DB'),beta=await mf.getD1Database('BETA_DB');
 const native=newDatabase();for(const f of ['012_phase6c_free_runtime.sql','013_phase6c_request_maintenance.sql','014_phase6c_virtual_history.sql'])native.exec(fs.readFileSync('schema/'+f,'utf8'));for(const row of native.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all())await db.prepare(row.sql).run();native.close();
 for(const sql of fs.readFileSync('schema/beta_diagnostics.sql','utf8').replace(/--[^\n]*/g,'').split(';').filter(x=>x.trim()))await beta.prepare(sql).run();
 await db.prepare('INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?1,?2,?3,?4)').bind(DEVICE_A,'Synthetic beta',key.spki,Date.now()).run();
 const loginDocument=await mf.dispatchFetch('http://localhost/parent/login');
 assert.equal(loginDocument.status,200);
 assert.equal(loginDocument.headers.get('Referrer-Policy'),'same-origin');
 assert.ok((await loginDocument.text()).includes('form method="post" action="/parent/login"'));
 assert.equal((await mf.dispatchFetch('http://localhost/parent',{redirect:'manual'})).status,302);
 assert.equal((await mf.dispatchFetch('http://localhost/parent/api/device/'+DEVICE_A+'/beta/status',{headers:{'X-Brick-Dev-Parent-Verified':'session-v1'}})).status,401);
 const login=await mf.dispatchFetch('http://localhost/parent/login',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/x-www-form-urlencoded'},body:'token='+loginToken,redirect:'manual'});assert.equal(login.status,303);cookie=login.headers.get('set-cookie').split(';')[0];
 for(const route of ['/parent/beta/download/apk','/parent/beta/download/manifest','/parent/api/device/'+DEVICE_A+'/beta/status'])assert.equal((await mf.dispatchFetch('http://localhost'+route)).status,401);
 assert.equal((await parent('/parent/api/device/'+DEVICE_B+'/beta/status')).status,404);
 const page=await parent('/parent');assert.equal(page.status,200);assert.match(page.headers.get('Content-Security-Policy'),/nonce-/);const html=await page.text();assert.match(html,/BETA · Test centre/);assert.match(html,/beta_challenge/);assert.match(html,/p8bLiveOn/);assert.ok(html.includes('brickBetaCompactMap'),'beta compact map CSS not injected');
 assert.ok(html.includes('data-tab="logs"'),'standalone Logs tab should be present');
 assert.ok(html.includes('Android full diagnostic logs are not uploaded'),'Logs must label incomplete phone coverage truthfully');assert.ok(html.includes('92vh'),'desktop map must be near double prior height');assert.ok(html.includes('70vh'),'mobile map must be taller');assert.ok(html.includes('/brick-map.mjs?v=beta-parent-recovery-20261105'),'portal must bust legacy immutable map bundle cache');assert.ok(!html.includes('getPrivateMapStatus, switchToStandardOneMap'),'portal must retain original four-export map API');assert.ok(!html.includes('brickMapDeliveryStatus'),'optional diagnostics must not block dashboard startup');assert.ok(html.includes("loadDevices().catch("),'device list must load even if map never fires load');assert.ok(html.includes("map.on('error'"),'map failures must provide a user-visible status');
 for(const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))if(match[1].trim())await transform(match[1],{loader:'js'});
 assert.equal((await mf.dispatchFetch('http://localhost/parent/map/onemap/Default_HD/11/1614/1016.png')).status,401,'map tiles require parent auth');
 const tile=await parent('/parent/map/onemap/Default_HD/11/1614/1016.png');
 assert.equal(tile.status,200,'same-origin OneMap tile proxy must respond');
 assert.equal(tile.headers.get('Content-Type'),'image/png');
 assert.deepEqual(new Uint8Array(await tile.arrayBuffer()).slice(0,8),new Uint8Array([137,80,78,71,13,10,26,10]));
 const regularTile=await parent('/parent/map/onemap/Default/11/1614/1016.png');assert.equal(regularTile.status,200);
 const onemapLogo=await parent('/parent/map/onemap/logo.png');assert.equal(onemapLogo.status,200,'OneMap attribution logo must be available under strict CSP');assert.equal(onemapLogo.headers.get('Content-Type'),'image/png');
 assert.equal((await parent('/parent/map/onemap/Default_HD/20/1614/1016.png')).status,404,'invalid zoom not proxied');
 assert.equal((await parent('/parent/map/onemap/Invalid/11/1614/1016.png')).status,404,'arbitrary upstream paths prohibited');
 const staticHeaders=fs.readFileSync('public/_headers','utf8');assert.ok(staticHeaders.includes('Cache-Control: no-cache, must-revalidate'),'stable map assets must be revalidated instead of cached immutably');
 const builtMap=fs.readFileSync('public/brick-map.mjs','utf8');
 assert.ok(builtMap.includes('/parent/map/onemap/'),'browser map must use authenticated same-origin tile URL');
 const map=await parent('/parent/map/basemap.pmtiles',{headers:{Range:'bytes=2-5'}});assert.equal(map.status,206);assert.equal(await map.text(),'p-fi');assert.equal(map.headers.get('Content-Range'),'bytes 2-5/11');
 const cachedMap=await parent('/parent/map/basemap.pmtiles',{headers:{Range:'bytes=2-5'}});assert.equal(cachedMap.status,206);assert.equal(cachedMap.headers.get('Content-Range'),'bytes 2-5/11','cache must preserve requested PMTiles start offset');assert.equal(await cachedMap.text(),'p-fi');
 const laterMap=await parent('/parent/map/basemap.pmtiles',{headers:{Range:'bytes=5-7'}});assert.equal(laterMap.status,206);assert.equal(laterMap.headers.get('Content-Range'),'bytes 5-7/11');assert.equal(await laterMap.text(),'ixt');
 const objectStore=new D1ObjectBucket(db),blob=new Uint8Array(2200000).fill(37);await objectStore.put('synthetic-large-object',blob);assert.equal((await objectStore.get('synthetic-large-object')).size,blob.length);assert.deepEqual(new Uint8Array(await (await objectStore.get('synthetic-large-object',{range:{offset:899995,length:20}})).arrayBuffer()),new Uint8Array(20).fill(37));await objectStore.delete('synthetic-large-object');assert.equal(await objectStore.get('synthetic-large-object'),null);
 const schedNs=await mf.getDurableObjectNamespace('BETA_SCHEDULER'),sched=schedNs.get(schedNs.idFromName('beta-maintenance'));await sched.runTick();const scheduler=await sched.status();assert.ok(scheduler.nextAlarmAt>Date.now());assert.equal(scheduler.lastTick.status,'COMPLETED');
 console.log('PASS beta portal preserves existing UI, CSP and authenticated private downloads; generated scripts parse');
 assert.equal((await signed('/beta/readiness',{...ready(),apkSourceSha:'b'.repeat(40)})).status,400);
 assert.equal((await signed('/beta/readiness',ready(),await ecdsa())).status,401);
 assert.equal((await signed('/beta/readiness',{...ready(),sentAtMs:Date.now()-130000})).status,400);
 assert.equal((await signed('/beta/readiness',{...ready(),localChecks:[{...localChecks[0],latitude:1.3}]})).status,400);
 const ws=await parent('/parent/api/device/'+DEVICE_A+'/ws',{headers:{Upgrade:'websocket'}});assert.equal(ws.status,101);socket=ws.webSocket;socket.accept();
 let token;socket.addEventListener('message',e=>{const b=JSON.parse(e.data);if(b.type==='beta_challenge'){assert.equal(b.deviceId,DEVICE_A);token=b.token;}});
 const body=ready();let response=await signed('/beta/readiness',body);assert.equal(response.status,200);let proof=await response.json();assert.equal(proof.nonce,body.nonce);assert.equal(proof.environment,'beta');assert.equal(proof.backendSourceSha,'a'.repeat(40));
 const checks=Object.fromEntries(proof.checks.map(x=>[x.id,x.status]));assert.equal(checks.d1_roundtrip,'PASS');assert.equal(checks.object_store_roundtrip,'PASS');assert.equal(checks.do_roundtrip,'PASS');assert.equal(checks.history_readback,'PENDING');assert.equal(checks.portal_delivery,'PENDING');
 assert.equal((await signed('/beta/readiness',body)).status,409);await until(()=>token,'socket challenge');
 assert.equal((await parent('/parent/api/device/'+DEVICE_A+'/beta/ack',{method:'POST',headers:{Origin:'https://evil.invalid'},body:JSON.stringify({token})})).status,403);
 assert.equal((await parent('/parent/api/device/'+DEVICE_A+'/beta/ack',{method:'POST',body:JSON.stringify({token:crypto.randomUUID()})})).status,409);
 assert.equal((await parent('/parent/api/device/'+DEVICE_A+'/beta/ack',{method:'POST',body:JSON.stringify({token})})).status,200);
 await until(async()=>!!(await beta.prepare('SELECT queue_at FROM beta_challenges WHERE device_id=?1').bind(DEVICE_A).first()).queue_at,'D1 direct event receipt');
 const bytes=livePacketBytes(Date.now(),1);const signature=Buffer.from(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key.pair.privateKey,bytes)).toString('base64');
 assert.equal((await mf.dispatchFetch('http://localhost/api/device/'+DEVICE_A+'/location',{method:'POST',headers:{'X-Brick-Signature':signature},body:bytes})).status,200);
 await until(async()=> (await db.prepare('SELECT COUNT(*) n FROM dev_location_history').first()).n>0,'normal accepted location to D1 history');
 proof=await (await signed('/beta/readiness',ready())).json();assert.equal(proof.checks.length,6);assert.ok(proof.checks.every(x=>x.status==='PASS'),JSON.stringify(proof.checks));
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM dev_object_store').first()).n,0);
 console.log('PASS native signed D1 primary/chunked-object readback, D1 direct event persistence, real device DO/current state, normal location history and selected-device WebSocket ACK; no canned PASS');
 const run={runId:crypto.randomUUID(),startedAtMs:Date.now(),releaseId,apkSourceSha,bindingHash:'c'.repeat(64),version:'1.0.0-beta.2',model:'synthetic',android:'15',osBuild:'AOSP',escapeVerifiedByUser:true};
 const observation={wallMs:Date.now(),elapsedMs:2000,boot:1,health:{recordedAtMs:Date.now(),network:'wifi',locationSubscribed:true,bleAnchorProviderHealth:'HEALTHY'},sameBootGapMs:null,bootChanged:false};
 const observations=()=>({...envelope(),run,records:[{id:1,observation}],droppedRecords:0,readiness:null});
 let batch=observations();let ack=await signed('/beta/observations',batch);assert.equal(ack.status,200);assert.equal((await ack.json()).acceptedThroughId,1);
 assert.equal((await signed('/beta/observations',observations())).status,200);
 assert.equal((await signed('/beta/observations',{...observations(),run:Object.fromEntries(Object.entries(run).reverse())})).status,200);
 assert.equal((await signed('/beta/observations',{...observations(),records:[{id:1,observation:{...observation,health:{lat:1.3}}}]})).status,400);
 assert.equal((await signed('/beta/observations',{...observations(),records:[{id:1,observation:{...observation,wallMs:observation.wallMs+1}}]})).status,409);
 assert.equal((await beta.prepare('SELECT COUNT(*) n FROM beta_records').first()).n,1);
 const unauthOps=await mf.dispatchFetch('http://localhost/parent/api/device/'+DEVICE_A+'/ops-logs');
 assert.equal(unauthOps.status,401,'operational logs are private');
 const ops=await parent('/parent/api/device/'+DEVICE_A+'/ops-logs?limit=10');
 assert.equal(ops.status,200,'signed beta observations must be readable');
 const opsBody=await ops.json();assert.equal(opsBody.items.length,1);
 assert.equal(opsBody.items[0].eventCode,'health_observation');
 assert.equal(opsBody.items[0].detail.network,'wifi');
 assert.equal(opsBody.androidDiagnosticStoreUploaded,false,'do not claim phone local logs were uploaded');
 assert.equal(opsBody.timezone,'Asia/Singapore');
 assert.equal((await parent('/parent/api/device/'+DEVICE_B+'/ops-logs')).status,404,'no unrelated device records');
 assert.equal((await parent('/parent/api/device/'+DEVICE_A+'/ops-logs?limit=500')).status,400,'bound log pagination');
 assert.equal((await parent('/parent/api/device/'+DEVICE_A+'/ops-logs',{method:'POST'})).status,405,'logs read-only');
 
 const imported={format:'brick-beta-observations-v1',summary:{run,active:false,stopReason:'user_stopped_review_required',interventions:[{atMs:Date.now(),elapsedMs:2000,reason:'PLANNED_DEVICE_REBOOT'}]}};
 assert.equal((await parent('/parent/api/device/'+DEVICE_A+'/beta/import',{method:'POST',body:JSON.stringify(imported)})).status,200);
 const status=await (await parent('/parent/api/device/'+DEVICE_A+'/beta/status')).json();assert.equal(status.evidence.run.runId,run.runId);assert.equal(status.evidence.review.interventions.length,1);assert.equal(status.evidence.assessment,'REVIEW_REQUIRED');
 assert.equal((await parent('/parent/beta/download/manifest')).status,200);assert.equal((await parent('/parent/beta/download/apk')).status,503);
 if(fs.existsSync('beta-artifact/Brick.apk')){
  const apk=fs.readFileSync('beta-artifact/Brick.apk'),key='beta/releases/'+releaseId+'/Brick.apk';
  {const upload=await parent('/parent/beta/publish/apk',{method:'POST',body:apk});assert.equal(upload.status,200,(await upload.text()).slice(0,1500));}
  const file=await parent('/parent/beta/download/apk');assert.equal(file.status,200);assert.deepEqual(Buffer.from(await file.arrayBuffer()),apk);
  assert.ok((await db.prepare('SELECT COUNT(*) n FROM dev_object_chunks WHERE key=?1').bind(key).first()).n>=3);
  await db.prepare('DELETE FROM dev_object_chunks WHERE key=?1 AND chunk_index=1').bind(key).run();assert.equal((await parent('/parent/beta/download/apk')).status,503);
  {const upload=await parent('/parent/beta/publish/apk',{method:'POST',body:apk});assert.equal(upload.status,200,(await upload.text()).slice(0,1500));}await objectStore.delete(key);
  console.log('PASS actual permanent-signed APK D1 multi-chunk authenticated publication/readback; missing chunk refuses download; transactional replacement repairs it');
 }
 await db.prepare('INSERT INTO dev_object_store(key,size,etag,uploaded_at) VALUES(?1,?2,?3,?4)').bind('beta/releases/'+releaseId+'/Brick.apk',0,'wrong',Date.now()).run();assert.equal((await parent('/parent/beta/download/apk')).status,503);
 await db.prepare('UPDATE devices SET revoked_at=?1 WHERE id=?2').bind(Date.now(),DEVICE_A).run();assert.equal((await signed('/beta/readiness',ready())).status,401);assert.equal((await parent('/parent/api/device/'+DEVICE_A+'/beta/status')).status,404);
 assert.equal((await parent('/parent/logout',{method:'POST',redirect:'manual'})).status,303);assert.equal((await parent('/parent/api/devices')).status,401);
 console.log('PASS durable exact batch ACK/idempotency/conflict, privacy rejection, private export import, corrupt APK refusal and revoked-device isolation');
}finally{try{socket?.close();}catch{}await mf.dispose();fs.rmSync(dir,{recursive:true,force:true});}
