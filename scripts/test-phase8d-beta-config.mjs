// Actual deployment validator/provisioner preflight with synthetic configs only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {validateBetaConfig as validate} from './beta-deployment-contract.mjs';
const template=JSON.parse(fs.readFileSync('wrangler.beta.template.jsonc','utf8'));
const expectedError='Refuse configuration outside isolated D1/card-free beta';
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
function rendered(){const c=structuredClone(template);c.vars.BETA_SOURCE_SHA='a'.repeat(40);c.vars.BRICK_MAP_SOURCE='https://build.protomaps.com/20261104.pmtiles';c.d1_databases[0].database_id='aaaaaaaa-1111-4111-8111-111111111111';c.d1_databases[1].database_id='bbbbbbbb-2222-4222-8222-222222222222';return c;}
function rejects(c,options){assert.throws(()=>validate(c,options),error=>error.message===expectedError);}
await test('checked-in template and synthetic rendered config remain accepted without mutation',()=>{for(const [c,options] of [[structuredClone(template),{}],[rendered(),{rendered:true}]]){const before=JSON.stringify(c);assert.equal(validate(c,options),true);assert.equal(JSON.stringify(c),before);}});
await test('binding, rate and object-key order do not affect identity checks',()=>{for(const [c,options] of [[structuredClone(template),{}],[rendered(),{rendered:true}]]){c.d1_databases.reverse();c.durable_objects.bindings.reverse();c.ratelimits.reverse();assert.equal(validate(Object.fromEntries(Object.entries(c).reverse()),options),true);}});
await test('distinct uppercase UUIDs remain valid',()=>{const c=rendered();c.d1_databases[0].database_id=c.d1_databases[0].database_id.toUpperCase();c.d1_databases[1].database_id=c.d1_databases[1].database_id.toUpperCase();assert.equal(validate(c,{rendered:true}),true);});
const mutations=[
 ['destructive class deletion',c=>c.migrations[1].deleted_classes=['BrickDevice']],
 ['class transfer',c=>c.migrations[1].transferred_classes=[{from:'BrickDevice',from_script:'other',to:'BetaScheduler'}]],
 ['class rename',c=>c.migrations[0].renamed_classes=[{from:'BrickDevice',to:'Other'}]],
 ['migration tag drift',c=>c.migrations[0].tag='unreviewed'],
 ['migration order drift',c=>c.migrations.reverse()],
 ['extra migration',c=>c.migrations.push({tag:'extra',deleted_classes:['BrickDevice']})],
 ['alternate route',c=>c.routes=['example.invalid/*']],
 ['nested environment with R2',c=>c.env={production:{r2_buckets:[{binding:'EXTRA',bucket_name:'synthetic'}]}}],
 ['extra KV binding',c=>c.kv_namespaces=[{binding:'EXTRA',id:'a'.repeat(32)}]],
 ['service binding',c=>c.services=[{binding:'EXTRA',service:'other'}]],
 ['R2 binding',c=>c.r2_buckets=[]],
 ['Queue binding',c=>c.queues={}],
 ['asset handler override',c=>c.assets.run_worker_first=false],
 ['asset path drift',c=>c.assets.directory='./other-public'],
 ['asset binding drift',c=>c.assets.binding='ASSETS'],
 ['observability enablement',c=>c.observability.enabled=true],
 ['observability logging override',c=>c.observability.logs={enabled:true}],
 ['runtime date drift',c=>c.compatibility_date='2020-01-01'],
 ['runtime flag drift',c=>c.compatibility_flags=['nodejs_compat']],
 ['workers.dev disabled',c=>c.workers_dev=false],
 ['schema URL drift',c=>c.$schema='https://example.invalid/schema.json'],
 ['extra var with secret-like lowercase name',c=>c.vars.debug_secret='synthetic-only'],
 ['local login mode drift',c=>c.vars.DEV_PARENT_AUTH_MODE='public'],
 ['unapproved cron',c=>c.triggers.crons=['* * * * *']],
 ['additional trigger option',c=>c.triggers.extra=true],
 ['remote DO script',c=>c.durable_objects.bindings[0].script_name='another-worker'],
 ['DO environment drift',c=>c.durable_objects.bindings[0].environment='production'],
 ['duplicate DO binding',c=>c.durable_objects.bindings[1]=structuredClone(c.durable_objects.bindings[0])],
 ['extra DO namespace option',c=>c.durable_objects.extra=true],
 ['duplicate D1 binding',c=>c.d1_databases[1]=structuredClone(c.d1_databases[0])],
 ['D1 preview alias',c=>c.d1_databases[0].preview_database_id='synthetic'],
 ['D1 remote flag override',c=>c.d1_databases[0].remote=true],
 ['database name drift',c=>c.d1_databases[0].database_name='brick-family-v1'],
 ['rate binding name drift',c=>c.ratelimits[0].name='SOMETHING_ELSE'],
 ['rate namespace swap',c=>[c.ratelimits[0].namespace_id,c.ratelimits[1].namespace_id]=[c.ratelimits[1].namespace_id,c.ratelimits[0].namespace_id]],
 ['login quota weakening',c=>c.ratelimits[8].simple.limit=999999],
 ['quota type drift',c=>c.ratelimits[0].simple.limit='120'],
 ['quota period drift',c=>c.ratelimits[0].simple.period=1],
 ['duplicate rate binding',c=>c.ratelimits[1].name=c.ratelimits[0].name],
 ['extra quota field',c=>c.ratelimits[0].simple.extra=true],
];
for(const [name,mutate] of mutations)await test(name+' refuses in template and rendered preflight',()=>{for(const [c,options] of [[structuredClone(template),{}],[rendered(),{rendered:true}]]){mutate(c);rejects(c,options);}});
await test('malformed UUID and non-string database IDs refuse',()=>{for(const id of ['-'.repeat(36),'a'.repeat(36),'aaaaaaaa1111-4111-8111-111111111111',null,42,{}]){const c=rendered();c.d1_databases[0].database_id=id;rejects(c,{rendered:true});}});
await test('case-insensitive database alias refuses even with bindings reversed',()=>{for(const reverse of [false,true]){const c=rendered();c.d1_databases[1].database_id=c.d1_databases[0].database_id.toUpperCase();if(reverse)c.d1_databases.reverse();rejects(c,{rendered:true});}});
await test('wrong template placeholders refuse before account selection',()=>{for(const field of ['BETA_SOURCE_SHA','BRICK_MAP_SOURCE']){const c=structuredClone(template);c.vars[field]='unreviewed';rejects(c);}const c=structuredClone(template);c.d1_databases[0].database_id='__BETA_D1_DATABASE_ID__';rejects(c);});
await test('rendered placeholders, invalid SHA and off-origin/query map URLs refuse',()=>{for(const [key,value] of [['BETA_SOURCE_SHA','__BETA_SOURCE_SHA__'],['BETA_SOURCE_SHA','A'.repeat(40)],['BRICK_MAP_SOURCE','__BRICK_MAP_SOURCE__'],['BRICK_MAP_SOURCE','https://example.invalid/20261104.pmtiles'],['BRICK_MAP_SOURCE','https://build.protomaps.com/20261104.pmtiles?x=1']]){const c=rendered();c.vars[key]=value;rejects(c,{rendered:true});}});
await test('malformed roots and missing/nonnormal nested structures refuse generically',()=>{for(const c of [null,[],{},'private-value',42])rejects(c);for(const key of ['migrations','d1_databases','ratelimits','durable_objects','vars','assets','triggers','observability'])for(const value of [null,{},[]]){const c=structuredClone(template);c[key]=value;rejects(c);}rejects(structuredClone(template),{rendered:'true'});});
await test('sparse migration class arrays cannot skip expected class validation',()=>{const c=structuredClone(template);c.migrations[0].new_sqlite_classes=Array(1);rejects(c);});
const root=fs.mkdtempSync(path.join(os.tmpdir(),'brick-config-preflight-')),setup=path.resolve('scripts/setup-beta-d1.mjs'),marker=path.join(root,'network-or-process'),preload=path.join(root,'guard.mjs');
try{
 fs.writeFileSync(preload,"import fs from 'node:fs';import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';const refuse=()=>{fs.appendFileSync(process.env.BRICK_TEST_PREFLIGHT_MARKER,'attempt');throw Error('unexpected external capability');};globalThis.fetch=refuse;cp.spawn=refuse;syncBuiltinESMExports();");
 function run(c){fs.writeFileSync(path.join(root,'wrangler.beta.template.jsonc'),JSON.stringify(c));const env={...process.env,GITHUB_REF_NAME:'beta/backend-portal',GITHUB_SHA:'a'.repeat(40),BRICK_TEST_PREFLIGHT_MARKER:marker};delete env.CLOUDFLARE_API_TOKEN;return spawnSync(process.execPath,['--import',preload,setup],{cwd:root,encoding:'utf8',timeout:4000,env});}
 for(const [name,mutate] of mutations.filter(([name])=>['destructive class deletion','class transfer','alternate route','nested environment with R2','login quota weakening','rate namespace swap'].includes(name)))await test('actual setup refuses '+name+' before token/network/process use',()=>{const c=structuredClone(template);mutate(c);const r=run(c);assert.equal(r.status,1,r.stderr);assert.ok(r.stderr.includes(expectedError));assert.equal(r.stdout,'');assert.equal(fs.existsSync(marker),false);assert.equal(fs.existsSync(path.join(root,'wrangler.beta.jsonc')),false);assert.equal(fs.existsSync(path.join(root,'beta-setup-state.json')),false);});
 await test('actual setup accepts existing template preflight then stops at missing credential gate',()=>{const r=run(template);assert.equal(r.status,1);assert.match(r.stderr,/CLOUDFLARE_API_TOKEN is required/);assert.equal(r.stderr.includes(expectedError),false);assert.equal(fs.existsSync(marker),false);});
}finally{fs.rmSync(root,{recursive:true,force:true});}
console.log(JSON.stringify({suite:'beta-config-isolation',passed,failed:0,scope:'actual validator and actual setup early refusal using synthetic configs and blocked capabilities; no Wrangler/provider/deployment/schema/APK/UI mutation or active configuration proof'}));
