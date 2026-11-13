// Signed requests through the actual card-free Worker and local D1/device DO.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {newCardfreeDatabase as newDatabase,ecdsa,DEVICE_A,DEVICE_B} from './phase8d-native-fixture.mjs';
import {livePacketBytes} from './phase8d-do-state-fixture.mjs';
const dir=fs.mkdtempSync(path.resolve('.brick-d1-ack-'));
const config=JSON.parse(fs.readFileSync('wrangler.beta.template.jsonc','utf8'));
let mf;
try{
 const harness=`import base from './src/worker-beta-cardfree.ts';export {BrickDevice,BetaScheduler} from './src/worker-beta-cardfree.ts';let fault='',attempt=0;export default {...base,async fetch(req,env,ctx){if(new URL(req.url).pathname==='/__synthetic_fault'){fault=await req.text();attempt=0;return new Response('set');}const db=env.DB;const wrapped={prepare(sql){const prepared=db.prepare(sql);return {bind(...args){const statement=prepared.bind(...args);if(!sql.includes('INSERT OR IGNORE INTO dev_location_history'))return statement;return new Proxy(statement,{get(target,key){if(key==='run')return async()=>{attempt++;if(fault==='first'||fault==='second'&&attempt===2)throw Error('synthetic history commit unavailable');if(fault==='revoke'){await db.prepare('UPDATE devices SET revoked_at=?1 WHERE id=?2').bind(Date.now(),${JSON.stringify(DEVICE_B)}).run();}return target.run();};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});}};},batch:db.batch.bind(db)};return base.fetch(req,{...env,DB:wrapped},ctx);}};`;
 await build({stdin:{contents:harness,resolveDir:process.cwd()},outfile:path.join(dir,'worker.mjs'),bundle:true,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:workers']});
 mf=new Miniflare(convertV4MiniflareOptions({name:'d1-ack',modules:true,modulesRoot:dir,scriptPath:path.join(dir,'worker.mjs'),compatibilityDate:config.compatibility_date,
  bindings:{APP_ENV:'development',DEV_PARENT_AUTH_MODE:'d1-session-v1',BETA_STORAGE_MODE:'d1',BETA_CHANNEL:'beta',BETA_SOURCE_SHA:'a'.repeat(40),BRICK_MAP_SOURCE:'https://map.invalid/synthetic'},d1Databases:['DB','BETA_DB'],durableObjects:{BRICK_DEVICE:{className:'BrickDevice',useSQLite:true},BETA_SCHEDULER:{className:'BetaScheduler',useSQLite:true}},ratelimits:Object.fromEntries(config.ratelimits.map(r=>[r.name,{namespace_id:r.namespace_id,simple:{limit:10000,period:60}}])),outboundService(){return new Response('disabled',{status:503});}
 }));
 const db=await mf.getD1Database('DB'),diagnostics=await mf.getD1Database('BETA_DB'),native=newDatabase();for(const f of ['012_phase6c_free_runtime.sql','013_phase6c_request_maintenance.sql','014_phase6c_virtual_history.sql'])native.exec(fs.readFileSync('schema/'+f,'utf8'));for(const row of native.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all())await db.prepare(row.sql).run();native.close();for(const sql of fs.readFileSync('schema/beta_diagnostics.sql','utf8').replace(/--[^\n]*/g,'').split(';').filter(x=>x.trim()))await diagnostics.prepare(sql).run();
 const key=await ecdsa(),other=await ecdsa(),now=Date.now();for(const [id,k] of [[DEVICE_A,key],[DEVICE_B,other]])await db.prepare('INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?1,?2,?3,?4)').bind(id,'Synthetic ACK fixture',k.spki,now).run();
 async function fault(value){await mf.dispatchFetch('http://localhost/__synthetic_fault',{method:'POST',body:value});}
 async function signed(body,id=DEVICE_A,k=key,suffix='/location'){const sig=Buffer.from(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},k.pair.privateKey,body)).toString('base64');return mf.dispatchFetch('http://localhost/api/device/'+id+suffix,{method:'POST',headers:{'X-Brick-Signature':sig},body});}
 const count=async(id=DEVICE_A)=>(await db.prepare('SELECT COUNT(*) n FROM dev_location_history WHERE device_id=?1').bind(id).first()).n;
 const one=livePacketBytes(now,1);await fault('first');assert.equal((await signed(one)).status,503);assert.equal(await count(),0);assert.equal((await db.prepare('SELECT COUNT(*) n FROM device_events WHERE device_id=?1').bind(DEVICE_A).first()).n,1);console.log('PASS no ACK when direct D1 history persistence fails after durable device-event insert');
 await fault('');const response=await signed(one);assert.equal(response.status,200);assert.equal((await response.json()).ack,1);assert.equal(await count(),1);
 const before=(await db.prepare('SELECT trusted_packet_json,raw_packet_json,created_at FROM dev_location_history WHERE device_id=?1 AND sequence=1').bind(DEVICE_A).first());
 // Simulated response loss: ignore one successful result and retry exact signed bytes.
 assert.equal((await signed(one)).status,200);assert.equal(await count(),1);assert.deepEqual(await db.prepare('SELECT trusted_packet_json,raw_packet_json,created_at FROM dev_location_history WHERE device_id=?1 AND sequence=1').bind(DEVICE_A).first(),before);console.log('PASS retry/response loss converges on exactly one immutable history row');
 const batch=new Uint8Array(3+20*90);new DataView(batch.buffer).setUint8(0,1);new DataView(batch.buffer).setUint16(1,20);for(let i=0;i<20;i++)batch.set(new Uint8Array(livePacketBytes(now+i,100+i)),3+i*90);
 await fault('second');const interruptedResponse=await signed(batch.buffer,DEVICE_A,key,'/location/batch');assert.equal(interruptedResponse.status,503,await interruptedResponse.text());assert.equal(await count(),11);await fault('');const retried=await signed(batch.buffer,DEVICE_A,key,'/location/batch');assert.equal(retried.status,200);assert.equal((await retried.json()).count,20);assert.equal(await count(),21);console.log('PASS interrupted second D1 history group has no range ACK; full retry fills holes without duplicating committed rows');
 assert.equal((await signed(livePacketBytes(now,999),DEVICE_A,other)).status,401);assert.equal(await count(),21);
 await fault('revoke');assert.equal((await signed(livePacketBytes(now,44),DEVICE_B,other)).status,401);assert.equal(await count(DEVICE_B),0,'revoked device must not add D1 history between prior liveness check and direct append');console.log('PASS transactional revoke fence prevents direct-history write in the exact revocation interleaving');
 console.log('LIMIT local signed Worker/native D1/DO fault injection; no cloud timing, physical phone retry or latency qualification');
}finally{if(mf)await mf.dispose();fs.rmSync(dir,{recursive:true,force:true});}
