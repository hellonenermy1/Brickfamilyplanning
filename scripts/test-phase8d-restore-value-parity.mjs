// Actual native D1 restore postflight; isolated synthetic stores and controlled drift only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {newCardfreeDatabase,ecdsa,DEVICE_A as A,DEVICE_B as B} from './phase8d-native-fixture.mjs';
import {seedRecoveryRelations,assertRecoveryRelations,seedRecoveryActions,assertRetiredRecoveryActions} from './phase8d-recovery-relations-fixture.mjs';
const repo=process.cwd(),root=fs.mkdtempSync(path.join(os.tmpdir(),'brick-value-parity-'));
const source=newCardfreeDatabase(),ddl=source.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all().map(x=>x.sql);source.close();
const diagnostic=fs.readFileSync('schema/beta_diagnostics.sql','utf8').replace(/--[^\n]*/g,'').split(';').filter(x=>x.trim());
const baseline=process.argv.includes('--baseline-only'),oldSource=path.join(repo,'src','.brick-value-baseline-'+process.pid+'.ts');
let mf,db,diag,lib,snapshot,relations,actions,index=0,passed=0;
async function fresh(){if(mf)await mf.dispose();const name='case-'+index++;mf=new Miniflare(convertV4MiniflareOptions({name:'restore-value-parity',cf:false,modules:true,script:'export default{fetch(){return new Response("fixture");}}',compatibilityDate:'2026-10-29',d1Databases:['DB','BETA_DB'],resourcePersistencePath:path.join(root,name,'shared'),isolatedResourcePersistencePath:path.join(root,name,'isolated'),outboundService(){throw Error('network forbidden');}}));await mf.ready;db=await mf.getD1Database('DB');diag=await mf.getD1Database('BETA_DB');for(const sql of ddl)await db.prepare(sql).run();for(const sql of diagnostic)await diag.prepare(sql).run();return{DB:db,BETA_DB:diag,BRICK_RECOVERY_MODE:'isolated-restore'};}
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
function inject(env,mutation){let injected=false;const original=env.BETA_DB;return{...env,BETA_DB:{prepare:original.prepare.bind(original),async batch(statements){const result=await original.batch(statements);if(!injected&&(await diag.prepare('SELECT COUNT(*) n FROM beta_records').first()).n===130){injected=true;await mutation();}return result;}}};}
const cases=[
 ['device name',()=>db.prepare("UPDATE devices SET name='changed' WHERE id=?").bind(A).run()],
 ['place configuration',()=>db.prepare('UPDATE geofences SET radius_m=99 WHERE device_id=?').bind(A).run()],
 ['valid-FK relationship rewiring',()=>db.prepare('UPDATE witness_authorizations SET enabled=0 WHERE device_id=?').bind(A).run()],
 ['composite evidence identity value',()=>db.prepare("UPDATE evidence_records SET independence_group='changed' WHERE device_id=?").bind(B).run()],
 ['same-length object bytes',()=>db.prepare("UPDATE dev_object_chunks SET body=? WHERE key='synthetic/object'").bind(new Uint8Array([5,4,3,2,1]).buffer).run()],
 ['retention timestamp',()=>db.prepare("UPDATE dev_object_store SET uploaded_at=1 WHERE key='synthetic/object'").run()],
 ['diagnostic JSON',()=>diag.prepare("UPDATE beta_latest SET payload='{}'").run()],
 ['last-page diagnostic value',()=>diag.prepare("UPDATE beta_records SET payload='changed' WHERE record_id=129").run()],
 ['retired command result',()=>db.prepare("UPDATE device_location_control SET result_reason='changed' WHERE device_id=?").bind(A).run()],
 ['completed command state',()=>db.prepare("UPDATE device_live_track_control SET result_reason='changed' WHERE device_id=?").bind(B).run()]
];
try{
 if(baseline)fs.writeFileSync(oldSource,execFileSync('git',['show','176e65f5676db0dbd539fdda771d4e156f82fbcc:src/cardfree-recovery.ts'],{encoding:'utf8'}));
 await build({entryPoints:[baseline?oldSource:'src/cardfree-recovery.ts'],outfile:path.join(root,'restore.mjs'),bundle:true,platform:'node',format:'esm'});
 lib=await import(pathToFileURL(path.join(root,'restore.mjs')).href);
 await fresh();const now=Date.now(),key=await ecdsa();
 for(const id of [A,B])await db.prepare("INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?,?,?,?)").bind(id,id===A?'original-a':'original-b',(id===A?key:await ecdsa()).spki,now-1000).run();
 relations=await seedRecoveryRelations(db,{a:A,b:B,now});actions=await seedRecoveryActions(db,{a:A,b:B,now});
 const bytes=new Uint8Array([1,2,3,4,5]),etag=createHash('sha256').update(bytes).digest('hex');
 await db.prepare("INSERT INTO dev_object_store(key,size,etag,uploaded_at) VALUES('synthetic/object',5,?,?)").bind(etag,now-500).run();
 await db.prepare("INSERT INTO dev_object_chunks VALUES('synthetic/object',0,?)").bind(bytes.buffer).run();
 await diag.prepare('INSERT INTO beta_latest VALUES(?,?,?)').bind(A,'{"original":true}',now).run();
 for(let i=0;i<130;i++)await diag.prepare('INSERT INTO beta_records VALUES(?,?,?,?,?)').bind(A,'synthetic-run',i,JSON.stringify({i,text:i<8?'x'.repeat(300000):'quoted " café',empty:null}),now-i).run();
 snapshot=await lib.exportCardfreeD1({DB:db,BETA_DB:diag},true);
 if(!baseline)await test('healthy populated full-column restore preserves values, BLOBs, relationships and permitted command retirement',async()=>{const env=await fresh(),start=Date.now();await lib.restoreCardfreeD1(env,snapshot.body,snapshot.sha256);await assertRecoveryRelations(db,relations);await assertRetiredRecoveryActions(db,actions,start);assert.equal((await diag.prepare('SELECT COUNT(*) n FROM beta_records').first()).n,130);assert.equal((await diag.prepare('SELECT payload FROM beta_records WHERE record_id=129').first()).payload,JSON.stringify({i:129,text:'quoted " café',empty:null}));assert.deepEqual(new Uint8Array((await db.prepare("SELECT body FROM dev_object_chunks").first()).body),bytes);});
 if(!baseline)await test('2.4MiB diagnostic data spans bounded postflight reads with at most64 rows and2MiB per data response',async()=>{const env=await fresh();let pages=0;const original=env.BETA_DB;function wrap(statement){return{bind(...args){return wrap(statement.bind(...args));},async all(){const result=await statement.all();pages++;assert(result.results.length<=64);assert(Buffer.byteLength(JSON.stringify(result.results))<=2*1024*1024);return result;}};}await lib.restoreCardfreeD1({...env,BETA_DB:{batch:original.batch.bind(original),prepare(sql){const statement=original.prepare(sql);return sql.startsWith('SELECT rowid __brick_restore_cursor,')?wrap(statement):statement;}}},snapshot.body,snapshot.sha256);assert(pages>=4);});
 for(const [name,mutation]of cases)await test((baseline?'baseline returns success despite ':'rejects ')+name+' drift with unchanged row counts and valid foreign keys',async()=>{const env=inject(await fresh(),mutation);if(baseline)await lib.restoreCardfreeD1(env,snapshot.body,snapshot.sha256);else{await assert.rejects(lib.restoreCardfreeD1(env,snapshot.body,snapshot.sha256),/value reconciliation/);await assert.rejects(lib.restoreCardfreeD1({DB:db,BETA_DB:diag,BRICK_RECOVERY_MODE:'isolated-restore'},snapshot.body,snapshot.sha256),/not empty/);}assert.equal((await db.prepare('SELECT COUNT(*) n FROM devices').first()).n,2);assert.equal((await diag.prepare('SELECT COUNT(*) n FROM beta_records').first()).n,130);assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);});
 console.log(JSON.stringify({suite:'restore-value-parity-native',baseline,passed,failed:0,scope:'actual native fresh D1 restore with controlled post-preflight value drift; no live cloud, writer fencing, custody, RTO/RPO or operational acceptance'}));
}finally{if(mf)await mf.dispose();fs.rmSync(oldSource,{force:true});fs.rmSync(root,{recursive:true,force:true});}
