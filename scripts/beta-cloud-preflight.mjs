import fs from 'node:fs/promises';
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!token) throw Error('Missing existing CLOUDFLARE_API_TOKEN Actions secret; no cloud requests made');
async function get(path){
 const r=await fetch('https://api.cloudflare.com/client/v4'+path,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(20000)});
 const b=await r.json().catch(()=>null);
 if(!r.ok||b?.success!==true)throw Error('Cloudflare metadata '+path.replace(/[a-f0-9]{32}/gi,'[account]')+' HTTP '+r.status+' codes '+(Array.isArray(b?.errors)?b.errors.map(x=>x.code).filter(x=>Number.isInteger(x)).join(','):'unavailable'));
 return b.result;
}
let account=process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
if(!account){const accounts=await get('/accounts?per_page=50');if(accounts.length!==1)throw Error('Set CLOUDFLARE_ACCOUNT_ID: account selection is ambiguous');account=accounts[0].id;}
if(!/^[a-f0-9]{32}$/i.test(account))throw Error('Invalid account ID');
const checks=[];
for(const [name,path] of [['workers','workers/subdomain'],['d1','d1/database?per_page=100'],['r2','r2/buckets'],['queues','queues?per_page=100'],['access','access/organizations'],['access_apps','access/apps?per_page=100']]){
 try {const result=await get('/accounts/'+account+'/'+path);if(name==='workers'&&!result?.subdomain)throw Error('Workers subdomain unavailable');checks.push({name,status:'READABLE'});}
 catch(e){checks.push({name,status:'BLOCKED',detail:e.message});}
}
await fs.writeFile('beta-cloud-preflight.json',JSON.stringify({accountId:account,sourceSha:process.env.GITHUB_SHA,checks,allReadable:checks.every(x=>x.status==='READABLE')},null,2));
console.log(JSON.stringify({checks,writePermissions:'NOT_YET_EXERCISED'}));
if(checks.some(x=>x.status==='BLOCKED'))process.exitCode=1;
