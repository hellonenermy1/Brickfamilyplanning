import fs from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
const state=JSON.parse(await fs.readFile('beta-setup-state.json','utf8'));
if(!/^[a-f0-9]{32}$/i.test(state.accountId??'')||!/^[a-f0-9-]{36}$/i.test(state.d1Id??''))throw Error('Verified beta account/database provenance missing');
if(state.sourceGitSha!==process.env.GITHUB_SHA||state.resources.DB!=='brick-family-beta'||state.storageMode!=='d1-chunked-no-r2'||!/^brick-family-beta\.[a-z0-9-]+\.workers\.dev$/.test(state.workerHost))throw Error('Card-free beta deployment provenance mismatch');
const origin='https://'+state.workerHost,checks=[];
for(const route of ['/parent','/parent/change-password','/parent/beta/download/apk','/parent/beta/download/manifest','/parent/api/devices']){
 const r=await fetch(origin+route,{headers:{'X-Brick-Dev-Parent-Verified':'session-v1'},redirect:'manual',signal:AbortSignal.timeout(20000)});
 if(route==='/parent/change-password'){
  if(r.status!==303||r.headers.get('Location')!=='/parent/login')throw Error('Unauthenticated account-change route must redirect only to private login');
 }else if(![302,401].includes(r.status))throw Error('Parent route not private: '+route+' HTTP '+r.status);
 checks.push({route,status:r.status,forgedHeaderDenied:true});
}
const session=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(session).digest('hex'),now=Date.now();
async function query(sql,params){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+state.accountId+'/d1/database/'+state.d1Id+'/query',{method:'POST',headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),redirect:'error',signal:AbortSignal.timeout(20000)});const b=await r.json();if(!r.ok||b.success!==true)throw Error('D1 smoke session request failed');return b.result;}
const schema=await query("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='dev_parent_credentials' LIMIT 1",[]);
if(schema?.[0]?.results?.[0]?.ok!==1)throw Error('Additive parent credential migration not present in live beta D1');
checks.push({route:'d1_parent_credential_schema',status:'PASS'});
await query('INSERT INTO dev_parent_sessions(session_hash,created_at,expires_at,revoked_at) VALUES(?1,?2,?3,NULL)',[hash,now,now+300000]);
try{
 for(const route of ['/parent','/parent/change-password','/parent/api/devices','/parent/beta/download/manifest','/parent/beta/download/apk','/parent/map/status']){
  const r=await fetch(origin+route,{headers:{Cookie:'brick_parent_dev='+session},redirect:'manual',signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Authenticated route '+route+' HTTP '+r.status);if(route==='/parent'&&!(await r.text()).includes('BETA · Test centre'))throw Error('Beta UI missing');if(route==='/parent/change-password'&&!(await r.text()).includes('name="confirm"'))throw Error('Private passphrase form missing');checks.push({route,status:r.status,authenticated:true});
 }
 const range=await fetch(origin+'/parent/map/basemap.pmtiles',{headers:{Cookie:'brick_parent_dev='+session,Range:'bytes=0-15'},redirect:'manual',signal:AbortSignal.timeout(30000)});if(range.status!==206||(await range.arrayBuffer()).byteLength!==16)throw Error('Actual map range proxy failed');checks.push({route:'map_range',status:206});
 const sampleTile=async style=>{
  const r=await fetch(origin+'/parent/map/onemap/'+style+'/11/1614/1016.png',{headers:{Cookie:'brick_parent_dev='+session},redirect:'manual',signal:AbortSignal.timeout(25000)});
  if(!r.ok)return {status:r.status,png:false};
  const b=new Uint8Array(await r.arrayBuffer());
  return {status:r.status,png:b.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v)};
 };
 const hd=await sampleTile('Default_HD');
 const standard=await sampleTile('Default');
 checks.push({route:'onemap_sample_tile',hdStatus:hd.status,standardStatus:standard.status,hdPng:hd.png,standardPng:standard.png});
 if(!hd.png&&!standard.png)throw Error('Both live OneMap tile proxy variants failed: HD HTTP '+hd.status+', standard HTTP '+standard.status);

}finally{await query('DELETE FROM dev_parent_sessions WHERE session_hash=?1',[hash]);}
const r=await fetch(origin+'/api/device/beta-unpaired/beta/readiness',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',redirect:'manual',signal:AbortSignal.timeout(20000)});if(r.status!==401)throw Error('Unsigned beta device request not denied: '+r.status);
await fs.writeFile('beta-live-verification.json',JSON.stringify({sourceSha:process.env.GITHUB_SHA,origin,storage:'D1',queues:'NONE',access:'D1_PARENT_SESSION',checks,actualParentBrowser:'PENDING',realPhoneReadiness:'PENDING',endurance72h:'NOT_STARTED'},null,2));
console.log('Verified private card-free beta portal: '+origin+'/parent');
