import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import readline from 'node:readline';

const API = 'https://api.cloudflare.com/client/v4';
const D1_NAME = 'brick-family-v1';
const R2_NAME = 'brick-family-v1-history';
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
async function ensureR2(){ try{await cf(`/accounts/${accountId}/r2/buckets/${R2_NAME}`)}catch{await cf(`/accounts/${accountId}/r2/buckets`,{method:'POST',body:JSON.stringify({name:R2_NAME,locationHint:'apac',storageClass:'Standard'})})} }
async function ensureQueue(name){ const list=await cf(`/accounts/${accountId}/queues?per_page=100`); if(!list.some(x=>x.queue_name===name))await cf(`/accounts/${accountId}/queues`,{method:'POST',body:JSON.stringify({queue_name:name})}) }
function run(cmd,args,{capture=false}={}){return new Promise((resolve,reject)=>{const p=spawn(cmd,args,{shell:process.platform==='win32',env:{...process.env},stdio:capture?['inherit','pipe','pipe']:'inherit'});let out='',err='';if(capture){p.stdout.on('data',d=>{out+=d;process.stdout.write(d)});p.stderr.on('data',d=>{err+=d;process.stderr.write(d)})}p.on('exit',code=>code===0?resolve(out+err):reject(new Error(`${cmd} exited ${code}`)))})}
async function ensureCloudflareIdp(){const idps=await cf(`/accounts/${accountId}/access/identity_providers`);if(idps.some(x=>x.type==='cloudflare'))return;await cf(`/accounts/${accountId}/access/identity_providers`,{method:'POST',body:JSON.stringify({name:'Cloudflare',type:'cloudflare',config:{restrict_to_account_members:true}})})}
async function ensureAccess(workerHost){await ensureCloudflareIdp();const apps=await cf(`/accounts/${accountId}/access/apps?per_page=100`);if(apps.some(a=>a.name==='Brick Parent Dashboard'))return;await cf(`/accounts/${accountId}/access/apps`,{method:'POST',body:JSON.stringify({type:'self_hosted',name:'Brick Parent Dashboard',session_duration:'24h',destinations:[{type:'public',uri:`${workerHost}/parent*`}],policies:[{name:'Brick parents — Cloudflare account members',decision:'allow',include:[{cloudflare_account_member:{account_id:accountId}}]}]})})}
console.log('\n[1/7] Creating/reusing Cloudflare resources…'); const d1Id=await ensureD1(); await ensureR2(); await ensureQueue(QUEUE); await ensureQueue(DLQ);
console.log('[2/7] Generating Wrangler configuration…'); const template=await fs.readFile('wrangler.template.jsonc','utf8'); await fs.writeFile('wrangler.jsonc',template.replace('__D1_DATABASE_ID__',d1Id));
console.log('[3/7] Installing Node dependencies…'); await run(process.platform==='win32'?'npm.cmd':'npm',['install']);
console.log('[4/7] Type-checking Worker…'); await run(process.platform==='win32'?'npm.cmd':'npm',['run','typecheck']);
console.log('[5/7] Deploying Worker…'); const output=await run(process.platform==='win32'?'npx.cmd':'npx',['wrangler','deploy','--config','wrangler.jsonc'],{capture:true}); const match=output.match(/https:\/\/([a-zA-Z0-9.-]+\.workers\.dev)/); if(!match)throw new Error('Worker deployed, but its workers.dev hostname could not be detected from Wrangler output. Open Workers & Pages and note the production URL.'); const workerHost=match[1];
console.log('[6/7] Applying D1 schema…'); await run(process.platform==='win32'?'npx.cmd':'npx',['wrangler','d1','execute',D1_NAME,'--remote','--file','schema/001_init.sql','--yes','--config','wrangler.jsonc']);
console.log('[7/7] Protecting /parent with Cloudflare Access…'); await ensureAccess(workerHost);
await fs.writeFile('setup-state.json',JSON.stringify({accountId,workerHost,d1Id,resources:{D1_NAME,R2_NAME,QUEUE,DLQ},configuredAt:new Date().toISOString()},null,2));
console.log(`\nBrick Phase 1 Cloudflare setup complete.\nParent dashboard: https://${workerHost}/parent\nChild API base:     https://${workerHost}\n\nThe API token was not written to disk by this installer.`);
