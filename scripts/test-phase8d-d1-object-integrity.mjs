import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

const dir=fs.mkdtempSync(path.resolve('.brick-d1-integrity-'));
await build({entryPoints:[process.env.BRICK_D1_RUNTIME_SOURCE||'src/dev-free-runtime.ts'],outfile:path.join(dir,'storage.mjs'),bundle:true,format:'esm',platform:'node',target:'node24'});
const {D1ObjectBucket}=await import(pathToFileURL(path.join(dir,'storage.mjs')).href);
const mf=new Miniflare(convertV4MiniflareOptions({name:'d1-object-integrity',modules:true,script:'export default {fetch(){return new Response("synthetic");}}',compatibilityDate:'2026-10-29',d1Databases:['DB']}));
let failed=0,passed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}}
try{
 const db=await mf.getD1Database('DB');
 for(const file of ['012_phase6c_free_runtime.sql','014_phase6c_virtual_history.sql'])for(const sql of fs.readFileSync('schema/'+file,'utf8').replace(/--[^\n]*/g,'').split(';').filter(x=>x.trim()))await db.prepare(sql).run();
 const store=new D1ObjectBucket(db);
 await test('same-size concurrent replacement cannot combine old metadata with new bytes',async()=>{
  await store.put('race','OLD');let interleaved=false;
  const swap=async()=>{if(!interleaved){interleaved=true;await store.put('race','NEW');}};
  const racing={prepare(sql){const p=db.prepare(sql);return{bind(...args){const s=p.bind(...args);return new Proxy(s,{get(target,key){if(key==='first')return async(...a)=>{const r=await target.first(...a);if(sql.includes('FROM dev_object_store WHERE key='))await swap();return r;};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});}};},async batch(statements){const result=await db.batch(statements);await swap();return result;}};
  const object=await new D1ObjectBucket(racing).get('race');assert.equal(interleaved,true);
  const bytes=await object.arrayBuffer(),hash=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
  assert.equal(object.etag,hash,'returned ETag must authenticate returned complete bytes');
  assert.ok(['OLD','NEW'].includes(new TextDecoder().decode(bytes)));
 });
 await test('same-length stored chunk corruption is refused',async()=>{await store.put('corrupt','good');await db.prepare('UPDATE dev_object_chunks SET body=?1 WHERE key=?2').bind(new TextEncoder().encode('evil'),'corrupt').run();await assert.rejects(()=>store.get('corrupt'),/integrity|digest|hash/i);});
 await test('missing and noncontiguous chunk indices are refused',async()=>{await store.put('indices',new Uint8Array(900001));await db.prepare('UPDATE dev_object_chunks SET chunk_index=9 WHERE key=?1 AND chunk_index=1').bind('indices').run();await assert.rejects(()=>store.get('indices'),/chunk|incomplete/i);});
 await test('conditional create cannot overwrite an existing object',async()=>{await store.put('create','original');assert.equal(await store.put('create','replacement',{onlyIf:{etagDoesNotMatch:'*'}}),null);assert.equal(await(await store.get('create')).text(),'original');});
 await test('stale conditional update preserves original bytes and metadata',async()=>{const old=await store.put('cas','version1',{customMetadata:{marker:'old'}});await store.put('cas','version2',{customMetadata:{marker:'new'}});assert.equal(await store.put('cas','version3',{onlyIf:{etagMatches:old.etag}}),null);const current=await store.get('cas');assert.equal(await current.text(),'version2');assert.equal(current.customMetadata.marker,'new');});
 await test('two concurrent same-ETag writers have exactly one winner',async()=>{const old=await store.put('two','base');const results=await Promise.all([store.put('two','winner-A',{onlyIf:{etagMatches:old.etag}}),store.put('two','winner-B',{onlyIf:{etagMatches:old.etag}})]);assert.equal(results.filter(Boolean).length,1);assert.equal(results.filter(x=>x===null).length,1);});
 await test('conditional writes do not swallow unrelated database failures',async()=>{const broken={prepare:db.prepare.bind(db),batch:async()=>{throw Error('synthetic D1 unavailable');}};await assert.rejects(()=>new D1ObjectBucket(broken).put('error','x',{onlyIf:{etagDoesNotMatch:'*'}}),/synthetic D1 unavailable/);});
 await test('Headers create-only and quoted ETag conditions are honored',async()=>{const first=await store.put('headers','first',{onlyIf:new Headers({'If-None-Match':'*'})});assert.ok(first);assert.equal(await store.put('headers','second',{onlyIf:new Headers({'If-None-Match':'*'})}),null);assert.ok(await store.put('headers','third',{onlyIf:new Headers({'If-Match':'"'+first.etag+'"'})}));assert.equal(await store.put('absent','x',{onlyIf:{etagMatches:'*'}}),null);assert.equal(await store.get('absent'),null);});
 await test('unknown or empty condition forms are rejected before any overwrite',async()=>{await store.put('unsupported','preserved');for(const onlyIf of [{},{uploadedBefore:new Date()},new Headers({'If-Unmodified-Since':'yesterday'}),{etagMatches:'"'}])await assert.rejects(()=>store.put('unsupported','changed',{onlyIf}),/condition/);assert.equal(await(await store.get('unsupported')).text(),'preserved');});
 await test('empty objects retain correct hash and no chunks',async()=>{await store.put('empty',new Uint8Array());assert.equal((await store.get('empty')).size,0);assert.equal((await db.prepare('SELECT COUNT(*) n FROM dev_object_chunks WHERE key=?1').bind('empty').first()).n,0);});
 await test('invalid object size refuses allocation',async()=>{await store.put('size','valid');await db.prepare('UPDATE dev_object_store SET size=999999999999 WHERE key=?1').bind('size').run();await assert.rejects(()=>store.get('size'),/metadata/);});
 await test('multi-chunk bytes, metadata and boundary range survive readback',async()=>{const bytes=Uint8Array.from({length:1800013},(_,i)=>i%251);await store.put('roundtrip',bytes,{httpMetadata:{contentType:'application/octet-stream'},customMetadata:{marker:'synthetic'}});const item=await store.get('roundtrip');assert.deepEqual(new Uint8Array(await item.arrayBuffer()),bytes);assert.equal(item.customMetadata.marker,'synthetic');assert.deepEqual(new Uint8Array(await(await store.get('roundtrip',{range:{offset:899995,length:20}})).arrayBuffer()),bytes.slice(899995,900015));});
 console.log(JSON.stringify({suite:'phase8d-d1-object-integrity',passed,failed,scope:'actual local Miniflare D1; synthetic objects only'}));
 if(failed)process.exitCode=1;
}finally{await mf.dispose();fs.rmSync(dir,{recursive:true,force:true});}
