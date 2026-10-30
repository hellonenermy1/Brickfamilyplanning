import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import readline from 'node:readline';

const API = 'https://api.cloudflare.com/client/v4';
const D1_NAME = 'brick-family-v1';
const R2_NAME = 'brick-family-v1-history';
const MAPS_NAME = 'brick-family-v1-maps';
const QUEUE = 'brick-family-v1-events';
const DLQ = 'brick-family-v1-dlq';

function ask(q) { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); return new Promise(resolve => rl.question(q, a => { rl.close(); resolve(a.trim()); })); }
function askHidden(q) { if (!process.stdin.isTTY) return ask(q); process.stdout.write(q); process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8'); return new Promise((resolve,reject)=>{ let value=''; const onData=ch=>{ if(ch==='\u0003'){process.stdin.setRawMode(false);process.stdin.pause();reject(new Error('Cancelled'));return} if(ch==='\r'||ch==='\n'){process.stdin.off('data',onData);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');resolve(value);return} if(ch==='\u007f'){value=value.slice(0,-1);return} value+=ch }; process.stdin.on('data',onData) }) }
let token = process.env.CLOUDFLARE_API_TOKEN || await askHidden('Cloudflare API token (hidden): ');
if (!token) throw new Error('Cloudflare API token is required.');
async function cf(path, init={}) { const r=await fetch(API+path,{...init,headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...(init.headers||{})}}); const j=await r.json().catch(()=>({})); if(!r.ok||j.success===false) throw new Error(`Cloudflare API ${r.status}: ${JSON.stringify(j.errors||j)}`); return j.result }
async function chooseAccount(){ if(process.env.CLOUDFLARE_ACCOUNT_ID)return process.env.CLOUDFLARE_ACCOUNT_ID; const accounts=await cf('/accounts?per_page=50'); if(!accounts.length)throw new Error('No Cloudflare account visible to this API token.'); if(accounts.length===1)return accounts[0].id; console.log('\nCloudflare accounts:'); accounts.forEach((a,i)=>console.log(`  ${i+1}. ${a.name} (${a.id})`)); const n=Number(await ask('Choose account number: ')); if(!Number.isInteger(n)||n<1||n>accounts.length)throw new Error('Invalid account selection.'); return accounts[n-1].id }
const accountId=await chooseAccount(); process.env.CLOUDFLARE_API_TOKEN=token; process.env.CLOUDFLARE_ACCOUNT_ID=accountId;
async function ensureD1(){ const list=await cf(`/accounts/${accountId}/d1/database?per_page=100`); let db=list.find(x=>x.name===D1_NAME); if(!db)db=await cf(`/accounts/${accountId}/d1/database`,{method:'POST',body:JSON.stringify({name:D1_NAME,primary_location_hint:'apac'})}); return db.uuid }
async function ensureR2Bucket(name){ try{await cf(`/accounts/${accountId}/r2/buckets/${name}`)}catch{await cf(`/accounts/${accountId}/r2/buckets`,{method:'POST',body:JSON.stringify({name,locationHint:'apac',storageClass:'Standard'})})} }
async function ensureR2Lifecycle(){
  const day=86400;
  await cf(`/accounts/${accountId}/r2/buckets/${R2_NAME}/lifecycle`,{method:'PUT',body:JSON.stringify({rules:[
    {id:'brick-raw-history-30d',enabled:true,conditions:{prefix:'history/raw/'},deleteObjectsTransition:{condition:{type:'Age',maxAge:30*day}}},
    {id:'brick-trusted-history-90d',enabled:true,conditions:{prefix:'history/trusted/'},deleteObjectsTransition:{condition:{type:'Age',maxAge:90*day}}},
    {id:'brick-abort-multipart-7d',enabled:true,conditions:{prefix:''},abortMultipartUploadsTransition:{condition:{type:'Age',maxAge:7*day}}}
  ]})});
}
async function ensureQueue(name){ const list=await cf(`/accounts/${accountId}/queues?per_page=100`); if(!list.some(x=>x.queue_name===name))await cf(`/accounts/${accountId}/queues`,{method:'POST',body:JSON.stringify({queue_name:name})}) }
function run(cmd,args,{capture=false}={}){return new Promise((resolve,reject)=>{const p=spawn(cmd,args,{shell:process.platform==='win32',env:{...process.env},stdio:capture?['inherit','pipe','pipe']:'inherit'});let out='',err='';if(capture){p.stdout.on('data',d=>{out+=d;process.stdout.write(d)});p.stderr.on('data',d=>{err+=d;process.stderr.write(d)})}p.on('exit',code=>code===0?resolve(out+err):reject(new Error(`${cmd} exited ${code}`)))})}
async function ensureCloudflareIdp(){const idps=await cf(`/accounts/${accountId}/access/identity_providers`);if(idps.some(x=>x.type==='cloudflare'))return;await cf(`/accounts/${accountId}/access/identity_providers`,{method:'POST',body:JSON.stringify({name:'Cloudflare',type:'cloudflare',config:{restrict_to_account_members:true}})})}
async function ensureAccess(workerHost){await ensureCloudflareIdp();const apps=await cf(`/accounts/${accountId}/access/apps?per_page=100`);if(apps.some(a=>a.name==='Brick Parent Dashboard'))return;await cf(`/accounts/${accountId}/access/apps`,{method:'POST',body:JSON.stringify({type:'self_hosted',name:'Brick Parent Dashboard',session_duration:'24h',destinations:[{type:'public',uri:`${workerHost}/parent*`}],policies:[{name:'Brick parents — Cloudflare account members',decision:'allow',include:[{cloudflare_account_member:{account_id:accountId}}]}]})})}
async function d1Query(d1Id, sql, params=[]){return cf(`/accounts/${accountId}/d1/database/${d1Id}/query`,{method:'POST',body:JSON.stringify({sql,params})})}
async function ensureColumns(d1Id,table,columns){const result=await d1Query(d1Id,`PRAGMA table_info(${table})`);const rows=result?.[0]?.results||[];const existing=new Set(rows.map(r=>r.name));for(const [name,type] of columns){if(!existing.has(name))await d1Query(d1Id,`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`)}}
async function ensurePhase2Columns(d1Id){await ensureColumns(d1Id,'devices',[["last_health_at","INTEGER"],["health_status","TEXT NOT NULL DEFAULT 'unknown'"],["recovery_count","INTEGER NOT NULL DEFAULT 0"],["pending_records","INTEGER NOT NULL DEFAULT 0"],["app_version","TEXT"]])}
async function ensurePhase4Columns(d1Id){
  const tables=await d1Query(d1Id,"SELECT name FROM sqlite_master WHERE type='table'"); const names=new Set((tables?.[0]?.results||[]).map(r=>r.name));
  if(names.has('geofence_state')) await ensureColumns(d1Id,'geofence_state',[["last_epoch","INTEGER NOT NULL DEFAULT 0"],["last_sequence","INTEGER NOT NULL DEFAULT 0"]]);
  if(names.has('trips')) await ensureColumns(d1Id,'trips',[
    ["destination_radius_m","REAL NOT NULL DEFAULT 120"],["arrival_candidate_since","INTEGER"],["arrival_candidate_count","INTEGER NOT NULL DEFAULT 0"],["last_alert_at","INTEGER"],
    ["stationary_since","INTEGER"],["last_stop_alert_at","INTEGER"],["last_eval_epoch","INTEGER NOT NULL DEFAULT 0"],["last_eval_sequence","INTEGER NOT NULL DEFAULT 0"],
    ["last_distance_to_destination_m","REAL"],["last_location_at","INTEGER"]
  ]);
}

console.log('\n[1/12] Creating/reusing Cloudflare resources…'); const d1Id=await ensureD1(); await ensureR2Bucket(R2_NAME); await ensureR2Bucket(MAPS_NAME); await ensureQueue(QUEUE); await ensureQueue(DLQ);
console.log('[2/12] Applying R2 retention rules…'); await ensureR2Lifecycle();
console.log('[3/12] Generating Wrangler configuration…'); const template=await fs.readFile('wrangler.template.jsonc','utf8'); await fs.writeFile('wrangler.jsonc',template.replace('__D1_DATABASE_ID__',d1Id));
console.log('[4/12] Installing Node dependencies…'); await run(process.platform==='win32'?'npm.cmd':'npm',['install']);
console.log('[5/12] Building self-hosted parent map assets…'); await run(process.platform==='win32'?'npm.cmd':'npm',['run','build:parent-assets']);
console.log('[6/12] Type-checking Worker…'); await run(process.platform==='win32'?'npm.cmd':'npm',['run','typecheck']);
console.log('[7/12] Applying base D1 schema…'); await run(process.platform==='win32'?'npx.cmd':'npx',['wrangler','d1','execute',D1_NAME,'--remote','--file','schema/001_init.sql','--yes','--config','wrangler.jsonc']);
console.log('[8/12] Applying Phase 2 health migration…'); await ensurePhase2Columns(d1Id); await run(process.platform==='win32'?'npx.cmd':'npx',['wrangler','d1','execute',D1_NAME,'--remote','--file','schema/002_phase2_health.sql','--yes','--config','wrangler.jsonc']);
console.log('[9/12] Applying Phase 4 safety/history schema…'); await ensurePhase4Columns(d1Id); await run(process.platform==='win32'?'npx.cmd':'npx',['wrangler','d1','execute',D1_NAME,'--remote','--file','schema/003_phase4_safety.sql','--yes','--config','wrangler.jsonc']); await ensurePhase4Columns(d1Id);
console.log('[10/12] Applying Phase 5 operations schema…'); await run(process.platform==='win32'?'npx.cmd':'npx',['wrangler','d1','execute',D1_NAME,'--remote','--file','schema/004_phase5_operations.sql','--yes','--config','wrangler.jsonc']);
console.log('[11/12] Deploying Worker + same-origin browser assets…'); const output=await run(process.platform==='win32'?'npx.cmd':'npx',['wrangler','deploy','--config','wrangler.jsonc'],{capture:true}); const match=output.match(/https:\/\/([a-zA-Z0-9.-]+\.workers\.dev)/); if(!match)throw new Error('Worker deployed, but its workers.dev hostname could not be detected from Wrangler output. Open Workers & Pages and note the production URL.'); const workerHost=match[1];
console.log('[12/12] Protecting /parent with Cloudflare Access…'); await ensureAccess(workerHost);
await fs.writeFile('setup-state.json',JSON.stringify({phase:5,phaseSlice:'5B',accountId,workerHost,d1Id,resources:{D1_NAME,R2_NAME,MAPS_NAME,QUEUE,DLQ},retention:{rawHistoryDays:30,trustedHistoryDays:90,defaultSafetyEventDays:180,healthSampleDays:35,healthIncidentDays:365},watchdog:{intervalMinutes:1,persistentAlertSeconds:60,offlineAfterSeconds:90},privateMap:{bucket:MAPS_NAME,key:'basemap/singapore.pmtiles',installed:false},configuredAt:new Date().toISOString()},null,2));
console.log(`\nBrick Phase 5B Cloudflare setup complete.\nParent dashboard: https://${workerHost}/parent\nChild API base:     https://${workerHost}\nPrivate map bucket: ${MAPS_NAME}\n\nRun npm run map:install once to extract and upload the Singapore OSM-derived basemap. Until then Brick fails closed instead of using a third-party live map.\n\nThe API token was not written to disk by this installer.`);
