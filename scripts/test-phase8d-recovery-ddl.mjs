// Disposable native D1 schema-contract faults. No provider operations or data.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {newCardfreeDatabase,ecdsa,DEVICE_A as A,DEVICE_B as B} from './phase8d-native-fixture.mjs';
const repo=process.cwd(),root=fs.mkdtempSync(path.join(os.tmpdir(),'brick-recovery-ddl-')),baseline=process.argv.includes('--baseline-only'),old=path.join(repo,'src','.brick-ddl-baseline-'+process.pid+'.ts');
const primary=newCardfreeDatabase(),ddl=primary.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND substr(lower(name),1,7)<>'sqlite_' ORDER BY rowid").all();primary.close();
const diagnostic=fs.readFileSync('schema/beta_diagnostics.sql','utf8').replace(/--[^\n]*/g,'').split(';').filter(x=>x.trim());
let mf,db,diag,lib,snapshot,key,index=0,passed=0;
async function fresh(){if(mf)await mf.dispose();const name='case-'+index++;mf=new Miniflare(convertV4MiniflareOptions({name:'recovery-ddl',cf:false,modules:true,script:'export default{fetch(){return new Response("fixture");}}',compatibilityDate:'2026-10-29',d1Databases:['DB','BETA_DB'],resourcePersistencePath:path.join(root,name,'shared'),isolatedResourcePersistencePath:path.join(root,name,'isolated'),outboundService(){throw Error('network forbidden');}}));await mf.ready;db=await mf.getD1Database('DB');diag=await mf.getD1Database('BETA_DB');for(const {sql}of ddl)await db.prepare(sql).run();for(const sql of diagnostic)await diag.prepare(sql).run();return{DB:db,BETA_DB:diag,BRICK_RECOVERY_MODE:'isolated-restore'};}
async function seed(){key=await ecdsa();await db.prepare("INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?,'original',?,1)").bind(A,key.spki).run();await db.prepare("INSERT INTO geofences VALUES('place',?,'place',1,2,75,1,1)").bind(A).run();await diag.prepare('INSERT INTO beta_latest VALUES(?,?,1)').bind(A,'{"original":true}').run();}
async function table(name,change){const definition=ddl.find(r=>r.type==='table'&&r.name===name);await db.prepare('DROP TABLE '+name).run();await db.prepare(change(definition.sql)).run();for(const row of ddl.filter(r=>r.type!=='table'&&r.tbl_name===name))await db.prepare(row.sql).run();}
async function indexChange(name,change){const definition=ddl.find(r=>r.type==='index'&&r.name===name);await db.prepare('DROP INDEX '+name).run();if(change)await db.prepare(change(definition.sql)).run();}
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
async function refused(env){let batches=0;const wrap=d=>({prepare:d.prepare.bind(d),batch:s=>{batches++;return d.batch(s);}});await assert.rejects(lib.restoreCardfreeD1({...env,DB:wrap(db),BETA_DB:wrap(diag)},snapshot.body,snapshot.sha256),/recovery schema changed|unclassified recovery schema/);assert.equal(batches,0);assert.equal((await db.prepare('SELECT COUNT(*) n FROM devices').first()).n,0);assert.equal((await diag.prepare('SELECT COUNT(*) n FROM beta_latest').first()).n,0);}
async function page(){const now=Date.now(),f={sourceSha:'a'.repeat(40),resourceSetSha256:'b'.repeat(64),captureId:'c'.repeat(32),generation:'d'.repeat(32),pausedAt:now};return lib.readCardfreeCapturePage({DB:db,BETA_DB:diag},{store:'primary',table:'devices',after:null,limit:64,fence:f},{async assertHeld(){return{...f,state:'DRAINED',activeWriters:0,expiresAt:now+300000};}});}
const ordinaryIndex=ddl.find(r=>r.type==='index'&&!r.sql.startsWith('CREATE UNIQUE INDEX')).name;
const faults=[
 ['missing unique device-key index',()=>indexChange('idx_devices_public_key_spki_unique')],
 ['unique index changed to nonunique',()=>indexChange('idx_devices_public_key_spki_unique',s=>s.replace('CREATE UNIQUE INDEX','CREATE INDEX'))],
 ['wrong indexed key',()=>indexChange('idx_devices_public_key_spki_unique',s=>s.replace('(public_key_spki_b64)','(name)'))],
 ['partial unique constraint',()=>indexChange('idx_devices_public_key_spki_unique',s=>s+' WHERE revoked_at IS NULL')],
 ['index collation drift',()=>indexChange('idx_devices_public_key_spki_unique',s=>s.replace('(public_key_spki_b64)','(public_key_spki_b64 COLLATE NOCASE)'))],
 ['missing reviewed ordinary index',()=>indexChange(ordinaryIndex)],
 ['unexpected unique index',()=>db.prepare('CREATE UNIQUE INDEX unexpected_ddl ON devices(name)').run()],
 ['unexpected ordinary index',()=>db.prepare('CREATE INDEX unexpected_ddl ON devices(name)').run()],
 ['unexpected expression index',()=>db.prepare('CREATE INDEX unexpected_ddl ON devices(length(name))').run()],
 ['weakened CHECK',()=>table('geofences',s=>s.replace('radius_m >= 25','radius_m >= 0'))],
 ['stricter CHECK',()=>table('geofences',s=>s.replace('radius_m >= 25','radius_m >= 100'))],
 ['table-key collation drift',()=>table('geofences',s=>s.replace('id TEXT PRIMARY KEY','id TEXT PRIMARY KEY COLLATE NOCASE'))],
 ['primary conflict policy drift',()=>table('geofences',s=>s.replace('id TEXT PRIMARY KEY','id TEXT PRIMARY KEY ON CONFLICT REPLACE'))],
 ['deferred relationship policy drift',()=>table('geofences',s=>s.replace('REFERENCES devices(id)','REFERENCES devices(id) DEFERRABLE INITIALLY DEFERRED'))],
 ['WITHOUT ROWID target',()=>table('geofences',s=>s+' WITHOUT ROWID')],
 ['STRICT table option drift',()=>table('geofences',s=>s+' STRICT')],
 ['unexpected diagnostic CHECK',async()=>{await diag.prepare('DROP TABLE beta_latest').run();await diag.prepare('CREATE TABLE beta_latest(device_id TEXT PRIMARY KEY,payload TEXT NOT NULL CHECK(json_valid(payload)),updated_at INTEGER NOT NULL)').run();}],
 ['diagnostic retention index drift',async()=>{await diag.prepare('DROP INDEX beta_records_retention').run();await diag.prepare('CREATE INDEX beta_records_retention ON beta_records(record_id)').run();}],
 ['sqlite wildcard-prefix shadow table',()=>db.prepare('CREATE TABLE sqliteXshadow(value TEXT)').run()]
];
try{
 if(baseline)fs.writeFileSync(old,execFileSync('git',['show','591424bb59e5f7d5e01fc2b78d8dcd28ea47639b:src/cardfree-recovery.ts'],{encoding:'utf8'}));
 await build({stdin:{contents:"export * from './src/"+(baseline?path.basename(old):'cardfree-recovery.ts')+"';export * from './src/cardfree-capture';"+(baseline?'':"export * from './src/cardfree-recovery-ddl';"),resolveDir:repo},outfile:path.join(root,'lib.mjs'),bundle:true,platform:'node',format:'esm'});lib=await import(pathToFileURL(path.join(root,'lib.mjs')).href);
 await fresh();await seed();snapshot=await lib.exportCardfreeD1({DB:db,BETA_DB:diag},true);
 if(baseline){
  let env=await fresh();await faults[0][1]();await lib.restoreCardfreeD1(env,snapshot.body,snapshot.sha256);await db.prepare("INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?,'duplicate key',?,1)").bind(B,key.spki).run();console.log('BASELINE restore accepted missing unique key index; restored identity key could be reused by another device');
  env=await fresh();await faults[9][1]();await lib.restoreCardfreeD1(env,snapshot.body,snapshot.sha256);await db.prepare("INSERT INTO geofences VALUES('invalid',?,'invalid',1,2,1,1,1)").bind(A).run();console.log('BASELINE restore accepted weakened CHECK; target subsequently accepted radius1 where reviewed minimum is25');
  await fresh();await seed();await faults.at(-1)[1]();await db.prepare("INSERT INTO sqliteXshadow VALUES('synthetic omitted state')").run();await lib.exportCardfreeD1({DB:db,BETA_DB:diag},true);console.log('BASELINE export ignored populated sqliteXshadow because LIKE sqlite_% treated underscore as wildcard');
 }else{
  await test('reviewed complete schema restores and enforces unique keys and CHECK constraints',async()=>{const env=await fresh();await lib.restoreCardfreeD1(env,snapshot.body,snapshot.sha256);await assert.rejects(db.prepare("INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?,'duplicate key',?,1)").bind(B,key.spki).run());await assert.rejects(db.prepare("INSERT INTO geofences VALUES('invalid',?,'invalid',1,2,1,1,1)").bind(A).run());});
  for(const [name,change]of faults)await test(name+' refuses before either store is written',async()=>{const env=await fresh();await change();await refused(env);});
  for(const pos of [0,9,faults.length-1])await test('source '+faults[pos][0]+' cannot enter full or bounded capture',async()=>{await fresh();await seed();await faults[pos][1]();await assert.rejects(lib.exportCardfreeD1({DB:db,BETA_DB:diag},true),/recovery schema changed|unclassified recovery schema/);await assert.rejects(page(),/recovery schema changed|unclassified recovery schema/);});
  await test('index drift after preflight cannot return successful restore',async()=>{const env=await fresh(),original=env.DB;let changed=false;const wrapped={prepare:original.prepare.bind(original),async batch(s){const result=await original.batch(s);if(!changed){changed=true;await faults[0][1]();}return result;}};await assert.rejects(lib.restoreCardfreeD1({...env,DB:wrapped},snapshot.body,snapshot.sha256),/recovery schema changed/);assert(changed);assert.equal((await db.prepare('SELECT COUNT(*) n FROM devices').first()).n,1);});
  await test('checked-in review manifest matches both pinned definition digests',async()=>{const policy=JSON.parse(fs.readFileSync('audit/phase8d/PHASE8D_GROUP1_REVIEWED_DDL_POLICY.json','utf8'));assert.equal(await lib.recoverySchemaDigest(policy.primary),policy.digests.primary);assert.equal(await lib.recoverySchemaDigest(policy.diagnostics),policy.digests.diagnostics);assert.equal(policy.primary.length,108);assert.equal(policy.diagnostics.length,9);assert.equal(policy.independentReviewer,null);assert.equal(policy.productionSchemaObserved,false);});
  const canonical=lib.canonicalRecoverySql;
  await test('token identity ignores whitespace and comments outside quoted values',()=>assert.deepEqual(canonical("CREATE TABLE x(a TEXT DEFAULT 'A B')"),canonical(" create /* note */ table x ( a text -- note\n DEFAULT 'A B' ) ")));
  await test('Unicode spacing is preserved rather than treated as SQLite ASCII whitespace',()=>assert.notDeepEqual(canonical('SELECT 1'),canonical('SELECT\u00a01')));
  await test('quoted literal whitespace and letter case remain significant',()=>{assert.notDeepEqual(canonical("SELECT 'A B'"),canonical("SELECT 'AB'"));assert.notDeepEqual(canonical("SELECT 'YES'"),canonical("SELECT 'yes'"));});
  await test('comment markers and escaped quotes inside quoted tokens are preserved',()=>{assert(canonical("SELECT 'a--b/*c*/''d'").includes("'a--b/*c*/''d'"));assert(canonical('SELECT "a""b"').includes('"a""b"'));});
  await test('unterminated quotes comments and excessive definition size refuse',()=>{for(const sql of ["SELECT 'oops",'CREATE /* oops','x'.repeat(65537)])assert.throws(()=>canonical(sql));});
  console.log(JSON.stringify({suite:'recovery-reviewed-ddl-native',passed,failed:0,scope:'native reviewed SQL-token definition identity, indexes, constraints and capture/restore only; not general SQL equivalence, cloud schema, installed quiescence/custody or operational acceptance'}));
 }
}finally{fs.rmSync(old,{force:true});if(mf)await mf.dispose();fs.rmSync(root,{recursive:true,force:true});}
