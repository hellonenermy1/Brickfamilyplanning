import {runStagedExternalWriter} from './staged-external-writer.mjs';
import fs from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
const state=JSON.parse(await fs.readFile('beta-setup-state.json','utf8'));
if(!/^[a-f0-9]{32}$/i.test(state.accountId??'')||!/^[a-f0-9-]{36}$/i.test(state.d1Id??''))throw Error('Verified beta account/database provenance missing');
if(process.env.GITHUB_REF_NAME!=='beta/backend-portal'||state.workerName!=='brick-family-beta'||state.storageMode!=='d1-chunked-no-r2'||state.sourceGitSha!==process.env.GITHUB_SHA||!/^brick-family-beta\.[a-z0-9-]+\.workers\.dev$/.test(state.workerHost))throw Error('Isolated beta provenance required');
await runStagedExternalWriter('publication',{sourceSha:state.sourceGitSha,accountId:state.accountId,databaseId:state.d1Id,workerName:'brick-family-beta',workerHost:state.workerHost},async()=>{
const session=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(session).digest('hex'),now=Date.now(),origin='https://'+state.workerHost;
async function query(sql,params){
 const url='https://api.cloudflare.com/client/v4/accounts/'+state.accountId+'/d1/database/'+state.d1Id+'/query';
 if(typeof process.env.CLOUDFLARE_API_TOKEN!=='string'||!process.env.CLOUDFLARE_API_TOKEN.length)throw Error('Dedicated D1 management credential required');
 const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),redirect:'error',signal:AbortSignal.timeout(20000)});
 if(r?.status!==200||!r.ok||r.redirected||r.url&&r.url!==url)throw Error('Scoped D1 session metadata unavailable');
 const b=await r.json().catch(()=>null);
 if(!b||b.success!==true||!Array.isArray(b.result))throw Error('Scoped D1 session response invalid');
 // SQL errors can be embedded inside otherwise successful API envelopes.
 if(b.result.some(x=>!x||x.success===false||!Array.isArray(x.results)))throw Error('Scoped D1 session statement unqualified');
 return b.result;
}
await query('INSERT INTO dev_parent_sessions(session_hash,created_at,expires_at,revoked_at) VALUES(?1,?2,?3,NULL)',[hash,now,now+300000]);
try{
 const bytes=await fs.readFile('beta-artifact/Brick.apk');
 const r=await fetch(origin+'/parent/beta/publish/apk',{method:'POST',headers:{Cookie:'brick_parent_dev='+session,Origin:origin,'Content-Type':'application/vnd.android.package-archive'},body:bytes,redirect:'error',signal:AbortSignal.timeout(60000)});
 if(!r.ok)throw Error('Private D1 APK publication HTTP '+r.status);
 const download=await fetch(origin+'/parent/beta/download/apk',{headers:{Cookie:'brick_parent_dev='+session},redirect:'error',signal:AbortSignal.timeout(60000)});if(!download.ok)throw Error('Private D1 APK readback HTTP '+download.status);
 const returned=Buffer.from(await download.arrayBuffer());if(!returned.equals(bytes))throw Error('D1 APK download differs from pinned signed bytes');
 console.log('PASS exact signed APK published and read back through private D1 chunk storage; no R2');
}finally{await query('DELETE FROM dev_parent_sessions WHERE session_hash=?1',[hash]);}
});
